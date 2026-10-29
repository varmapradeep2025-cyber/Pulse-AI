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
import {
  defaultScenarioForId,
  isSupportedDisruptionType,
  supportedScenarioIds,
} from "../data/defaultScenarios.js";
import type { ScenarioDefinition } from "../data/defaultScenarios.js";
import { buildSyntheticDataset } from "./syntheticData.js";
import {
  loadOperationalDataset,
  type OperationalDataset,
  type OperationalProvenance,
  type OperationalScope,
} from "./operationalData.js";

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

export type ScenarioDataSource = "supabase" | "demo";

export type ScenarioResponse = {
  scenario: ScenarioSummary;
  model: ModelInfo;
  results: SimulationResult[];
  source: ScenarioDataSource;
  dataProvenance: OperationalProvenance;
};

export interface ScenarioSimulationOptions {
  scope?: OperationalScope;
}

export type ScenarioRecord = {
  id: number;
  name: string;
  description: string | null;
  disruption_type: string | null;
  duration_days: number | null;
  demand_change_percent: number | null;
  transport_delay_days: number | null;
};

export type ScenarioInventoryRow = {
  hospital_id: number;
  medicine_id: number;
  current_stock: number;
  safety_stock: number;
};

export type ScenarioDemandRow = {
  hospital_id: number;
  medicine_id: number;
  date: string;
  demand: number;
};

export interface ScenarioDataProvider {
  loadScenario(id: number): Promise<ScenarioRecord | null>;
  loadInventory(): Promise<ScenarioInventoryRow[]>;
  loadDemandHistory(): Promise<ScenarioDemandRow[]>;
  loadProvenance?(): Promise<OperationalProvenance>;
}

export class ScenarioError extends Error {
  readonly status: number;
  readonly publicMessage: string;

  constructor(status: number, publicMessage: string, internalMessage?: string) {
    super(internalMessage ?? publicMessage);
    this.name = "ScenarioError";
    this.status = status;
    this.publicMessage = publicMessage;
  }
}

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

function numberOr(value: unknown, fallback: number): number {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseScenarioId(value: unknown): number {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : Number.NaN;

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ScenarioError(
      400,
      "scenarioId must be a positive integer.",
    );
  }

  return parsed;
}

function scenarioFromRecord(record: ScenarioRecord): ScenarioDefinition {
  const id = Number(record.id);
  const disruptionType = String(record.disruption_type ?? "");

  if (!isSupportedDisruptionType(disruptionType)) {
    throw new ScenarioError(
      400,
      `Scenario ${id} uses an unsupported disruption type.`,
    );
  }

  const durationDays = numberOr(record.duration_days, 1);

  return {
    id,
    name: String(record.name || `Scenario ${id}`),
    description: String(record.description ?? ""),
    disruption_type: disruptionType,
    duration_days: durationDays > 0 ? durationDays : 1,
    demand_change_percent: numberOr(record.demand_change_percent, 0),
    transport_delay_days: Math.max(
      0,
      numberOr(record.transport_delay_days, 0),
    ),
  };
}

function scenarioForId(id: number): ScenarioDefinition {
  const fallback = defaultScenarioForId(id);

  if (fallback) {
    return fallback;
  }

  throw new ScenarioError(
    404,
    `Scenario ${id} was not found. Demo scenario IDs are ${supportedScenarioIds().join(", ")}.`,
  );
}

function asDataAccessError(
  operation: string,
  error: unknown,
): ScenarioError {
  if (error instanceof ScenarioError) {
    return error;
  }

  const detail = error instanceof Error ? error.message : String(error);

  return new ScenarioError(
    503,
    "Scenario data is temporarily unavailable. Please try again.",
    `${operation}: ${detail}`,
  );
}

function buildDemoScenarioData(): {
  inventory: ScenarioInventoryRow[];
  demandRows: ScenarioDemandRow[];
} {
  const dataset = buildSyntheticDataset();

  return {
    inventory: dataset.inventory.map((item) => ({
      hospital_id: item.hospital_id,
      medicine_id: item.medicine_id,
      current_stock: item.current_stock,
      safety_stock: item.safety_stock,
    })),
    demandRows: dataset.demandRows,
  };
}

async function scenarioDb() {
  const { supabase } = await import("../utils/supabase.js");

  return supabase;
}

function createDefaultScenarioDataProvider(
  scope?: OperationalScope,
): ScenarioDataProvider {
  let datasetPromise: Promise<OperationalDataset> | null = null;

  const dataset = () => {
    datasetPromise ??= loadOperationalDataset(scope);

    return datasetPromise;
  };

  return {
    async loadScenario(id) {
      const supabase = await scenarioDb();

      const { data, error } = await supabase
        .from("scenarios")
        .select(
          "id, name, description, disruption_type, duration_days, demand_change_percent, transport_delay_days",
        )
        .eq("id", id)
        .maybeSingle();

      if (error) {
        throw new Error(`Scenario lookup failed: ${error.message}`);
      }

      return (data as ScenarioRecord | null) ?? null;
    },

    async loadInventory() {
      const loaded = await dataset();

      return loaded.inventory.map((item) => ({
        hospital_id: item.hospital_id,
        medicine_id: item.medicine_id,
        current_stock: item.current_stock,
        safety_stock: item.safety_stock,
      }));
    },

    async loadDemandHistory() {
      const loaded = await dataset();

      return loaded.demandRows;
    },

    async loadProvenance() {
      const loaded = await dataset();

      return loaded.provenance;
    },
  };
}

export async function simulateScenario(
  scenarioId: unknown,
  provider?: ScenarioDataProvider,
  options: ScenarioSimulationOptions = {},
): Promise<ScenarioResponse> {
  const id = parseScenarioId(scenarioId);
  const usingDefaultProvider = provider === undefined;
  const dataProvider =
    provider ?? createDefaultScenarioDataProvider(options.scope);
  let source: ScenarioDataSource = "supabase";
  let provenance: OperationalProvenance = "legacy";
  let scenarioRecord: ScenarioRecord | null;

  try {
    scenarioRecord = await dataProvider.loadScenario(id);
  } catch (error) {
    throw asDataAccessError("Scenario lookup", error);
  }

  const scenario = scenarioRecord
    ? scenarioFromRecord(scenarioRecord)
    : scenarioForId(id);

  let inventory: ScenarioInventoryRow[];

  try {
    inventory = await dataProvider.loadInventory();
  } catch (error) {
    throw asDataAccessError("Inventory lookup", error);
  }

  let demandRows: ScenarioDemandRow[];

  try {
    demandRows = await dataProvider.loadDemandHistory();
  } catch (error) {
    throw asDataAccessError("Demand history lookup", error);
  }

  if (dataProvider.loadProvenance) {
    try {
      provenance = await dataProvider.loadProvenance();
    } catch (error) {
      throw asDataAccessError("Data provenance lookup", error);
    }
  }

  if (inventory.length === 0 || demandRows.length === 0) {
    if (usingDefaultProvider) {
      inventory = [];
      demandRows = [];
    } else {
      const demo = buildDemoScenarioData();

      inventory = demo.inventory;
      demandRows = demo.demandRows;
      provenance = "synthetic";
    }
  }

  if (provenance === "synthetic") {
    source = "demo";
  }

  const demandChangePercent = scenario.demand_change_percent;
  const transportDelayDays = scenario.transport_delay_days;
  const disruptionType = scenario.disruption_type;

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
        ...buildBaseFeatures(simulated, simulated.length),
        ...extra,
      ];
      const predicted = round2(predictVector(model, features));

      forecastValues.push(predicted);

      simulated.push({
        date: dateString(
          addDays(new Date(`${previous.date}T00:00:00Z`), 1),
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

  switch (provenance) {
    case "imported-real":
      summary.assumptions.push(
        "Data source: imported real inventory_daily_reports records; values are shown exactly as imported.",
      );
      break;
    case "imported-synthetic":
      summary.assumptions.push(
        "Data source: imported inventory_daily_reports records explicitly marked as synthetic demo data.",
      );
      break;
    case "legacy":
      summary.assumptions.push(
        "Data source: seeded legacy inventory and demand_history records.",
      );
      break;
    case "synthetic":
      summary.assumptions.push(
        "Data source: deterministic synthetic demo inventory and demand; these are not live hospital records.",
      );
      break;
  }

  return {
    source,
    scenario: summary,
    model: modelInfo,
    results,
    dataProvenance: provenance,
  };
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

function refreshRiskAfterTransfer(
  item: SimulationResult,
  transferUnits: number,
): void {
  item.projected_remaining_stock = round2(
    item.projected_remaining_stock + transferUnits,
  );

  let stockOutDay: number | null = null;

  for (const day of item.days) {
    day.projected_stock = round2(day.projected_stock + transferUnits);

    if (day.projected_stock <= 0) {
      day.status = "STOCK_OUT";

      if (stockOutDay === null) {
        stockOutDay = day.day;
      }
    } else if (day.projected_stock <= item.safety_stock) {
      day.status = "AT_RISK";
    } else {
      day.status = "NORMAL";
    }
  }

  item.stock_out_day = stockOutDay;
  item.safety_stock_breach =
    item.projected_remaining_stock < item.safety_stock;
  item.estimated_shortage_quantity = Math.max(
    0,
    Math.ceil(item.safety_stock - item.projected_remaining_stock),
  );
  item.days_of_stock_remaining =
    item.effective_daily_demand > 0
      ? round2(
          Math.max(0, item.projected_remaining_stock) /
            item.effective_daily_demand,
        )
      : item.days_of_stock_remaining;

  if (stockOutDay !== null) {
    item.risk_label = "CRITICAL";
  } else if (item.projected_remaining_stock < item.safety_stock) {
    item.risk_label = "RED";
  } else if (item.projected_remaining_stock <= item.safety_stock * 1.5) {
    item.risk_label = "YELLOW";
  } else {
    item.risk_label = "GREEN";
  }

  item.risk_level = mapRiskLevel(item.risk_label);
  item.risk_reason = buildRiskReason({
    label: item.risk_label,
    rate: item.effective_daily_demand,
    windowDays: item.disruption_window_days,
    remaining: item.projected_remaining_stock,
    safety: item.safety_stock,
    stockOutDay,
    cause: " after the recommended redistribution is completed",
  });
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

    for (const recipient of recipients) {
      const shortageBeforeTransfer = recipient.estimated_shortage_quantity;

      const donor = items.find(
        (candidate) =>
          candidate.hospital_id !== recipient.hospital_id &&
          candidate.projected_remaining_stock - candidate.safety_stock >=
            shortageBeforeTransfer,
      );

      if (!donor) {
        continue;
      }

      const surplusBeforeTransfer = round2(
        donor.projected_remaining_stock - donor.safety_stock,
      );
      const transferUnits = Math.floor(
        Math.min(surplusBeforeTransfer, shortageBeforeTransfer),
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

      refreshRiskAfterTransfer(donor, -transferUnits);
      refreshRiskAfterTransfer(recipient, transferUnits);

      recipient.recommendations.unshift({
        type: "reallocate",
        why: `${recipient.hospital.hospital_name} is projected to fall ${shortageBeforeTransfer} ${recipient.medicine.unit} below the safety stock of ${recipient.medicine.generic_name}.`,
        action: `Consider transferring ${transferUnits} ${recipient.medicine.unit} of ${recipient.medicine.generic_name} from ${donor.hospital.hospital_name} to ${recipient.hospital.hospital_name}, subject to local inventory and authorization.`,
        expected_impact: `Reduces the projected shortage at ${recipient.hospital.hospital_name} to ${recipient.estimated_shortage_quantity} ${recipient.medicine.unit} and updates its risk projection if the transfer is completed.`,
      });

      donor.recommendations.unshift({
        type: "reallocate",
        why: `${donor.hospital.hospital_name} holds a projected surplus of ${surplusBeforeTransfer} ${donor.medicine.unit} of ${donor.medicine.generic_name}.`,
        action: `Consider releasing ${transferUnits} ${donor.medicine.unit} of ${donor.medicine.generic_name} to ${recipient.hospital.hospital_name}, subject to local inventory and authorization.`,
        expected_impact: `Leaves ${round2(donor.projected_remaining_stock - donor.safety_stock)} ${donor.medicine.unit} above the donor safety stock without adding procurement cost.`,
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