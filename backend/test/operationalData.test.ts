import assert from "node:assert/strict";
import test from "node:test";
import {
  analyticsScope,
  buildImportedDataset,
  type ImportedReportRow,
} from "../src/services/operationalData.js";

function report(
  overrides: Partial<ImportedReportRow>,
): ImportedReportRow {
  return {
    report_date: "2026-10-20",
    hospital_id: 1,
    medicine_id: 10,
    medicine_name: "Paracetamol",
    unit: "tablets",
    quantity_dispensed: 20,
    closing_stock: 100,
    minimum_stock_level: 50,
    safety_stock: 60,
    unmet_demand_quantity: 5,
    imported_at: "2026-10-21T00:00:00Z",
    is_synthetic: false,
    ...overrides,
  };
}

test("builds inventory from the latest report and sums unmet demand", () => {
  const dataset = buildImportedDataset(
    [
      report({ report_date: "2026-10-19", closing_stock: 80 }),
      report({
        report_date: "2026-10-20",
        closing_stock: 65,
        quantity_dispensed: 30,
        unmet_demand_quantity: 7,
        imported_at: "2026-10-21T01:00:00Z",
      }),
      report({
        report_date: "2026-10-20",
        closing_stock: 90,
        imported_at: "2026-10-20T23:00:00Z",
      }),
    ],
    "imported-real",
  );

  assert.equal(dataset.inventory.length, 1);
  assert.equal(dataset.inventory[0].current_stock, 65);
  assert.equal(dataset.inventory[0].safety_stock, 60);
  assert.equal(dataset.inventory[0].daily_consumption, 37);
  assert.equal(dataset.demandRows.length, 2);
  assert.deepEqual(
    dataset.demandRows.map((row) => row.demand),
    [25, 37],
  );
  assert.equal(dataset.latestReportDate, "2026-10-20");
  assert.equal(dataset.provenance, "imported-real");
});

test("derives safety stock from the minimum level and skips malformed rows", () => {
  const dataset = buildImportedDataset(
    [
      report({ safety_stock: null, minimum_stock_level: 42 }),
      report({
        report_date: "2026-10-21",
        hospital_id: -1,
      }),
      report({
        report_date: "2026-10-22",
        medicine_id: 11,
        closing_stock: -5,
      }),
      report({
        report_date: "not-a-date",
        medicine_id: 12,
      }),
    ],
    "imported-synthetic",
  );

  assert.equal(dataset.inventory.length, 1);
  assert.equal(dataset.inventory[0].safety_stock, 42);
  assert.equal(dataset.skippedRows, 3);
  assert.equal(dataset.provenance, "imported-synthetic");
});

test("filters imported data by hospital scope without widening it", () => {
  const dataset = buildImportedDataset(
    [
      report({ hospital_id: 1 }),
      report({ hospital_id: 2, medicine_id: 20 }),
      report({ hospital_id: 3, medicine_id: 30 }),
    ],
    "imported-real",
    { hospitalIds: [2] },
  );

  assert.deepEqual(dataset.hospitals.map((item) => item.id), [2]);
  assert.deepEqual(dataset.medicines.map((item) => item.id), [20]);
  assert.ok(dataset.inventory.every((row) => row.hospital_id === 2));

  const empty = buildImportedDataset(
    [report({ hospital_id: 1 })],
    "imported-real",
    { hospitalIds: [] },
  );

  assert.equal(empty.inventory.length, 0);
  assert.equal(empty.latestReportDate, null);
});

test("analytics scopes distinguish global and hospital-restricted users", () => {
  assert.equal(analyticsScope(true, []), undefined);
  assert.deepEqual(analyticsScope(false, []), { hospitalIds: [] });
  assert.deepEqual(analyticsScope(false, [3, 3, 1]), {
    hospitalIds: [3, 1],
  });
});
