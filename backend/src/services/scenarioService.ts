/*
 * Pulse AI — scenario simulation service
 * ========================================
 * The existing hackathon scenario simulation, upgraded:
 *
 *   - Realistic medicine / hospital / supplier reference data (catalog.ts)
 *   - Five scenario types: supplier failure, demand surge, transport delay,
 *     hospital redistribution, combined disruption
 *   - Transparent impact + risk calculation (with a written reason)
 *   - A recommendation engine limited to inventory / procurement /
 *     redistribution / logistics / monitoring actions
 *
 * The demand-forecasting core is unchanged: one pooled ridge-regression ML
 * model (see mlForecast.ts) produces per-hospital × per-medicine daily
 * demand, and stock is projected day-by-day during the disruption window.
 *
 * Everything here is a prototype; nothing prescribes or doses medicines and
 * no real ordering system is assumed. Recommendations are expressed as
 * "consider / recommended action / potential response" only.
 */

import { supabase } from "../utils/supabase.js";
import {
  addDays,
  BASE_FEATURE_NAMES,
  buildBaseFeatures,
  computeMetrics,
  dateString,
  fitRidge,
  predictVector,
} from "./mlForecast.js";
import {
  CATALOG_SUPPLIERS,
  DEMO_DISCLAIMER,
  DISRUPTED_SUPPLIER_ID,
  hospitalById,
  medicineById,
  supplierById,
} from "../data/catalog.js";
import type {
  CatalogHospital,
  CatalogMedicine,
  CatalogSupplier,
} from "../data/catalog.js";

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type RiskLabel = "GREEN" | "YELLOW" | "RED" | "CRITICAL";

type ModelInfo = {
  name: string;
  featureNames: string[];
  trainRows: number;
  testRows: number;
  mlMae: number;
  baselineMae: number;
};

export type RecommendationType =
  | "reallocate"
  | "alternate_supplier"
  | "emergency_procurement"
  | "monitoring";

export type Recommendation = {
  type: RecommendationType;
  why: string;
  action: string;
  expected_impact: string;
};

export type SimulationResult = {
  /* Legacy fields (kept for the existing result cards). */
  hospital_id: number;
  medicine_id: number;
  starting_stock: number;
  safety_stock: number;
  predicted_daily_demand: number;
  risk_level: RiskLevel;
  recommendation: string;
  model?: ModelInfo;
  days: {
    day: number;
    projected_stock: number;
    status: "NORMAL" | "AT_RISK" | "STOCK_OUT";
  }[];
  stock_out_day: number | null;

  /* Realistic entity metadata. */
  hospital: CatalogHospital;
  medicine: CatalogMedicine;

  /* Disruption parameters applied to this item. */
  effective_daily_demand: number;
  disruption_window_days: number;
  supplier_disrupted: boolean;

  /* Impact. */
  projected_demand: number;
  projected_remaining_stock: number;
  days_of_stock_remaining: number;
  safety_stock_breach: boolean;
  estimated_shortage_quantity: number;

  /* Risk (transparent). */
  risk_label: RiskLabel;
  risk_reason: string;

  /* Recommendations (operational only). */
  recommendations: Recommendation[];
  redistribution?: {
    medicine_id: number;
    donor_hospital_id: number;
    donor_hospital_name: string;
    transfer_units: number;
  };
};

export type ScenarioSummary = {
  scenario: {
    id: number;
    name: string;
    description: string;
    disruption_type: string;
    duration_days: number;
    demand_change_percent: number;
    transport_delay_days: number;
  };
  disclaimer: string;
  affected_suppliers: CatalogSupplier[];
  affected_medicine_ids: number[];
  affected_hospital_ids: number[];
  headline: string;
  demand_change_label: string;
  supplier_disruption_label: string;
  projected_shortage_total: number;
  worst_risk_label: RiskLabel;
  result_counts: Record<RiskLabel, number>;
  assumptions: string[];
};

export type ScenarioResponse = {
  scenario: ScenarioSummary;
  model: ModelInfo;
  results: SimulationResult[];
};

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function oneHot(value: number, universe: number[]): number[] {
  return universe.map((id) => (id === value ? 1 : 0));
}

/* hospital × medicine interaction level (store×item) identity feature. */
function comboOneHot(
  hospitalId: number,
  medicineId: number,
  combos: Array<[number, number]>,
): number[] {
  return combos.map(([h, m]) => (h === hospitalId && m === medicineId ? 1 : 0));
}

/* Transparent risk band → level mapping. */
function mapRiskLevel(label: RiskLabel): RiskLevel {
  switch (label) {
    case "CRITICAL":
      return "CRITICAL";
    case "RED":
      return "HIGH";
    case "YELLOW":
      return "MEDIUM";
    default:
      return "LOW";
  }
}

function buildRiskReason(options: {
  label: RiskLabel;
  rate: number;
  windowDays: number;
  remaining: number;
  safety: number;
  stockOutDay: number | null;
  cause: string;
}): string {
  const { label, remaining, safety, stockOutDay, cause } = options;

  switch (label) {
    case "CRITICAL":
      return `Projected stock-out on day ${stockOutDay ?? "≤" + options.windowDays} of the ${options.windowDays}-day disruption${cause}.`;
    case "RED":
      return `Projected remaining stock (${remaining}) falls below the safety stock (${safety})${cause}.`;
    case "YELLOW":
      return `Projected remaining stock (${remaining}) approaches the safety stock (${safety}, within 1.5× threshold)${cause}.`;
    default:
      return `Projected remaining stock (${remaining}) stays comfortably above the safety stock (${safety})${cause}.`;
  }
}

function buildRecommendations(
  item: SimulationResult,
  affectedSupplier: CatalogSupplier | undefined,
): Recommendation[] {
  const medicine = item.medicine;
  const hospital = item.hospital;
  const recommendations: Recommendation[] = [];

  /* 1) Alternate supplier — when the primary supplier is unavailable. */
  if (item.supplier_disrupted && affectedSupplier) {
    const alternate = medicine.supplier_ids
      .map((id) => supplierById(id))
      .find((supplier) => supplier && supplier.supplier_id !== affectedSupplier.supplier_id);

    if (alternate) {
      recommendations.push({
        type: "alternate_supplier",
        why: `${affectedSupplier.supplier_name} (${affectedSupplier.supplier_id}) is unavailable during this ${item.disruption_window_days}-day disruption.`,
        action: `Consider activating alternate supplier ${alternate.supplier_name} (${alternate.supplier_id}, ${alternate.emergency_lead_time}-day emergency lead time) for ${medicine.generic_name}.`,
        expected_impact: `Maintains supply continuity for ${medicine.generic_name} during the disruption window.`,
      });
    }
  }

  /* 2) Emergency procurement — only when a shortage is actually projected. */
  if (item.estimated_shortage_quantity > 0) {
    recommendations.push({
      type: "emergency_procurement",
      why: `Projected stock falls ${item.estimated_shortage_quantity} ${item.medicine.unit} below the safety level by the end of the ${item.disruption_window_days}-day disruption.`,
      action: `Consider emergency procurement of approximately ${item.estimated_shortage_quantity} ${item.medicine.unit} of ${medicine.generic_name} to restore the safety buffer.`,
      expected_impact: `Restores stock to the safety level and removes the projected stock-out risk within the disruption window.`,
    });
  }

  /* 3) Monitoring — elevated risk without a confirmed shortage yet. */
  if (item.risk_label === "YELLOW" || item.risk_label === "RED") {
    recommendations.push({
      type: "monitoring",
      why: item.risk_reason,
      action: `Increase inventory monitoring frequency for ${medicine.generic_name} at ${hospital.hospital_name} until stock is replenished.`,
      expected_impact: `Earlier detection if the projection worsens during the disruption.`,
    });
  } else if (item.risk_label === "GREEN") {
    recommendations.push({
      type: "monitoring",
      why: item.risk_reason,
      action: `Continue routine inventory monitoring for ${medicine.generic_name} at ${hospital.hospital_name}.`,
      expected_impact: `Keeps the stock position visible during the disruption.`,
    });
  }

  return recommendations;
}

export async function simulateScenario(
  scenarioId: number,
): Promise<ScenarioResponse> {
  // 1. Get the scenario
  const { data: scenario, error: scenarioError } =
    await supabase
      .from("scenarios")
      .select(
        "id, name, description, disruption_type, duration_days, demand_change_percent, transport_delay_days",
      )
      .eq("id", scenarioId)
      .single();

  if (scenarioError) {
    throw new Error(
      `Scenario lookup failed: ${scenarioError.message}`,
    );
  }

  if (!scenario) {
    throw new Error("Scenario not found");
  }

  const demandChangePercent = Number(scenario.demand_change_percent ?? 0);
  const transportDelayDays = Number(scenario.transport_delay_days ?? 0);

  const disruptionType = String(scenario.disruption_type ?? "supplier_failure");

  // 2. Get inventory
  const { data: inventory, error: inventoryError } =
    await supabase
      .from("inventory")
      .select(
        "hospital_id, medicine_id, current_stock, safety_stock",
      );

  if (inventoryError) {
    throw new Error(
      `Inventory lookup failed: ${inventoryError.message}`,
    );
  }

  // 3. Get demand history (paginated — PostgREST caps a single response)
  const demandRows: { hospital_id: number; medicine_id: number; date: string; demand: number }[] = [];

  const PAGE_SIZE = 1000;
  let offset = 0;

  for (;;) {
    const { data, error } = await supabase
      .from("demand_history")
      .select("hospital_id, medicine_id, demand_date, demand")
      .order("hospital_id", { ascending: true })
      .order("medicine_id", { ascending: true })
      .order("demand_date", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      throw new Error(
        `Demand history lookup failed: ${error.message}`,
      );
    }

    if (!data || data.length === 0) {
      break;
    }

    demandRows.push(
      ...data.map((row) => ({
        hospital_id: Number(row.hospital_id),
        medicine_id: Number(row.medicine_id),
        date: String(row.demand_date).slice(0, 10),
        demand: Number(row.demand),
      })),
    );

    if (data.length < PAGE_SIZE) {
      break;
    }

    offset += PAGE_SIZE;
  }

  if (!inventory || inventory.length === 0) {
    return {
      scenario: buildSummary(
        scenario,
        [],
        [],
        [],
        [],
        {
          disruptionType,
          demandChangePercent: 0,
          transportDelayDays: 0,
          windowDays: Number(scenario.duration_days ?? 1),
          shortages: 0,
          worst: "GREEN",
          counts: { GREEN: 0, YELLOW: 0, RED: 0, CRITICAL: 0 },
        },
      ),
      model: {
        name: "No data",
        featureNames: [],
        trainRows: 0,
        testRows: 0,
        mlMae: 0,
        baselineMae: 0,
      },
      results: [],
    };
  }

  // 4. Group demand by hospital + medicine
  const demandMap = new Map<string, { date: string; demand: number }[]>();

  for (const row of demandRows) {
    const key = `${row.hospital_id}-${row.medicine_id}`;

    if (!demandMap.has(key)) {
      demandMap.set(key, []);
    }

    demandMap.get(key)!.push({
      date: row.date,
      demand: Number(row.demand),
    });
  }

  // 5. Train ONE pooled ML forecast model (Phase 3 — unchanged core)
  const combos: Array<[number, number]> = inventory
    .map((item) => [Number(item.hospital_id), Number(item.medicine_id)] as [number, number])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);

  const HOLDOUT_DAYS = 8;

  const trainRows: number[][] = [];
  const trainTargets: number[] = [];
  const testRows: number[][] = [];
  const testTargets: number[] = [];
  const baselinePred: number[] = [];

  for (const item of inventory) {
    const key = `${item.hospital_id}-${item.medicine_id}`;
    const series = demandMap.get(key) ?? [];

    if (series.length <= HOLDOUT_DAYS + 2) {
      continue;
    }

    const extra = comboOneHot(Number(item.hospital_id), Number(item.medicine_id), combos);

    const train = series.slice(0, series.length - HOLDOUT_DAYS);

    const mu = train.reduce((sum, point) => sum + point.demand, 0) / (train.length || 1);

    for (let i = 0; i < series.length; i++) {
      const isTest = i >= series.length - HOLDOUT_DAYS;
      const features = [...buildBaseFeatures(series, i), ...extra];

      if (isTest) {
        testRows.push(features);
        testTargets.push(series[i].demand);
        baselinePred.push(mu);
      } else {
        trainRows.push(features);
        trainTargets.push(series[i].demand);
      }
    }
  }

  const model = fitRidge(trainRows, trainTargets, 200, [
    ...BASE_FEATURE_NAMES,
    ...combos.map(([h, m]) => `hospital ${h} × medicine ${m}`),
  ], trainRows.length, "log1p");

  const mlMetrics = computeMetrics(
    testTargets,
    testRows.map((row) => predictVector(model, row)),
  );

  const baselineMetrics = computeMetrics(testTargets, baselinePred);

  const modelInfo: ModelInfo = {
    name: model.name,
    featureNames: model.featureNames,
    trainRows: trainRows.length,
    testRows: testRows.length,
    mlMae: mlMetrics.mae,
    baselineMae: baselineMetrics.mae,
  };

  // 6. Scenario parameters (kept additive to the existing scenario row)
  const affectedSupplier =
    disruptionType === "supplier_failure" || disruptionType === "combined"
      ? supplierById(DISRUPTED_SUPPLIER_ID)
      : undefined;

  const surgeMultiplier =
    disruptionType === "demand_surge" ||
    disruptionType === "hospital_disruption" ||
    disruptionType === "combined"
      ? 1 + demandChangePercent / 100
      : 1;

  const hasTransportDelay = transportDelayDays > 0;

  const windowDays = Math.max(
    Number(scenario.duration_days),
    hasTransportDelay ? transportDelayDays : 0,
    1,
  );

  const disruptedMedicineNames = new Set(
    affectedSupplier?.supplied_medicines ?? [],
  );

  // 7. Simulate each inventory item using the ML-based daily demand
  const results: SimulationResult[] = inventory.map((item) => {
    const hospitalId = Number(item.hospital_id);
    const medicineId = Number(item.medicine_id);

    const medicine = medicineById(medicineId) ?? {
      medicine_id: medicineId,
      generic_name: `Medicine ${medicineId}`,
      category: "Uncatalogued",
      unit: "units",
      lead_time_days: 5,
      supplier_ids: [],
      criticality: "standard" as const,
    };

    const hospital = hospitalById(hospitalId) ?? {
      hospital_id: hospitalId,
      hospital_name: `Hospital ${hospitalId}`,
      city: "",
      state: "",
      facility_type: "Healthcare facility",
      departments: [],
      bed_capacity: 0,
      emergency_available: false,
      inventory_location: "Unknown",
      supplier_ids: [],
      demonstration: true,
    };

    const key = `${item.hospital_id}-${item.medicine_id}`;
    const historicalDemand = demandMap.get(key) ?? [];

    const extra = comboOneHot(hospitalId, medicineId, combos);

    // 7-day ML forecast → predicted daily demand (moving average)
    const simulated = [...historicalDemand];
    const forecastValues: number[] = [];

    for (let day = 1; day <= 7; day++) {
      const previous = simulated[simulated.length - 1];
      const features = [
        ...buildBaseFeatures(simulated, simulated.length - 1),
        ...extra,
      ];
      const predicted = round2(predictVector(model, features));

      forecastValues.push(predicted);

      simulated.push({
        date: dateString(
          addDays(new Date(`${previous.date}T00:00:00`), 1),
        ),
        demand: predicted,
      });
    }

    const baseRate = round2(
      forecastValues.reduce((sum, value) => sum + value, 0) /
        forecastValues.length,
    );

    const supplierDisrupted =
      Boolean(affectedSupplier) &&
      disruptedMedicineNames.has(medicine.generic_name);

    const effectiveRate = round2(baseRate * surgeMultiplier);

    const startingStock = Number(item.current_stock);
    const safetyStock = Number(item.safety_stock);

    let projectedStock = startingStock;

    const days: SimulationResult["days"] = [];

    let stockOutDay: number | null = null;

    let minimumProjectedStock = projectedStock;

    // 8. Project inventory day-by-day during the disruption window
    for (let day = 1; day <= windowDays; day++) {
      projectedStock -= effectiveRate;

      minimumProjectedStock = Math.min(minimumProjectedStock, projectedStock);

      let status: "NORMAL" | "AT_RISK" | "STOCK_OUT";

      if (projectedStock <= 0) {
        projectedStock = 0;
        status = "STOCK_OUT";

        if (stockOutDay === null) {
          stockOutDay = day;
        }
      } else if (projectedStock <= safetyStock) {
        status = "AT_RISK";
      } else {
        status = "NORMAL";
      }

      days.push({
        day,
        projected_stock: round2(projectedStock),
        status,
      });
    }

    // 9. Impact calculation
    const projectedDemand = round2(effectiveRate * windowDays);

    const projectedRemaining = round2(Math.max(0, startingStock - projectedDemand));

    const daysOfStock = round2(startingStock / effectiveRate);

    const safetyBreach = projectedRemaining < safetyStock;

    const shortageUnits = Math.max(
      0,
      Math.ceil(safetyStock - projectedRemaining),
    );

    // 10. Transparent risk band
    let riskLabel: RiskLabel;

    if (stockOutDay !== null || minimumProjectedStock <= 0) {
      riskLabel = "CRITICAL";
    } else if (projectedRemaining < safetyStock) {
      riskLabel = "RED";
    } else if (projectedRemaining <= safetyStock * 1.5) {
      riskLabel = "YELLOW";
    } else {
      riskLabel = "GREEN";
    }

    const cause = supplierDisruptionCause(
      disruptionType,
      effectiveRate,
      baseRate,
      supplierDisrupted,
      affectedSupplier,
    );

    const riskReason = buildRiskReason({
      label: riskLabel,
      rate: effectiveRate,
      windowDays,
      remaining: projectedRemaining,
      safety: safetyStock,
      stockOutDay,
      cause,
    });

    const partial: SimulationResult = {
      hospital_id: hospitalId,
      medicine_id: medicineId,
      starting_stock: startingStock,
      safety_stock: safetyStock,
      predicted_daily_demand: baseRate,
      risk_level: mapRiskLevel(riskLabel),
      recommendation: "",
      model: modelInfo,
      days,
      stock_out_day: stockOutDay,

      hospital,
      medicine,

      effective_daily_demand: effectiveRate,
      disruption_window_days: windowDays,
      supplier_disrupted: supplierDisrupted,

      projected_demand: projectedDemand,
      projected_remaining_stock: projectedRemaining,
      days_of_stock_remaining: daysOfStock,
      safety_stock_breach: safetyBreach,
      estimated_shortage_quantity: shortageUnits,

      risk_label: riskLabel,
      risk_reason: riskReason,

      recommendations: [],
    };

    partial.recommendations = buildRecommendations(partial, affectedSupplier);
    partial.recommendation = partial.recommendations[0]?.action ?? "Continue routine monitoring.";

    return partial;
  });

  // 11. Redistribution pass — one facility's surplus vs another's projected shortage
  applyRedistribution(results);

  // 12. Scenario-level summary
  const affectedMedicineIds = Array.from(new Set(results.map((r) => r.medicine_id)));
  const affectedHospitalIds = Array.from(new Set(results.map((r) => r.hospital_id)));

  const counts: ScenarioSummary["result_counts"] = {
    GREEN: 0,
    YELLOW: 0,
    RED: 0,
    CRITICAL: 0,
  };

  let worst: RiskLabel = "GREEN";
  let shortageTotal = 0;

  for (const result of results) {
    counts[result.risk_label] += 1;

    if (rankLabel(result.risk_label) > rankLabel(worst)) {
      worst = result.risk_label;
    }

    shortageTotal += result.estimated_shortage_quantity;
  }

  const summary = buildSummary(
    scenario,
    affectedSupplier ? [affectedSupplier] : [],
    affectedHospitalIds,
    affectedMedicineIds,
    results,
    {
      disruptionType,
      demandChangePercent,
      transportDelayDays,
      windowDays,
      shortages: round2(shortageTotal),
      worst,
      counts,
    },
  );

  return { scenario: summary, model: modelInfo, results };
}

function rankLabel(label: RiskLabel): number {
  switch (label) {
    case "CRITICAL":
      return 4;
    case "RED":
      return 3;
    case "YELLOW":
      return 2;
    default:
      return 1;
  }
}

function supplierDisruptionCause(
  disruptionType: string,
  effectiveRate: number,
  baseRate: number,
  itemSupplierDisrupted: boolean,
  affectedSupplier: CatalogSupplier | undefined,
): string {
  switch (disruptionType) {
    case "supplier_failure":
    case "combined":
      return itemSupplierDisrupted
        ? ` because primary supplier ${affectedSupplier?.supplier_name ?? DISRUPTED_SUPPLIER_ID} is unavailable and stock cannot be resupplied`
        : "";
    case "demand_surge":
      return ` because demand during the disruption rises to ${effectiveRate}/day (from ${baseRate}/day)`;
    case "transport_delay":
      return ` because the expected delivery is delayed and existing stock must cover the delay`;
    default:
      return "";
  }
}

function applyRedistribution(results: SimulationResult[]): void {
  const byMedicine = new Map<number, SimulationResult[]>();

  for (const result of results) {
    const list = byMedicine.get(result.medicine_id) ?? [];

    list.push(result);

    byMedicine.set(result.medicine_id, list);
  }

  for (const [medicineId, items] of byMedicine) {
    const recipients = items
      .filter((item) => item.estimated_shortage_quantity > 0)
      .sort((a, b) => b.estimated_shortage_quantity - a.estimated_shortage_quantity);

    const donors = items
      .filter((item) => item.projected_remaining_stock > item.safety_stock)
      .sort((a, b) => b.projected_remaining_stock - a.projected_remaining_stock);

    for (const recipient of recipients) {
      const donor = donors.find(
        (candidate) =>
          candidate.hospital_id !== recipient.hospital_id &&
          candidate.projected_remaining_stock - candidate.safety_stock >=
            recipient.estimated_shortage_quantity,
      );

      if (!donor) {
        continue;
      }

      const transferUnits = Math.floor(
        Math.min(
          donor.projected_remaining_stock - donor.safety_stock,
          recipient.estimated_shortage_quantity,
        ),
      );

      if (transferUnits <= 0) {
        continue;
      }

      recipient.redistribution = {
        medicine_id: medicineId,
        donor_hospital_id: donor.hospital_id,
        donor_hospital_name: donor.hospital.hospital_name,
        transfer_units: transferUnits,
      };

      recipient.recommendations.unshift({
        type: "reallocate",
        why: `${recipient.hospital.hospital_name} is projected to fall ${recipient.estimated_shortage_quantity} ${recipient.medicine.unit} below the safety stock of ${recipient.medicine.generic_name}.`,
        action: `Consider transferring ${transferUnits} ${recipient.medicine.unit} of ${recipient.medicine.generic_name} from ${donor.hospital.hospital_name} to ${recipient.hospital.hospital_name}, subject to local inventory and authorization.`,
        expected_impact: `Reduces the projected shortage at ${recipient.hospital.hospital_name} if the transfer is completed.`,
      });

      donor.recommendations.unshift({
        type: "reallocate",
        why: `${donor.hospital.hospital_name} holds a projected surplus of ${round2(donor.projected_remaining_stock - donor.safety_stock)} ${donor.medicine.unit} of ${donor.medicine.generic_name}.`,
        action: `Consider releasing ${transferUnits} ${donor.medicine.unit} of ${donor.medicine.generic_name} to ${recipient.hospital.hospital_name}, subject to local inventory and authorization.`,
        expected_impact: `Balances the network position without adding procurement cost during the disruption.`,
      });
    }
  }
}

function buildSummary(
  scenario: {
    id: number;
    name: string;
    description: string | null;
    disruption_type: string | null;
    duration_days: number | null;
    demand_change_percent: number | null;
    transport_delay_days: number | null;
  },
  affectedSuppliers: CatalogSupplier[],
  affectedHospitalIds: number[],
  affectedMedicineIds: number[],
  results: SimulationResult[],
  opts: {
    disruptionType: string;
    demandChangePercent: number;
    transportDelayDays: number;
    windowDays: number;
    shortages: number;
    worst: RiskLabel;
    counts: ScenarioSummary["result_counts"];
  },
): ScenarioSummary {
  const demandChangeLabel =
    opts.demandChangePercent > 0
      ? `+${opts.demandChangePercent}%`
      : "No change";

  const supplierDisruptionLabel =
    affectedSuppliers.length > 0
      ? affectedSuppliers.map((s) => `${s.supplier_name} (${s.supplier_id}) unavailable`).join(", ")
      : opts.transportDelayDays > 0
        ? `Expected deliveries delayed by ${opts.transportDelayDays} day(s)`
        : "No supplier disruption";

  const headline = scenarioDescriptionHeadline(opts.disruptionType, opts.windowDays, opts.demandChangePercent);

  const assumptions: string[] = [
    `Stock projections assume no resupply is received during the ${opts.windowDays}-day disruption window.`,
    "Daily demand is the ML-forecast average over the next 7 days per hospital × medicine.",
    "Risk bands: GREEN = above 1.5× safety stock; YELLOW = within 1.5× of safety; RED = below safety stock; CRITICAL = projected stock-out.",
  ];

  if (affectedSuppliers.length > 0) {
    assumptions.push(`Primary supplier unavailable: ${supplierDisruptionLabel}.`);
  }

  if (opts.demandChangePercent > 0) {
    assumptions.push(`Demand-scenario multiplier applied: +${opts.demandChangePercent}%.`);
  }

  if (opts.transportDelayDays > 0) {
    assumptions.push(`Transport delay of ${opts.transportDelayDays} day(s) applies to the disruption window.`);
  }

  void affectedHospitalIds;
  void affectedMedicineIds;

  return {
    scenario: {
      id: Number(scenario.id),
      name: String(scenario.name),
      description: String(scenario.description ?? ""),
      disruption_type: String(scenario.disruption_type ?? opts.disruptionType),
      duration_days: Number(scenario.duration_days ?? opts.windowDays),
      demand_change_percent: Number(scenario.demand_change_percent ?? 0),
      transport_delay_days: Number(scenario.transport_delay_days ?? 0),
    },
    disclaimer: DEMO_DISCLAIMER,
    affected_suppliers: affectedSuppliers,
    affected_medicine_ids: affectedMedicineIds,
    affected_hospital_ids: affectedHospitalIds,
    headline,
    demand_change_label: demandChangeLabel,
    supplier_disruption_label: supplierDisruptionLabel,
    projected_shortage_total: opts.shortages,
    worst_risk_label: opts.worst,
    result_counts: opts.counts,
    assumptions,
  };
}

function scenarioDescriptionHeadline(
  disruptionType: string,
  windowDays: number,
  demandChangePercent: number,
): string {
  switch (disruptionType) {
    case "supplier_failure":
      return `Primary supplier (${DISRUPTED_SUPPLIER_ID}) unavailable for ${windowDays} day(s).`;
    case "demand_surge":
      return `Demand for selected resources increases by ${demandChangePercent}% for ${windowDays} day(s).`;
    case "transport_delay":
      return `Expected delivery is delayed, adding ${windowDays} day(s) of exposure.`;
    case "hospital_disruption":
      return `Demand at affected facilities rises by ${demandChangePercent}%; surplus stock is matched to projected shortfalls across the network.`;
    case "combined":
      return `Combined disruption: supplier failure plus a ${demandChangePercent}% demand rise over ${windowDays} day(s).`;
    default:
      return `Disruption simulated over a ${windowDays}-day window.`;
  }
}