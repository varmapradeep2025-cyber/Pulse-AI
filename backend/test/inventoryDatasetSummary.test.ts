import assert from "node:assert/strict";
import test from "node:test";
import { summarizeOperationalDataset } from "../src/services/inventoryDatasetSummary.js";
import {
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
    minimum_stock_level: 40,
    safety_stock: 50,
    reserved_stock: 5,
    pending_order_quantity: 20,
    expected_delivery_date: "2026-10-24",
    supplier_id: "SUP-001",
    stockout_flag: false,
    unmet_demand_quantity: 2,
    data_source: "District ledger",
    imported_at: "2026-10-21T00:00:00Z",
    is_synthetic: false,
    ...overrides,
  };
}

test("summarizes the active operational dataset for the inventory ledger", () => {
  const dataset = buildImportedDataset(
    [
      report({ report_date: "2026-10-19", closing_stock: 80 }),
      report({ closing_stock: 100 }),
      report({
        medicine_id: 11,
        medicine_name: "Insulin",
        unit: "vials",
        closing_stock: 0,
        stockout_flag: true,
        imported_at: "2026-10-21T01:00:00Z",
      }),
      report({ report_date: "not-a-date", medicine_id: 12 }),
    ],
    "imported-real",
  );

  const summary = summarizeOperationalDataset(dataset);

  assert.equal(summary.source, "imported-real");
  assert.equal(summary.kind, "real");
  assert.equal(summary.snapshotDate, "2026-10-20");
  assert.equal(summary.importedAt, "2026-10-21T01:00:00Z");
  assert.equal(summary.rowCount, 2);
  assert.equal(summary.knownStockRows, 2);
  assert.equal(summary.unknownStockRows, 0);
  assert.equal(summary.totalStock, 100);
  assert.equal(summary.lowStockRows, 0);
  assert.equal(summary.stockoutRows, 1);
  assert.equal(summary.hospitalCount, 1);
  assert.equal(summary.medicineCount, 2);
  assert.equal(summary.warnings.length, 1);

  const paracetamol = summary.items.find(
    (item) => item.medicineId === 10,
  );

  assert.ok(paracetamol);
  assert.equal(paracetamol.hospitalName, "Hospital 1");
  assert.equal(paracetamol.medicineName, "Paracetamol");
  assert.equal(paracetamol.unit, "tablets");
  assert.equal(paracetamol.reportDate, "2026-10-20");
  assert.equal(paracetamol.closingStock, 100);
  assert.equal(paracetamol.safetyStock, 50);
  assert.equal(paracetamol.minimumStockLevel, 40);
  assert.equal(paracetamol.status, "healthy");

  const insulin = summary.items.find((item) => item.medicineId === 11);

  assert.ok(insulin);
  assert.equal(insulin.status, "stockout");
});
