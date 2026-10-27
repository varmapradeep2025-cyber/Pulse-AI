import assert from "node:assert/strict";
import test from "node:test";
import {
  addDaysUtc,
  buildBaseFeatures,
  dateFromString,
  toDateString,
} from "../src/data/forecastFeatures";
import type { DemandPoint } from "../src/data/forecastFeatures";

const series: DemandPoint[] = [
  { date: "2026-09-01", demand: 10 },
  { date: "2026-09-02", demand: 20 },
  { date: "2026-09-03", demand: 30 },
];

test("browser fallback day-one forecast uses the final observed demand", () => {
  const lastObservedStep = buildBaseFeatures(series, series.length - 1);
  const firstForecastStep = buildBaseFeatures(series, series.length);

  assert.equal(lastObservedStep[0], 20);
  assert.equal(firstForecastStep[0], 30);
  assert.equal(firstForecastStep[2], 20);
  assert.equal(lastObservedStep[2], 15);
});

test("browser fallback day-one forecast advances to the next date", () => {
  assert.equal(
    toDateString(addDaysUtc(dateFromString("2026-09-03"), 1)),
    "2026-09-04",
  );

  const features = buildBaseFeatures(series, series.length);

  assert.equal(features[12], 1);
  assert.equal(features[11], 0);
});
