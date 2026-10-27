export interface DemandPoint {
  date: string;
  demand: number;
}

export interface ForecastPoint {
  date: string;
  predicted: number;
}

function windowMean(series: DemandPoint[], to: number, size: number): number {
  const start = Math.max(0, to - size);

  const slice = series.slice(start, to);

  if (slice.length === 0) {
    return 0;
  }

  return slice.reduce((sum, point) => sum + point.demand, 0) / slice.length;
}

export function seriesMean(series: DemandPoint[]): number {
  if (series.length === 0) {
    return 0;
  }

  return series.reduce((sum, point) => sum + point.demand, 0) / series.length;
}

export function dateFromString(value: string): Date {
  return new Date(`${value}T00:00:00Z`);
}

export function toDateString(date: Date): string {
  return date.toISOString().split("T")[0];
}

export function addDaysUtc(date: Date, days: number): Date {
  const copy = new Date(date);

  copy.setUTCDate(copy.getUTCDate() + days);

  return copy;
}

export function buildBaseFeatures(series: DemandPoint[], i: number): number[] {
  const n = series.length;

  const mean = n > 0 ? seriesMean(series) : 0;

  const lag1 = i > 0 ? series[i - 1].demand : mean;

  const lag7 = i >= 7 ? series[i - 7].demand : mean;

  const date =
    i < n
      ? dateFromString(series[i].date)
      : addDaysUtc(dateFromString(series[n - 1].date), i - n + 1);

  const features = new Array<number>(15).fill(0);

  features[0] = lag1;
  features[1] = lag7;
  features[2] = windowMean(series, i, 7);
  features[3] = windowMean(series, i, 14);
  features[4] = n > 1 ? i / (n - 1) : 0;
  features[5] = date.getUTCDay() === 0 || date.getUTCDay() === 6 ? 1 : 0;

  const month = date.getUTCMonth(); // 0..11
  const phase = (2 * Math.PI * month) / 12;

  features[6] = Math.sin(phase);
  features[7] = Math.cos(phase);

  const weekday = date.getUTCDay(); // 0 = Sunday
  const monIndex = weekday === 0 ? 6 : weekday - 1;

  features[8 + monIndex] = 1;

  return features;
}
