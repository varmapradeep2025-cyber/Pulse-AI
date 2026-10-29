import assert from "node:assert/strict";
import test from "node:test";
import ExcelJS from "exceljs";

process.env.SUPABASE_URL = "http://127.0.0.1:54321";
process.env.SUPABASE_ANON_KEY = "mock-anon-key";
process.env.SUPABASE_SERVICE_ROLE_KEY = "mock-service-role-key";

const { InventoryImportService } = await import(
  "../src/services/inventoryImportService.js"
);
const { inventoryStore, clearCommittedInMemoryReports } = await import(
  "../src/services/inventoryStore.js"
);
const { loadOperationalDataset } = await import(
  "../src/services/operationalData.js"
);
const { simulateScenario } = await import(
  "../src/services/scenarioService.js"
);
import type { InventoryUser } from "../src/types/inventory.js";

const testStaffUser: InventoryUser = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "staff@pulseai.demo",
  isStaff: true,
  hospitalIds: [],
  allHospitals: true,
};

async function buildTestWorkbook(
  rows: Array<{
    report_date: string;
    hospital_id: number;
    medicine_id: number;
    medicine_name: string;
    unit: string;
    opening_stock: number;
    quantity_received: number;
    quantity_dispensed: number;
    quantity_expired_or_written_off: number;
    adjustments: number;
    closing_stock: number;
    minimum_stock_level: number;
    safety_stock: number;
  }>,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Daily Inventory");
  sheet.addRow([
    "report_date",
    "hospital_id",
    "medicine_id",
    "medicine_name",
    "unit",
    "opening_stock",
    "quantity_received",
    "quantity_dispensed",
    "quantity_expired_or_written_off",
    "adjustments",
    "closing_stock",
    "minimum_stock_level",
    "safety_stock",
    "reserved_stock",
    "pending_order_quantity",
    "supplier_id",
    "order_date",
    "expected_delivery_date",
    "actual_delivery_date",
    "typical_lead_time_days",
    "stockout_flag",
    "unmet_demand_quantity",
    "data_source",
  ]);

  for (const r of rows) {
    sheet.addRow([
      r.report_date,
      r.hospital_id,
      r.medicine_id,
      r.medicine_name,
      r.unit,
      r.opening_stock,
      r.quantity_received,
      r.quantity_dispensed,
      r.quantity_expired_or_written_off,
      r.adjustments,
      r.closing_stock,
      r.minimum_stock_level,
      r.safety_stock,
      0,
      0,
      "S01",
      "",
      "",
      "",
      3,
      false,
      0,
      "Prototype Import Test",
    ]);
  }

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

test("connection: reference catalog loads catalog data and generates template without database schema", async () => {
  const service = new InventoryImportService(inventoryStore);
  const catalog = await inventoryStore.loadReferenceCatalog();

  assert.ok(catalog.hospitals.length > 0, "Reference hospitals should be loaded");
  assert.ok(catalog.medicines.length > 0, "Reference medicines should be loaded");

  const sampleBuffer = await service.template(true, testStaffUser);
  assert.ok(sampleBuffer.length > 0, "Sample workbook buffer should be generated");

  const parsed = new ExcelJS.Workbook();
  await parsed.xlsx.load(sampleBuffer);
  const sheet = parsed.getWorksheet(1);
  assert.ok(sheet, "Sample workbook should contain a worksheet");
  assert.ok((sheet.rowCount ?? 0) >= 2, "Sample workbook should have headers and at least one row");
});

test("connection: importing workbook updates ledger summary and operational dataset", async () => {
  clearCommittedInMemoryReports();
  const service = new InventoryImportService(inventoryStore);

  const testBuffer = await buildTestWorkbook([
    {
      report_date: "2026-10-25",
      hospital_id: 1,
      medicine_id: 2, // Paracetamol
      medicine_name: "Paracetamol",
      unit: "tablets",
      opening_stock: 500,
      quantity_received: 100,
      quantity_dispensed: 50,
      quantity_expired_or_written_off: 0,
      adjustments: 0,
      closing_stock: 550,
      minimum_stock_level: 150,
      safety_stock: 120,
    },
    {
      report_date: "2026-10-25",
      hospital_id: 2,
      medicine_id: 2, // Paracetamol
      medicine_name: "Paracetamol",
      unit: "tablets",
      opening_stock: 200,
      quantity_received: 0,
      quantity_dispensed: 40,
      quantity_expired_or_written_off: 0,
      adjustments: 0,
      closing_stock: 160,
      minimum_stock_level: 100,
      safety_stock: 80,
    },
  ]);

  // 1. Preview workbook
  const preview = await service.preview({
    user: testStaffUser,
    fileName: "hospital_stock_oct25.xlsx",
    fileSize: testBuffer.length,
    buffer: testBuffer,
    datasetKind: "real",
    correctionMode: "reject",
  });

  assert.equal(preview.acceptedCount, 2, "Both rows should be validated and accepted");
  assert.equal(preview.rejectedCount, 0, "No rows should be rejected");

  // 2. Confirm import
  const result = await service.confirm(testStaffUser, preview.batchId);
  assert.equal(result.importedCount, 2, "Two rows should be imported");
  assert.equal(result.status, "imported");

  // 3. Verify ledger summary
  const summary = await inventoryStore.getLedgerSummary({
    allHospitals: true,
    hospitalIds: [],
  });
  assert.equal(summary.storageReady, true);
  assert.equal(summary.realRowCount, 2);

  // 4. Verify authoritative operational dataset incorporates imported data
  const dataset = await loadOperationalDataset();
  assert.equal(dataset.provenance, "imported-real");
  assert.equal(dataset.inventory.length, 2);

  const h1 = dataset.inventory.find((i) => i.hospital_id === 1 && i.medicine_id === 2);
  assert.ok(h1, "Hospital 1 inventory row should exist");
  assert.equal(h1.current_stock, 550, "Current stock should match closing_stock of 550");
  assert.equal(h1.safety_stock, 120, "Safety stock should match 120");

  const h2 = dataset.inventory.find((i) => i.hospital_id === 2 && i.medicine_id === 2);
  assert.ok(h2, "Hospital 2 inventory row should exist");
  assert.equal(h2.current_stock, 160, "Current stock should match closing_stock of 160");
  assert.equal(h2.safety_stock, 80, "Safety stock should match 80");
});

test("connection: all 5 scenarios simulate authoritatively on imported inventory with baselines", async () => {
  // Inventory is still active from the previous test
  for (const scenarioId of [1, 2, 3, 4, 5]) {
    const response = await simulateScenario(scenarioId);

    assert.ok(response, `Scenario ${scenarioId} should return a valid response`);
    assert.equal(
      response.dataProvenance,
      "imported-real",
      `Scenario ${scenarioId} should use imported-real provenance`,
    );
    assert.ok(
      response.results.length >= 2,
      `Scenario ${scenarioId} should simulate the 2 imported hospital-medicine items`,
    );

    // Verify baseline projection exists on every result
    for (const item of response.results) {
      assert.ok(item.baseline, `Item in scenario ${scenarioId} must have baseline projection`);
      assert.ok(item.impact_vs_baseline, `Item in scenario ${scenarioId} must have impact_vs_baseline`);
      assert.equal(
        typeof item.baseline.projected_remaining_stock,
        "number",
        "Baseline projected remaining stock must be a number",
      );
      assert.equal(
        typeof item.impact_vs_baseline.projected_stock_delta,
        "number",
        "Stock delta vs baseline must be a number",
      );
    }

    // Verify scenario summary includes baseline comparisons
    assert.ok(response.scenario.baseline, "Scenario summary must include baseline");
    assert.ok(response.scenario.impact_vs_baseline, "Scenario summary must include impact_vs_baseline");
  }

  // Clean up
  clearCommittedInMemoryReports();
});
