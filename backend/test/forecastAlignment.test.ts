import assert from "node:assert/strict";
import test from "node:test";
import {
  BASE_BANDS,
  buildBaseFeatures,
  futureDate,
} from "../src/services/mlForecast.js";

const series = Array.from({ length: 8 }, (_, index) => ({
  date: new Date(Date.UTC(2026, 9, 16 + index))
    .toISOString()
    .slice(0, 10),
  demand: (index + 1) * 10,
}));

test("forecast features use the next date and include the newest demand", () => {
  const nextDayFeatures = buildBaseFeatures(series, series.length);
  const lastObservedFeatures = buildBaseFeatures(series, series.length - 1);

  assert.equal(nextDayFeatures[BASE_BANDS.LAG1], 80);
  assert.equal(nextDayFeatures[BASE_BANDS.LAG7], 20);
  assert.equal(nextDayFeatures[BASE_BANDS.IS_WEEKEND], 1);
  assert.equal(nextDayFeatures[BASE_BANDS.DOW_SAT], 1);
  assert.equal(nextDayFeatures[BASE_BANDS.DOW_FRI], 0);

  assert.equal(lastObservedFeatures[BASE_BANDS.IS_WEEKEND], 0);
  assert.equal(lastObservedFeatures[BASE_BANDS.DOW_FRI], 1);
});

test("calendar dates advance without local-time drift", () => {
  const next = futureDate("2026-10-23", 1);

  assert.equal(next.toISOString(), "2026-10-24T00:00:00.000Z");
  assert.equal(next.getUTCDay(), 6);
});
