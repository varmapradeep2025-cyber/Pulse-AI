/*
 * Pulse AI — Hospital intelligence (frontend module)
 * ==================================================
 * Renders the hospital-intelligence pipeline:
 *
 *   Inventory → Demand history → ML forecast → Risk → Recommendation → Action
 *
 * The page prefers the backend ML engine (`GET /api/intelligence/summary`,
 * trained on the seeded Supabase data). When the backend is not reachable it
 * falls back to an identical local ML engine that runs entirely in the browser
 * on deterministic synthetic data, so the demo always works.
 *
 * All data shown here is demo/synthetic except when the backend reports it is
 * reading from Supabase. Nothing here is medical advice.
 */

import { API_BASE_URL, accessToken, authHeaders } from "../lib/api";
import {
  addDaysUtc,
  buildBaseFeatures,
  dateFromString,
  seriesMean,
  toDateString,
} from "./forecastFeatures";
import type { DemandPoint, ForecastPoint } from "./forecastFeatures";

export type { DemandPoint, ForecastPoint } from "./forecastFeatures";

export type RiskLevel = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
export type DataProvenance =
  | "imported-real"
  | "imported-synthetic"
  | "legacy"
  | "synthetic";

export interface SeriesForecast {
  priority: number;
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
}

export interface IntelligenceSummary {
  generatedAt: string;
  source: "supabase" | "synthetic-fallback" | "local";
  provenance: DataProvenance;
  dataAsOf: string | null;
  hospitals: { id: number; name: string }[];
  medicines: {
    id: number;
    name: string;
    category: string;
    criticality: string;
    unit: string;
  }[];
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
  online: boolean;
}

class IntelligenceAuthError extends Error {
  constructor() {
    super("Your session is invalid or has expired. Sign in again.");
    this.name = "IntelligenceAuthError";
  }
}
/* ------------------------------------------------------------------ */
/* Online: backend ML engine with offline fallback                     */
/* ------------------------------------------------------------------ */

export async function loadHospitalIntelligence(): Promise<IntelligenceSummary> {
  const token = await accessToken();

  if (!token) {
    throw new IntelligenceAuthError();
  }

  const controller = new AbortController();

  const timeoutId = window.setTimeout(() => controller.abort(), 4500);

  try {
    const response = await fetch(`${API_BASE_URL}/api/intelligence/summary`, {
      cache: "no-store",
      signal: controller.signal,
      headers: await authHeaders(),
    });

    if (response.status === 401) {
      throw new IntelligenceAuthError();
    }

    if (!response.ok) {
      throw new Error(`Backend unavailable (${response.status}).`);
    }

    const payload = (await response.json()) as {
      success: boolean;
      summary: Omit<IntelligenceSummary, "online">;
    };

    if (!payload.success || !payload.summary) {
      throw new Error("Backend returned no summary.");
    }

    return { ...payload.summary, online: true };
  } catch (error) {
    if (error instanceof IntelligenceAuthError) {
      throw error;
    }

    return { ...(await getLocalIntelligence()), online: false };
  } finally {
    window.clearTimeout(timeoutId);
  }
}

/* ------------------------------------------------------------------ */
/* Local ML engine (deterministic, mirrors the backend implementation) */
/* ------------------------------------------------------------------ */

const BASE_FEATURE_NAMES = [
  "lag1 (yesterday)",
  "lag7 (last week)",
  "rolling mean 7d",
  "rolling mean 14d",
  "trend (time)",
  "is weekend",
  "month (sin)",
  "month (cos)",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

const HOLDOUT_DAYS = 8;
const HORIZON_DAYS = 7;
const RIDGE_LAMBDA = 200;

/* mulberry32 — deterministic PRNG so the local dataset is reproducible. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;

    let t = state;

    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const HOSPITAL_NAMES = [
  "City General Hospital",
  "District Civil Hospital",
  "Rural Community Health Centre",
  "Urban Primary Health Centre",
  "Mother & Child Care Hospital",
];

const MEDICINE_DEFS: Array<[string, string, string]> = [
  ["Insulin", "Diabetes", "vials"],
  ["Paracetamol", "Pain & Fever", "tablets"],
  ["Amoxicillin", "Antibiotics", "capsules"],
  ["ORS Sachets", "Rehydration", "sachets"],
  ["Iron + Folic Acid", "Maternal & Child", "tablets"],
  ["Amlodipine", "Hypertension", "tablets"],
  ["Salbutamol Inhaler", "Respiratory", "inhalers"],
  ["Normal Saline 0.9%", "Infusion", "bottles"],
  ["Metformin", "Diabetes", "tablets"],
  ["Ceftriaxone Injection", "Antibiotics", "vials"],
];

const DAY_OF_WEEK = [0.62, 0.8, 0.95, 1.0, 1.08, 0.92, 0.7];

interface LocalInventory {
  hospitalId: number;
  medicineId: number;
  currentStock: number;
  safetyStock: number;
  dailyConsumption: number;
}

async function buildLocalSummary(): Promise<Omit<IntelligenceSummary, "online">> {
  const rand = mulberry32(20260924);

  const hospitals = HOSPITAL_NAMES.map((name, index) => ({
    id: index + 1,
    name,
  }));

  const medicines = MEDICINE_DEFS.map((defs, index) => ({
    id: index + 1,
    name: defs[0],
    category: defs[1],
    criticality: index % 3 === 0 ? "critical" : "normal",
    unit: defs[2],
  }));

  const inventory: LocalInventory[] = [];
  const demandRows: Array<{ hospitalId: number; medicineId: number; point: DemandPoint }> = [];

  const end = new Date(Date.UTC(2026, 8, 22));

  const seriesMap = new Map<string, DemandPoint[]>();

  for (const hospital of hospitals) {
    const scale = 12 + hospital.id * 6;

    for (const medicine of medicines) {
      const base = 8 + ((medicine.id * 13 + hospital.id * 7) % 24);

      const mean = Math.max(4, base * (scale / 26));

      const safetyStock = Math.round(mean * 4.5);

      const currentStock = Math.round(
        Math.max(safetyStock, mean * (8 + rand() * 20)),
      );

      inventory.push({
        hospitalId: hospital.id,
        medicineId: medicine.id,
        currentStock,
        safetyStock,
        dailyConsumption: Number(mean.toFixed(2)),
      });

      const key = `${hospital.id}-${medicine.id}`;

      const series: DemandPoint[] = [];

      for (let dayOffset = 364; dayOffset >= 0; dayOffset--) {
        const date = new Date(end);

        date.setUTCDate(date.getUTCDate() - dayOffset);

        const weekday = date.getUTCDay();

        const month = date.getUTCMonth();

        const seasonal = 1 + 0.18 * Math.sin((2 * Math.PI * month) / 12 + 0.6);

        const trend = 1 + 0.002 * (dayOffset / 7);

        const noise = 0.75 + rand() * 0.5;

        const spike = rand() < 0.04 ? 1.6 : 1;

        const demand = Math.max(
          1,
          Math.round(
            mean * DAY_OF_WEEK[weekday] * seasonal * trend * noise * spike,
          ),
        );

        series.push({
          date: date.toISOString().split("T")[0],
          demand,
        });
      }

      seriesMap.set(key, series);

      for (const point of series) {
        demandRows.push({ hospitalId: hospital.id, medicineId: medicine.id, point });
      }
    }
  }

  return forecastFromData(inventory, demandRows, hospitals, medicines);
}

/* ------------------------------------------------------------------ */
/* Shared forecasting pipeline (mirrors backend/services/mlForecast)   */
/* ------------------------------------------------------------------ */

function solveLinear(matrix: number[][], vector: number[]): number[] {
  const n = vector.length;

  const a = matrix.map((row) => [...row]);
  const b = [...vector];

  for (let col = 0; col < n; col++) {
    let maxRow = col;
    let maxValue = Math.abs(a[col][col]);

    for (let row = col + 1; row < n; row++) {
      const value = Math.abs(a[row][col]);

      if (value > maxValue) {
        maxValue = value;
        maxRow = row;
      }
    }

    if (maxValue < 1e-12) {
      continue;
    }

    if (maxRow !== col) {
      [a[col], a[maxRow]] = [a[maxRow], a[col]];
      [b[col], b[maxRow]] = [b[maxRow], b[col]];
    }

    const pivot = a[col][col];

    for (let row = col + 1; row < n; row++) {
      const factor = a[row][col] / pivot;

      for (let c = col; c < n; c++) {
        a[row][c] -= factor * a[col][c];
      }

      b[row] -= factor * b[col];
    }
  }

  const x = new Array<number>(n).fill(0);

  for (let row = n - 1; row >= 0; row--) {
    let total = b[row];

    for (let c = row + 1; c < n; c++) {
      total -= a[row][c] * x[c];
    }

    x[row] = total / (a[row][row] || 1);
  }

  return x;
}

interface TrainedModel {
  weights: number[];
  means: number[];
  scales: number[];
}

function fitRidge(
  rows: number[][],
  targets: number[],
  lambda: number,
): TrainedModel {
  const featureWidth = rows[0]?.length ?? 0;

  const means = new Array<number>(featureWidth - 1).fill(0);
  const scales = new Array<number>(featureWidth - 1).fill(1);

  for (const row of rows) {
    for (let f = 0; f < featureWidth - 1; f++) {
      means[f] += row[f];
    }
  }

  for (let f = 0; f < featureWidth - 1; f++) {
    means[f] /= rows.length;
  }

  for (const row of rows) {
    for (let f = 0; f < featureWidth - 1; f++) {
      const diff = row[f] - means[f];

      scales[f] += diff * diff;
    }
  }

  for (let f = 0; f < featureWidth - 1; f++) {
    scales[f] = Math.sqrt(scales[f] / rows.length) || 1;
  }

  const design = rows.map((row) => {
    const normalized = row.slice(0, -1).map(
      (value, f) => (value - means[f]) / scales[f],
    );

    normalized.push(1);

    return normalized;
  });

  const gram = Array.from({ length: featureWidth }, () =>
    new Array<number>(featureWidth).fill(0),
  );

  const rhs = new Array<number>(featureWidth).fill(0);

  const transformedTargets = targets.map((value) =>
    Math.log1p(Math.max(0, value)),
  );

  for (const row of design) {
    for (let i = 0; i < featureWidth; i++) {
      for (let j = 0; j < featureWidth; j++) {
        gram[i][j] += row[i] * row[j];
      }
    }
  }

  for (let i = 0; i < featureWidth; i++) {
    gram[i][i] += lambda;
  }

  for (let r = 0; r < rows.length; r++) {
    for (let i = 0; i < featureWidth; i++) {
      rhs[i] += design[r][i] * transformedTargets[r];
    }
  }

  return { weights: solveLinear(gram, rhs), means, scales };
}

function predictVector(model: TrainedModel, rawFeatures: number[]): number {
  const width = model.weights.length;

  const normalized = new Array<number>(width - 1);

  for (let f = 0; f < width - 1; f++) {
    normalized[f] = (rawFeatures[f] - model.means[f]) / model.scales[f];
  }

  normalized.push(1);

  let total = 0;

  for (let i = 0; i < width; i++) {
    total += normalized[i] * model.weights[i];
  }

  return Math.expm1(total);
}

function computeMetrics(actuals: number[], predictions: number[]) {
  let sumAbs = 0;
  let sumSq = 0;
  let sumPct = 0;

  for (let i = 0; i < actuals.length; i++) {
    const error = predictions[i] - actuals[i];

    sumAbs += Math.abs(error);
    sumSq += error * error;
    sumPct += actuals[i] === 0 ? 0 : Math.abs(error) / actuals[i];
  }

  return {
    mae: Number((sumAbs / actuals.length).toFixed(2)),
    rmse: Number(Math.sqrt(sumSq / actuals.length).toFixed(2)),
    mape: Number((sumPct / actuals.length * 100).toFixed(1)),
  };
}

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

function leadTimeDays(safetyStock: number, meanDemand: number): number {
  if (meanDemand <= 0) {
    return 5;
  }

  return Math.min(10, Math.max(2, Math.round(safetyStock / meanDemand)));
}

function forecastFromData(
  inventory: LocalInventory[],
  demandRows: Array<{ hospitalId: number; medicineId: number; point: DemandPoint }>,
  hospitals: { id: number; name: string }[],
  medicines: { id: number; name: string; category: string; criticality: string; unit: string }[],
): Omit<IntelligenceSummary, "online"> {
  const groups = new Map<string, DemandPoint[]>();

  for (const row of demandRows) {
    const key = `${row.hospitalId}-${row.medicineId}`;

    const list = groups.get(key) ?? [];

    list.push(row.point);

    groups.set(key, list);
  }

  for (const list of groups.values()) {
    list.sort((a, b) => a.date.localeCompare(b.date));
  }

  const combos: Array<[number, number]> = inventory
    .map((item) => [item.hospitalId, item.medicineId] as [number, number])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);

  function comboOneHot(hospitalId: number, medicineId: number): number[] {
    return combos.map(([h, m]) => (h === hospitalId && m === medicineId ? 1 : 0));
  }

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

  for (const item of inventory) {
    const series = groups.get(`${item.hospitalId}-${item.medicineId}`);

    if (!series || series.length <= HOLDOUT_DAYS + 2) {
      continue;
    }

    const extra = comboOneHot(item.hospitalId, item.medicineId);

    seriesRefs.push({
      series,
      hospitalId: item.hospitalId,
      medicineId: item.medicineId,
      trainMean: seriesMean(series.slice(0, series.length - HOLDOUT_DAYS)),
    });

    for (let i = 0; i < series.length - HOLDOUT_DAYS; i++) {
      trainRows.push([...buildBaseFeatures(series, i), ...extra, 1]);
      trainTargets.push(series[i].demand);
    }

    for (let i = series.length - HOLDOUT_DAYS; i < series.length; i++) {
      testRows.push([...buildBaseFeatures(series, i), ...extra, 1]);
      testTargets.push(series[i].demand);
    }
  }

  const model = fitRidge(trainRows, trainTargets, RIDGE_LAMBDA);

  const mlPred = testRows.map((row) => predictVector(model, row));

  const baselinePred: number[] = [];

  for (const ref of seriesRefs) {
    for (let day = 0; day < HOLDOUT_DAYS; day++) {
      baselinePred.push(ref.trainMean);
    }
  }

  const mlMetrics = computeMetrics(testTargets, mlPred);
  const baselineMetrics = computeMetrics(testTargets, baselinePred);

  const series: SeriesForecast[] = [];

  for (const ref of seriesRefs) {
    const item = inventory.find(
      (entry) =>
        entry.hospitalId === ref.hospitalId &&
        entry.medicineId === ref.medicineId,
    );

    if (!item) {
      continue;
    }

    const extra = comboOneHot(ref.hospitalId, ref.medicineId);

    const simulated = [...ref.series];
    const forecast: ForecastPoint[] = [];

    for (let day = 1; day <= HORIZON_DAYS; day++) {
      const previous = simulated[simulated.length - 1];

      const predicted = Math.round(
        predictVector(model, [
          ...buildBaseFeatures(simulated, simulated.length),
          ...extra,
        ]),
      );

      const point = {
        date: toDateString(addDaysUtc(dateFromString(previous.date), 1)),
        predicted,
      };

      forecast.push(point);

      simulated.push({ date: point.date, demand: predicted });
    }

    const predictedDailyDemand = Math.round(
      forecast.reduce((sum, point) => sum + point.predicted, 0) / forecast.length,
    );

    const meanHistorical = Math.round(seriesMean(ref.series));

    let projected = item.currentStock;

    let daysToStockout: number | null = null;
    let belowSafetyDay: number | null = null;

    let minimumProjected = projected;

    const coverageDays =
      predictedDailyDemand > 0
        ? Number((item.currentStock / predictedDailyDemand).toFixed(1))
        : Infinity;

    for (let day = 1; day <= HORIZON_DAYS; day++) {
      projected -= forecast[day - 1].predicted;

      minimumProjected = Math.min(minimumProjected, projected);

      if (belowSafetyDay === null && projected < item.safetyStock) {
        belowSafetyDay = day;
      }

      if (projected <= 0 && daysToStockout === null) {
        daysToStockout = day;
      }
    }

    const batchLead = leadTimeDays(item.safetyStock, predictedDailyDemand);

    let riskLevel: RiskLevel;

    if (daysToStockout !== null || minimumProjected <= 0) {
      riskLevel = "CRITICAL";
    } else if (minimumProjected < item.safetyStock) {
      riskLevel = "HIGH";
    } else if (minimumProjected <= item.safetyStock * 1.5) {
      riskLevel = "MEDIUM";
    } else {
      riskLevel = "LOW";
    }

    const suggestedOrderQty = Math.max(1, Math.ceil(predictedDailyDemand * batchLead));

    let suggestedAction: string;

    switch (riskLevel) {
      case "CRITICAL":
        suggestedAction =
          daysToStockout !== null
            ? `Emergency procurement — projected stock-out in ${daysToStockout} day(s).`
            : "Emergency procurement / immediate stock reallocation.";
        break;
      case "HIGH":
        suggestedAction = `Replenish urgently — stock falls below safety level in ~${Math.max(1, belowSafetyDay ?? batchLead)} day(s); order ≈ ${suggestedOrderQty} units.`;
        break;
      case "MEDIUM":
        suggestedAction = `Plan replenishment — stock dips close to safety level within the next ${batchLead}-day lead time.`;
        break;
      default:
        suggestedAction =
          coverageDays === Infinity
            ? "Routine monitoring — extensive stock cover available."
            : `Routine monitoring — ${coverageDays} days of stock cover available.`;
    }

    series.push({
      hospitalId: ref.hospitalId,
      medicineId: ref.medicineId,
      currentStock: item.currentStock,
      safetyStock: item.safetyStock,
      history: ref.series.slice(-30),
      forecast,
      predictedDailyDemand,
      meanHistoricalDemand: meanHistorical,
      coverageDays,
      daysToStockout,
      belowSafetyDay,
      riskLevel,
      recommendation: suggestedAction,
      suggestedAction,
      suggestedOrderQty,
      priority: 0,
    });
  }

  series.sort((a, b) => {
    const severityDifference = riskSeverity(b.riskLevel) - riskSeverity(a.riskLevel);

    if (severityDifference !== 0) {
      return severityDifference;
    }

    const aDays = a.daysToStockout ?? 999;
    const bDays = b.daysToStockout ?? 999;

    if (aDays !== bDays) {
      return aDays - bDays;
    }

    return (a.belowSafetyDay ?? 999) - (b.belowSafetyDay ?? 999);
  });

  series.forEach((item, index) => {
    item.priority = index + 1;
  });

  const featureNames = [
    ...BASE_FEATURE_NAMES,
    ...combos.map(([h, m]) => `hospital ${h} × medicine ${m}`),
  ];

  return {
    generatedAt: new Date().toISOString(),
    source: "local",
    provenance: "synthetic",
    dataAsOf:
      demandRows.length > 0
        ? demandRows.reduce(
            (latest, row) =>
              row.point.date > latest ? row.point.date : latest,
            demandRows[0].point.date,
          )
        : null,
    hospitals,
    medicines,
    model: {
      name: "Ridge regression (feature-based ML)",
      featureNames,
      trainDays: trainRows.length,
      trainRows: trainRows.length,
      evaluationDays: testRows.length,
      ml: mlMetrics,
      baseline: baselineMetrics,
    },
    series,
  };
}

/* Lazily built local summary so the first render is fast. */
let cachedLocal: Omit<IntelligenceSummary, "online"> | null = null;

export async function getLocalIntelligence(): Promise<Omit<IntelligenceSummary, "online">> {
  if (!cachedLocal) {
    cachedLocal = await buildLocalSummary();
  }

  return cachedLocal;
}