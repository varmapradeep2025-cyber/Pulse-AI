/*
 * Pulse AI — Hospital Intelligence service
 * =========================================
 * Implements the hospital-intelligence pipeline:
 *
 *   Inventory → Demand history → ML forecast → Risk → Recommendation → Action
 *
 * The ML forecast (ridge regression, see mlForecast.ts) is trained on the full
 * hospital × medicine × time dataset. Every step is pure TypeScript so the
 * whole demo can run from seeded Supabase data OR from a deterministic
 * synthetic fallback when the database is empty.
 */

import { supabase } from "../utils/supabase.js";
import {
  addDays,
  BASE_FEATURE_NAMES,
  buildBaseFeatures,
  computeMetrics,
  dateString,
  DemandPoint,
  fitRidge,
  ForecastPoint,
  predictVector,
  seriesMean,
} from "./mlForecast.js";
import { SyntheticDataset, buildSyntheticDataset } from "./syntheticData.js";

export type RiskLevel = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export interface HospitalInfo {
  id: number;
  name: string;
}

export interface MedicineInfo {
  id: number;
  name: string;
  category: string;
  criticality: string;
  unit: string;
}

export interface InventoryItem {
  hospitalId: number;
  medicineId: number;
  currentStock: number;
  safetyStock: number;
  dailyConsumption: number;
}

export interface SeriesForecast {
  hospitalId: number;
  medicineId: number;
  currentStock: number;
  safetyStock: number;
  history: DemandPoint[];
  forecast: ForecastPoint[];
  predictedDailyDemand: number;
  meanHistoricalDemand: number;
  coverageDays: number;
  daysToStockout: number | null;
  belowSafetyDay: number | null;
  riskLevel: RiskLevel;
  recommendation: string;
  suggestedAction: string;
  suggestedOrderQty: number;
  priority: number;
}

export interface IntelligenceSummary {
  generatedAt: string;
  source: "supabase" | "synthetic-fallback";
  hospitals: HospitalInfo[];
  medicines: MedicineInfo[];
  model: {
    name: string;
    featureNames: string[];
    trainDays: number;
    trainRows: number;
    evaluationDays: number;
    ml: { mae: number; rmse: number; mape: number };
    baseline: { mae: number; rmse: number };
  };
  series: SeriesForecast[];
}

const HOLDOUT_DAYS = 8;
const HORIZON_DAYS = 7;
const RIDGE_LAMBDA = 200;

function riskSeverity(risk: RiskLevel): number {
  switch (risk) {
    case "CRITICAL":
      return 4;
    case "HIGH":
      return 3;
    case "MEDIUM":
      return 2;
    default:
      return 1;
  }
}

interface SeriesForecastContext {
  coverageDays: number;
  daysToStockout: number | null;
  belowSafetyDay: number | null;
}

function recommendationFor(
  risk: RiskLevel,
  ctx: SeriesForecastContext,
  orderQty: number,
  batchLead: number,
): string {
  switch (risk) {
    case "CRITICAL":
      return ctx.daysToStockout !== null
        ? `Emergency procurement — projected stock-out in ${ctx.daysToStockout} day(s).`
        : "Emergency procurement / immediate stock reallocation.";
    case "HIGH":
      return `Replenish urgently — stock falls below safety level in ~${Math.max(1, ctx.belowSafetyDay ?? batchLead)} day(s); order ≈ ${orderQty} units.`;
    case "MEDIUM":
      return `Plan replenishment — stock dips close to safety level within the next ${batchLead}-day lead time.`;
    default:
      return `Routine monitoring — ${ctx.coverageDays === Infinity ? "extensive" : `${ctx.coverageDays} days`} of stock cover available.`;
  }
}

function leadTimeDays(
  safetyStock: number,
  meanDemand: number,
): number {
  if (meanDemand <= 0) {
    return 5;
  }

  return Math.min(10, Math.max(2, Math.round(safetyStock / meanDemand)));
}

/* ------------------------------------------------------------------ */
/* Data loading (Supabase with synthetic fallback)                     */
/* ------------------------------------------------------------------ */

interface DemandFood {
  hospital_id: number;
  medicine_id: number;
  date: string;
  demand: number;
}

async function loadInventory(): Promise<InventoryItem[]> {
  const { data, error } = await supabase
    .from("inventory")
    .select("hospital_id, medicine_id, current_stock, safety_stock, daily_consumption");

  if (error || !data || data.length === 0) {
    return [];
  }

  return data.map((row) => ({
    hospitalId: Number(row.hospital_id),
    medicineId: Number(row.medicine_id),
    currentStock: Number(row.current_stock),
    safetyStock: Number(row.safety_stock),
    dailyConsumption: Number(row.daily_consumption ?? 0),
  }));
}

async function loadDemandHistory(): Promise<DemandFood[]> {
  const rows: DemandFood[] = [];

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

    rows.push(
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

  return rows;
}

async function loadHospitals(): Promise<HospitalInfo[]> {
  const { data, error } = await supabase.from("hospitals").select("id, name");

  if (error || !data || data.length === 0) {
    return [];
  }

  return data.map((row) => ({
    id: Number(row.id),
    name: String(row.name),
  }));
}

async function loadMedicines(): Promise<MedicineInfo[]> {
  const { data, error } = await supabase
    .from("medicines")
    .select("id, name, category, criticality, unit");

  if (error || !data || data.length === 0) {
    return [];
  }

  return data.map((row) => ({
    id: Number(row.id),
    name: String(row.name),
    category: String(row.category ?? ""),
    criticality: String(row.criticality ?? ""),
    unit: String(row.unit ?? ""),
  }));
}

/* ------------------------------------------------------------------ */
/* Forecasting pipeline                                                */
/* ------------------------------------------------------------------ */

function groupSeries(
  demandRows: DemandFood[],
): Map<string, DemandPoint[]> {
  const groups = new Map<string, DemandPoint[]>();

  for (const row of demandRows) {
    const key = `${row.hospital_id}-${row.medicine_id}`;

    const list = groups.get(key) ?? [];

    list.push({ date: row.date, demand: row.demand });

    groups.set(key, list);
  }

  for (const list of groups.values()) {
    list.sort((a, b) => a.date.localeCompare(b.date));
  }

  return groups;
}

/* hospital × medicine interaction level (store×item) identity feature. */
function comboOneHot(
  hospitalId: number,
  medicineId: number,
  combos: Array<[number, number]>,
): number[] {
  return combos.map(([h, m]) => (h === hospitalId && m === medicineId ? 1 : 0));
}

export function buildSeriesForecasts(
  inventory: InventoryItem[],
  demandRows: DemandFood[],
  hospitals: HospitalInfo[],
  medicines: MedicineInfo[],
): { model: IntelligenceSummary["model"]; series: SeriesForecast[] } {
  const groups = groupSeries(demandRows);

  const combos: Array<[number, number]> = inventory
    .map((item) => [item.hospitalId, item.medicineId] as [number, number])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);

  /* ---- Feature matrix (pooled across all hospital × medicine series) ---- */
  const trainRows: number[][] = [];
  const trainTargets: number[] = [];
  const testRows: number[][] = [];
  const testTargets: number[] = [];

  const seriesRefs: Array<{
    series: DemandPoint[];
    hospitalId: number;
    medicineId: number;
    trainMean: number;
  }> = [];

  for (const inventoryItem of inventory) {
    const key = `${inventoryItem.hospitalId}-${inventoryItem.medicineId}`;

    const series = groups.get(key);

    if (!series || series.length <= HOLDOUT_DAYS + 2) {
      continue;
    }

    const extra = comboOneHot(inventoryItem.hospitalId, inventoryItem.medicineId, combos);

    const trainMean = seriesMean(series.slice(0, series.length - HOLDOUT_DAYS));

    seriesRefs.push({
      series,
      hospitalId: inventoryItem.hospitalId,
      medicineId: inventoryItem.medicineId,
      trainMean,
    });

    for (let i = 0; i < series.length - HOLDOUT_DAYS; i++) {
      trainRows.push([...buildBaseFeatures(series, i), ...extra, 1]);
      trainTargets.push(series[i].demand);
    }

    for (
      let i = series.length - HOLDOUT_DAYS;
      i < series.length;
      i++
    ) {
      testRows.push([...buildBaseFeatures(series, i), ...extra, 1]);
      testTargets.push(series[i].demand);
    }
  }

  /* ---- Train the model ---- */
  const featureNames = [...BASE_FEATURE_NAMES, ...combos.map(([h, m]) => `hospital ${h} × medicine ${m}`)];

  const model = fitRidge(trainRows, trainTargets, RIDGE_LAMBDA, featureNames, trainRows.length, "log1p");

  /* ---- Holdout evaluation: model vs Phase-1 average baseline ---- */
  const mlPred = testRows.map((row) => predictVector(model, row));

  const baselinePred: number[] = [];

  for (let r = 0; r < seriesRefs.length; r++) {
    for (let day = 0; day < HOLDOUT_DAYS; day++) {
      baselinePred.push(seriesRefs[r].trainMean);
    }
  }

  const mlMetrics = computeMetrics(testTargets, mlPred);
  const baselineMetrics = computeMetrics(testTargets, baselinePred);

  /* ---- Per-series 7-day forecast + risk ---- */
  const series: SeriesForecast[] = [];

  for (const ref of seriesRefs) {
    const inventoryItem = inventory.find(
      (item) =>
        item.hospitalId === ref.hospitalId &&
        item.medicineId === ref.medicineId,
    );

    if (!inventoryItem) {
      continue;
    }

    const extra = comboOneHot(ref.hospitalId, ref.medicineId, combos);

    const simulated = [...ref.series];
    const forecast: ForecastPoint[] = [];

    for (let day = 1; day <= HORIZON_DAYS; day++) {
      const previous = simulated[simulated.length - 1];

      const features = [
        ...buildBaseFeatures(simulated, simulated.length),
        ...extra,
      ];

      const predicted = Math.round(predictVector(model, features));

      const predictedPoint = {
        date: dateString(addDays(new Date(`${previous.date}T00:00:00Z`), 1)),
        predicted,
      };

      forecast.push(predictedPoint);

      simulated.push({ date: predictedPoint.date, demand: predicted });
    }

    const predictedDailyDemand = Math.round(
      forecast.reduce((sum, point) => sum + point.predicted, 0) / forecast.length,
    );

    const meanHistorical = Math.round(seriesMean(ref.series));

    /* ---- Risk / stock projection ---- */
    let projected = inventoryItem.currentStock;

    let daysToStockout: number | null = null;
    let belowSafetyDay: number | null = null;

    let minimumProjected = projected;

    const coverageDays = predictedDailyDemand > 0
      ? Number((inventoryItem.currentStock / predictedDailyDemand).toFixed(1))
      : Infinity;

    for (let day = 1; day <= HORIZON_DAYS; day++) {
      projected -= forecast[day - 1].predicted;

      minimumProjected = Math.min(minimumProjected, projected);

      if (belowSafetyDay === null && projected < inventoryItem.safetyStock) {
        belowSafetyDay = day;
      }

      if (projected <= 0 && daysToStockout === null) {
        daysToStockout = day;
      }
    }

    const batchLead = leadTimeDays(inventoryItem.safetyStock, predictedDailyDemand);

    let riskLevel: RiskLevel;

    if (daysToStockout !== null || minimumProjected <= 0) {
      riskLevel = "CRITICAL";
    } else if (minimumProjected < inventoryItem.safetyStock) {
      riskLevel = "HIGH";
    } else if (minimumProjected <= inventoryItem.safetyStock * 1.5) {
      riskLevel = "MEDIUM";
    } else {
      riskLevel = "LOW";
    }

    /* Planned order quantity: enough to cover the procurement lead time. */
    const suggestedOrderQty = Math.max(
      1,
      Math.ceil(predictedDailyDemand * batchLead),
    );

    const recommendation = recommendationFor(
      riskLevel,
      {
        coverageDays,
        daysToStockout,
        belowSafetyDay,
      },
      suggestedOrderQty,
      batchLead,
    );

    series.push({
      hospitalId: ref.hospitalId,
      medicineId: ref.medicineId,
      currentStock: inventoryItem.currentStock,
      safetyStock: inventoryItem.safetyStock,
      history: ref.series.slice(-30),
      forecast,
      predictedDailyDemand,
      meanHistoricalDemand: meanHistorical,
      coverageDays,
      daysToStockout,
      belowSafetyDay,
      riskLevel,
      recommendation,
      suggestedAction: recommendation,
      suggestedOrderQty,
      priority: 0,
    });
  }

  /* ---- Priority ranking: "which needs attention first" ---- */
  const ranked = [...series];

  ranked.sort((a, b) => {
    const severityDifference = riskSeverity(b.riskLevel) - riskSeverity(a.riskLevel);

    if (severityDifference !== 0) {
      return severityDifference;
    }

    const aDays = a.daysToStockout ?? 999;
    const bDays = b.daysToStockout ?? 999;

    if (aDays !== bDays) {
      return aDays - bDays;
    }

    return b.suggestedOrderQty - a.suggestedOrderQty;
  });

  ranked.forEach((item, index) => {
    item.priority = index + 1;
  });

  return {
    model: {
      name: model.name,
      featureNames: featureNames,
      trainDays: trainRows.length,
      trainRows: trainRows.length,
      evaluationDays: testRows.length,
      ml: mlMetrics,
      baseline: {
        mae: baselineMetrics.mae,
        rmse: baselineMetrics.rmse,
      },
    },
    series: ranked,
  };
}

/* ------------------------------------------------------------------ */
/* Public entry point                                                  */
/* ------------------------------------------------------------------ */

export async function buildIntelligenceSummary(): Promise<IntelligenceSummary> {
  let hospitals = await loadHospitals();
  let medicines = await loadMedicines();
  let inventory = await loadInventory();
  let demandRows = await loadDemandHistory();

  let source: IntelligenceSummary["source"] = "supabase";

  if (
    hospitals.length === 0 ||
    medicines.length === 0 ||
    inventory.length === 0 ||
    demandRows.length === 0
  ) {
    const synthetic: SyntheticDataset = buildSyntheticDataset();

    source = "synthetic-fallback";

    hospitals = synthetic.hospitals;
    medicines = synthetic.medicines;
    inventory = synthetic.inventory.map((item) => ({
      hospitalId: item.hospital_id,
      medicineId: item.medicine_id,
      currentStock: item.current_stock,
      safetyStock: item.safety_stock,
      dailyConsumption: item.daily_consumption,
    }));
    demandRows = synthetic.demandRows;
  }

  const { model, series } = buildSeriesForecasts(
    inventory,
    demandRows,
    hospitals,
    medicines,
  );

  return {
    generatedAt: new Date().toISOString(),
    source,
    hospitals,
    medicines,
    model,
    series,
  };
}