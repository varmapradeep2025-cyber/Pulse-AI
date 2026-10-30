import assert from "node:assert/strict";
import test from "node:test";
import {
  addDaysUtc,
  buildBaseFeatures,
  dateFromString,
  toDateString,
} from "../src/data/forecastFeatures";
import type { DemandPoint } from "../src/data/forecastFeatures";
import { projectHypotheticalDelivery } from "../src/data/inventoryScenario";

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

test("early lag fallbacks never use future observations", () => {
  const extended: DemandPoint[] = [
    ...series,
    { date: "2026-09-04", demand: 1000 },
  ];

  assert.equal(buildBaseFeatures(series, 0)[0], 0);
  assert.equal(buildBaseFeatures(series, 1)[1], 10);
  assert.deepEqual(
    buildBaseFeatures(series, 0),
    buildBaseFeatures(extended, 0),
  );
});

test("hypothetical delivery delay shifts the safety breach and stock-out projection", () => {
  const result = projectHypotheticalDelivery({
    startingStock: 20,
    safetyStock: 15,
    forecast: Array.from({ length: 7 }, (_, index) => ({
      date: `2026-10-${String(index + 1).padStart(2, "0")}`,
      predicted: 6,
    })),
    arrivalDay: 2,
    delayDays: 3,
    deliveryQuantity: 30,
  });

  assert.equal(result.onTime.belowSafetyDay, 1);
  assert.equal(result.onTime.stockOutDay, null);
  assert.equal(result.delayed.stockOutDay, 4);
  assert.equal(result.delayed.belowSafetyDay, 1);
});

test("hypothetical delivery rejects invalid arrival and quantity inputs", () => {
  assert.throws(
    () =>
      projectHypotheticalDelivery({
        startingStock: 10,
        safetyStock: 5,
        forecast: [],
        arrivalDay: 0,
        delayDays: 3,
        deliveryQuantity: 20,
      }),
    RangeError,
  );
});
