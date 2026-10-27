import assert from "node:assert/strict";
import test from "node:test";
import {
  BASE_BANDS,
  buildBaseFeatures,
  dateString,
  futureDate,
} from "../src/services/mlForecast.js";
import type { DemandPoint } from "../src/services/mlForecast.js";

const series: DemandPoint[] = [
  { date: "2026-09-01", demand: 10 },
  { date: "2026-09-02", demand: 20 },
  { date: "2026-09-03", demand: 30 },
];

test("day-one forecast uses the final observed demand as lag1", () => {
  const lastObservedStep = buildBaseFeatures(series, series.length - 1);
  const firstForecastStep = buildBaseFeatures(series, series.length);

  assert.equal(lastObservedStep[BASE_BANDS.LAG1], 20);
  assert.equal(firstForecastStep[BASE_BANDS.LAG1], 30);
  assert.notEqual(
    firstForecastStep[BASE_BANDS.LAG1],
    lastObservedStep[BASE_BANDS.LAG1],
  );
  assert.equal(firstForecastStep[BASE_BANDS.MA7], 20);
  assert.equal(lastObservedStep[BASE_BANDS.MA7], 15);
});

test("day-one forecast advances to the next calendar day", () => {
  assert.equal(dateString(futureDate("2026-09-03", 1)), "2026-09-04");

  const features = buildBaseFeatures(series, series.length);

  assert.equal(features[BASE_BANDS.DOW_FRI], 1);
  assert.equal(features[BASE_BANDS.DOW_THU], 0);
});
