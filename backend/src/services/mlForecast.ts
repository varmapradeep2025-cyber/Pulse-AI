/*
 * Pulse AI — ML demand-forecast module
 * =====================================
 * Phase 3 implementation: replaces the Phase-1 "average historical demand"
 * predictor with a real machine-learning forecast.
 *
 * Model: Ridge regression (least squares + L2 regularisation) trained on
 * feature-engineered demand rows.
 *
 * Features (per demand day):
 *   - lag1 / lag7   : past demand values (autocorrelation)
 *   - ma7 / ma14    : rolling means (short + long trend)
 *   - day-of-week   : one-hot (weekly seasonality)
 *   - is_weekend    : weekend flag
 *   - month_sin/cos : yearly seasonality
 *   - trend         : normalised day index
 *   - hospital / medicine one-hot (pooled model) — the model learns how each
 *     facility and each medicine behaves, not just the plain average.
 *
 * The synthetic datasets used in this demo are seeded and deterministic so the
 * whole flow can be re-run and verified.
 */

export interface DemandPoint {
  date: string;
  demand: number;
}

export interface ForecastPoint {
  date: string;
  predicted: number;
}

export interface MlMetrics {
  mae: number;
  rmse: number;
  mape: number;
}

export interface TrainedModel {
  /* Name used in explanations / UI */
  name: string;
  /* Ridge coefficient weights (bias last). */
  weights: number[];
  /* Standardisation constants for numeric features (index-aligned). */
  means: number[];
  scales: number[];
  /* Number of features + identity columns (one-hot groups). */
  featureNames: string[];
  trainDays: number;
  /* Optional target transform applied at train time and inverted at predict. */
  targetTransform?: "log1p";
}

export const BASE_BANDS = {
  /* Fixed feature layout for the numeric/time block. */
  LAG1: 0,
  LAG7: 1,
  MA7: 2,
  MA14: 3,
  TREND: 4,
  IS_WEEKEND: 5,
  MONTH_SIN: 6,
  MONTH_COS: 7,
  DOW_MON: 8,
  DOW_TUE: 9,
  DOW_WED: 10,
  DOW_THU: 11,
  DOW_FRI: 12,
  DOW_SAT: 13,
  DOW_SUN: 14,
  NUM_BASE: 15,
} as const;

export const BASE_FEATURE_NAMES = [
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

function windowMean(
  series: DemandPoint[],
  endIndexExclusive: number,
  size: number,
): number {
  const start = Math.max(0, endIndexExclusive - size);
  const slice = series.slice(start, endIndexExclusive);

  if (slice.length === 0) {
    return 0;
  }

  let total = 0;

  for (const point of slice) {
    total += point.demand;
  }

  return total / slice.length;
}

export function seriesMean(series: DemandPoint[]): number {
  if (series.length === 0) {
    return 0;
  }

  let total = 0;

  for (const point of series) {
    total += point.demand;
  }

  return total / series.length;
}

function dowOneHot(date: Date, out: number[], offset: number): void {
  /* getUTCDay(): 0 = Sunday … 6 = Saturday. Band order is Mon..Sun. */
  const day = date.getUTCDay(); // 0..6

  const monIndex = day === 0 ? 6 : day - 1;

  out[offset + monIndex] = 1;
}

/**
 * Builds the fixed (time/trend/lag) part of the feature vector for series
 * index `i`. `i === series.length` is allowed (forecast day 1 uses the last
 * observed value as lag1).
 */
export function buildBaseFeatures(
  series: DemandPoint[],
  i: number,
): number[] {
  const n = series.length;

  const mean = seriesMean(series.slice(0, i));

  const lag1 = i > 0 ? series[i - 1].demand : mean;

  const lag7 = i >= 7 ? series[i - 7].demand : mean;

  const date =
    i < n
      ? new Date(`${series[i].date}T00:00:00Z`)
      : futureDate(series[n - 1].date, i - n + 1);

  const features = new Array<number>(BASE_BANDS.NUM_BASE).fill(0);

  features[BASE_BANDS.LAG1] = lag1;
  features[BASE_BANDS.LAG7] = lag7;
  features[BASE_BANDS.MA7] = windowMean(series, i, 7);
  features[BASE_BANDS.MA14] = windowMean(series, i, 14);
  features[BASE_BANDS.TREND] = Math.min(i, 364) / 364;
  features[BASE_BANDS.IS_WEEKEND] =
    date.getUTCDay() === 0 || date.getUTCDay() === 6 ? 1 : 0;

  const month = date.getUTCMonth(); // 0..11
  const phase = (2 * Math.PI * month) / 12;

  features[BASE_BANDS.MONTH_SIN] = Math.sin(phase);
  features[BASE_BANDS.MONTH_COS] = Math.cos(phase);

  dowOneHot(date, features, BASE_BANDS.DOW_MON);

  return features;
}

export function futureDate(
  lastDate: string,
  daysAhead: number,
): Date {
  const date = new Date(`${lastDate}T00:00:00Z`);

  date.setUTCDate(date.getUTCDate() + daysAhead);

  return date;
}

export function addDays(date: Date, days: number): Date {
  const copy = new Date(date);

  copy.setUTCDate(copy.getUTCDate() + days);

  return copy;
}

export function dateString(date: Date): string {
  return date.toISOString().split("T")[0];
}

/* ------------------------------------------------------------------ */
/* Linear algebra                                                    */
/* ------------------------------------------------------------------ */

/**
 * Solves A·x = b for x using Gaussian elimination with partial pivoting.
 * A is a small square matrix (≤ a few dozen rows).
 */
export function solveLinear(
  matrix: number[][],
  vector: number[],
): number[] {
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

/**
 * Fits a ridge regression (closed-form normal equations with L2 penalty).
 *
 * rows[i] = feature vector (already including a trailing bias = 1),
 * targets[i] = observed demand.
 */
export function fitRidge(
  rows: number[][],
  targets: number[],
  lambda: number,
  featureNames: string[],
  trainDays: number,
  targetTransform?: "log1p",
): TrainedModel {
  const featureWidth = rows[0]?.length ?? 0;

  if (featureWidth === 0 || rows.length === 0) {
    return {
      name: "Ridge regression (insufficient data)",
      weights: [],
      means: [],
      scales: [],
      featureNames,
      trainDays,
      targetTransform,
    };
  }

  /* Standardisation of each numeric feature (bias column excluded). */
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
    const normalized = row.slice(0, -1).map((value, f) =>
      (value - means[f]) / scales[f],
    );

    normalized.push(1);

    return normalized;
  });

  /* Normal equations: (XᵀX + λI) w = Xᵀy */
  const gram = Array.from({ length: featureWidth }, () =>
    new Array<number>(featureWidth).fill(0),
  );

  const rhs = new Array<number>(featureWidth).fill(0);

  const transformedTargets = targets.map((value) =>
    targetTransform === "log1p"
      ? Math.log1p(Math.max(0, value))
      : value,
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
    const row = design[r];

    for (let i = 0; i < featureWidth; i++) {
      rhs[i] += row[i] * transformedTargets[r];
    }
  }

  if (rows.length === 0) {
    return {
      name: "Ridge regression (insufficient data)",
      weights: [],
      means,
      scales,
      featureNames,
      trainDays,
      targetTransform,
    };
  }

  const weights = solveLinear(gram, rhs);

  return {
    name: "Ridge regression (feature-based ML)",
    weights,
    means,
    scales,
    featureNames,
    trainDays,
    targetTransform,
  };
}

export function predictVector(
  model: TrainedModel,
  rawFeatures: number[],
): number {
  if (model.weights.length === 0) {
    return 0;
  }

  const width = model.weights.length;

  const normalized = rawFeatures.slice(0, width - 1).map((value, f) =>
    (value - (model.means[f] ?? 0)) / (model.scales[f] || 1),
  );

  normalized.push(1);

  let total = 0;

  for (let i = 0; i < width; i++) {
    total += normalized[i] * model.weights[i];
  }

  const prediction =
    model.targetTransform === "log1p" ? Math.expm1(total) : total;

  return Math.max(0, prediction);
}

/* ------------------------------------------------------------------ */
/* Metrics                                                            */
/* ------------------------------------------------------------------ */

export function computeMetrics(
  actual: number[],
  predicted: number[],
): MlMetrics {
  const n = Math.min(actual.length, predicted.length);

  let mae = 0;
  let sq = 0;
  let absPct = 0;

  for (let i = 0; i < n; i++) {
    const diff = Math.abs(actual[i] - predicted[i]);

    mae += diff;
    sq += diff * diff;

    if (actual[i] > 0) {
      absPct += diff / actual[i];
    }
  }

  if (n === 0) {
    return { mae: 0, rmse: 0, mape: 0 };
  }

  return {
    mae: Number((mae / n).toFixed(2)),
    rmse: Number(Math.sqrt(sq / n).toFixed(2)),
    mape: Number(((absPct / n) * 100).toFixed(1)),
  };
}