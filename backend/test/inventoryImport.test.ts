import assert from "node:assert/strict";
import test from "node:test";
import ExcelJS from "exceljs";
import {
  INVENTORY_TEMPLATE_COLUMNS,
  type CreateInventoryBatchInput,
  type InventoryBatchRecord,
  type InventoryDatasetKind,
  type InventoryImportResult,
  type InventoryLedgerSummary,
  type InventoryReferenceCatalog,
  type InventoryUser,
} from "../src/types/inventory.js";
import {
  InventoryImportService,
} from "../src/services/inventoryImportService.js";
import {
  parseInventoryWorkbook,
  validateInventoryRows,
} from "../src/services/inventoryWorkbook.js";
import {
  InventoryError,
} from "../src/services/inventoryErrors.js";
import type {
  InventoryHospitalScope,
  InventoryStore,
} from "../src/services/inventoryStore.js";
import {
  parseInventoryStaffIds,
  resolveInventoryUser,
} from "../src/services/inventoryAccess.js";

const fixedNow = new Date("2026-10-26T04:00:00.000Z");

const staff: InventoryUser = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "inventory@example.com",
  isStaff: true,
  hospitalIds: [],
  allHospitals: true,
};

const catalog: InventoryReferenceCatalog = {
  hospitals: [{ id: 1, name: "City Hospital" }],
  medicines: [{ id: 1, name: "Paracetamol 500 mg", unit: "tablet" }],
};

interface FakeStoreOptions {
  catalog?: InventoryReferenceCatalog;
  existing?: Partial<Record<InventoryDatasetKind, string[]>>;
}

class FakeStore implements InventoryStore {
  readonly created: CreateInventoryBatchInput[] = [];
  readonly lookups: Array<{ datasetKind: InventoryDatasetKind; keys: string[] }> = [];
  readonly commits: string[] = [];
  readonly summaryScopes: InventoryHospitalScope[] = [];
  readonly batches = new Map<string, InventoryBatchRecord>();
  readonly persistedReports = new Map<string, Record<string, unknown>>();
  failCommitOnBatchId?: string;
  private readonly existing = new Map<InventoryDatasetKind, Set<string>>();
  private counter = 0;

  constructor(private readonly options: FakeStoreOptions = {}) {
    for (const kind of ["synthetic", "real"] as const) {
      this.existing.set(kind, new Set(options.existing?.[kind] ?? []));
    }
  }

  async loadReferenceCatalog(): Promise<InventoryReferenceCatalog> {
    return this.options.catalog ?? catalog;
  }

  async findExistingKeys(
    datasetKind: InventoryDatasetKind,
    keys: string[],
  ): Promise<ReadonlySet<string>> {
    this.lookups.push({ datasetKind, keys });
    const existing = this.existing.get(datasetKind) ?? new Set<string>();
    return new Set(keys.filter((key) => existing.has(key)));
  }

  async createBatch(input: CreateInventoryBatchInput): Promise<string> {
    this.counter += 1;
    const id = `00000000-0000-4000-8000-${String(this.counter).padStart(12, "0")}`;

    this.created.push(input);
    this.batches.set(id, {
      id,
      uploaded_by: input.uploadedBy,
      original_filename: input.originalFilename,
      file_sha256: input.fileHash,
      dataset_kind: input.datasetKind,
      correction_mode: input.correctionMode,
      status: input.status,
      reporting_period_start: input.reportingPeriodStart,
      reporting_period_end: input.reportingPeriodEnd,
      row_count: input.rowCount,
      accepted_count: input.acceptedCount,
      warning_count: input.warningCount,
      rejected_count: input.rejectedCount,
      replacement_count: input.replacementCount,
      hospital_ids: input.hospitalIds,
      file_errors: input.fileErrors,
      file_warnings: input.fileWarnings,
      validation_results: input.validationResults,
      staged_rows: input.stagedRows,
      created_at: input.createdAt,
      imported_at: null,
      expires_at: input.expiresAt,
    });

    return id;
  }

  async getBatch(
    batchId: string,
    userId: string,
  ): Promise<InventoryBatchRecord | null> {
    const batch = this.batches.get(batchId);
    return batch && batch.uploaded_by === userId ? batch : null;
  }

  async commitBatch(
    batchId: string,
    userId: string,
  ): Promise<InventoryImportResult> {
    const batch = await this.getBatch(batchId, userId);

    if (!batch) {
      throw new InventoryError(404, "IMPORT_BATCH_NOT_FOUND", "Not found.");
    }

    if (this.failCommitOnBatchId === batchId) {
      throw new InventoryError(
        500,
        "INVENTORY_STORAGE_ERROR",
        "Simulated database insertion failure.",
      );
    }

    if (batch.staged_rows) {
      for (const row of batch.staged_rows) {
        const key = `${batch.dataset_kind}|${row.report_date}|${row.hospital_id}|${row.medicine_id}`;
        this.persistedReports.set(key, row as unknown as Record<string, unknown>);
      }
    }

    this.commits.push(batchId);
    batch.status = "imported";
    batch.imported_at = fixedNow.toISOString();

    return {
      batchId: batch.id,
      status: "imported",
      datasetKind: batch.dataset_kind,
      importedCount: batch.accepted_count,
      replacedCount: batch.replacement_count,
      rejectedCount: batch.rejected_count,
      reportingPeriodStart: batch.reporting_period_start,
      reportingPeriodEnd: batch.reporting_period_end,
      importedAt: fixedNow.toISOString(),
    };
  }

  async getLedgerSummary(
    scope: InventoryHospitalScope,
  ): Promise<InventoryLedgerSummary> {
    this.summaryScopes.push(scope);
    return {
      latestReal: null,
      latestSynthetic: null,
      realRowCount: 0,
      syntheticRowCount: 0,
      recentBatches: [],
    };
  }
}

function inventoryRow(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    report_date: "2026-10-24",
    hospital_id: 1,
    medicine_id: 1,
    medicine_name: "Paracetamol 500 mg",
    unit: "tablet",
    opening_stock: 100,
    quantity_received: 50,
    quantity_dispensed: 40,
    quantity_expired_or_written_off: 0,
    adjustments: 0,
    closing_stock: 110,
    minimum_stock_level: 40,
    reserved_stock: 5,
    pending_order_quantity: 20,
    supplier_id: "SUP-001",
    order_date: "2026-10-20",
    expected_delivery_date: "2026-10-25",
    actual_delivery_date: "",
    typical_lead_time_days: 5,
    stockout_flag: false,
    unmet_demand_quantity: 0,
    data_source: "Synthetic demo",
    ...overrides,
  };
}

async function workbookBuffer(
  rows: Record<string, unknown>[],
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Inventory");

  sheet.addRow([...INVENTORY_TEMPLATE_COLUMNS]);

  for (const row of rows) {
    sheet.addRow(
      INVENTORY_TEMPLATE_COLUMNS.map((column) => row[column] ?? null),
    );
  }

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function serviceFor(store: FakeStore): InventoryImportService {
  return new InventoryImportService(store, () => fixedNow);
}

test("inventory staff access requires the allowlist or trusted app metadata", () => {
  const allowed = parseInventoryStaffIds("staff-a, staff-b;staff-c");
  const environmentStaff = resolveInventoryUser({ sub: "staff-a" }, allowed);
  const scopedStaff = resolveInventoryUser(
    {
      sub: "user-4",
      app_metadata: {
        inventory_staff: true,
        inventory_hospital_ids: ["1", "2", "bad"],
      },
    },
    allowed,
  );

  assert.equal(environmentStaff?.isStaff, true);
  assert.equal(environmentStaff?.allHospitals, true);
  assert.equal(scopedStaff?.isStaff, true);
  assert.deepEqual(scopedStaff?.hospitalIds, [1, 2]);
  assert.equal(scopedStaff?.allHospitals, false);
  assert.equal(
    resolveInventoryUser(
      {
        sub: "staff-a",
        app_metadata: { inventory_hospital_ids: [3] },
      },
      allowed,
    )?.allHospitals,
    false,
  );
  assert.equal(
    resolveInventoryUser(
      { sub: "user-1", app_metadata: { inventory_staff: true } },
      allowed,
    )?.isStaff,
    true,
  );
  assert.equal(
    resolveInventoryUser(
      { sub: "user-2", app_metadata: { role: "inventory-staff" } },
      allowed,
    )?.isStaff,
    true,
  );
  assert.equal(
    resolveInventoryUser(
      { sub: "user-3", user_metadata: { inventory_staff: true } },
      allowed,
    )?.isStaff,
    false,
  );
  assert.equal(resolveInventoryUser({}, allowed), null);
});

test("service rejects non-staff users and confirmation by another user", async () => {
  const store = new FakeStore();
  const service = serviceFor(store);
  const buffer = await workbookBuffer([inventoryRow()]);
  const request = {
    fileName: "inventory.xlsx",
    fileSize: buffer.length,
    buffer,
    datasetKind: "synthetic",
    correctionMode: "reject",
  } as const;

  await assert.rejects(
    () =>
      service.preview({
        ...request,
        user: {
          id: "not-staff",
          isStaff: false,
          hospitalIds: [],
          allHospitals: false,
        },
      }),
    (error: unknown) =>
      error instanceof InventoryError &&
      error.code === "INVENTORY_STAFF_ACCESS_REQUIRED" &&
      error.status === 403,
  );

  const preview = await service.preview({ ...request, user: staff });

  await assert.rejects(
    () =>
      service.confirm(
        {
          id: "22222222-2222-4222-8222-222222222222",
          isStaff: true,
          hospitalIds: [],
          allHospitals: true,
        },
        preview.batchId,
      ),
    (error: unknown) =>
      error instanceof InventoryError &&
      error.code === "IMPORT_BATCH_NOT_FOUND" &&
      error.status === 404,
  );
});

test("staff cannot preview or confirm hospitals outside their assignment", async () => {
  const store = new FakeStore();
  const service = serviceFor(store);
  const buffer = await workbookBuffer([inventoryRow()]);
  const request = {
    fileName: "inventory.xlsx",
    fileSize: buffer.length,
    buffer,
    datasetKind: "synthetic",
    correctionMode: "reject",
  } as const;
  const scopedStaff: InventoryUser = {
    ...staff,
    hospitalIds: [2],
    allHospitals: false,
  };

  const preview = await service.preview({
    ...request,
    user: scopedStaff,
  });

  assert.equal(preview.acceptedCount, 0);
  assert.equal(preview.status, "rejected");
  assert.equal(
    preview.rows[0]?.issues.some(
      (item) => item.code === "HOSPITAL_NOT_ALLOWED",
    ),
    true,
  );

  const authorized = await service.preview({ ...request, user: staff });

  await assert.rejects(
    () =>
      service.confirm(
        {
          ...staff,
          hospitalIds: [2],
          allHospitals: false,
        },
        authorized.batchId,
      ),
    (error: unknown) =>
      error instanceof InventoryError &&
      error.code === "HOSPITAL_NOT_ALLOWED" &&
      error.status === 403,
  );
});

test("summary requests pass the staff hospital scope to storage", async () => {
  const store = new FakeStore();
  const service = serviceFor(store);
  const scopedStaff: InventoryUser = {
    ...staff,
    hospitalIds: [1, 2],
    allHospitals: false,
  };

  await service.summary(scopedStaff);

  assert.deepEqual(store.summaryScopes, [
    { allHospitals: false, hospitalIds: [1, 2] },
  ]);
});

test("template workbook contains the canonical columns and a valid sample", async () => {
  const service = serviceFor(new FakeStore());
  const buffer = await service.template(true);
  const parsed = await parseInventoryWorkbook(buffer);
  const results = validateInventoryRows(parsed.rows, {
    datasetKind: "synthetic",
    correctionMode: "reject",
    existingKeys: new Set<string>(),
    reference: catalog,
    allHospitals: true,
    allowedHospitalIds: new Set<number>(),
    today: "2026-10-26",
  });

  assert.deepEqual(parsed.fileErrors, []);
  assert.equal(parsed.rows.length, 1);
  assert.deepEqual(results[0]?.issues, []);
  assert.equal(results[0]?.status, "accepted");
  assert.equal(results[0]?.data?.closing_stock, 110);
  assert.equal(results[0]?.data?.safety_stock, 20);
});

test("preview validates, stages accepted rows, and imports only after confirmation", async () => {
  const store = new FakeStore();
  const service = serviceFor(store);
  const buffer = await workbookBuffer([inventoryRow()]);
  const preview = await service.preview({
    user: staff,
    fileName: "inventory.xlsx",
    fileSize: buffer.length,
    buffer,
    datasetKind: "synthetic",
    correctionMode: "reject",
  });

  assert.equal(preview.status, "previewed");
  assert.equal(preview.datasetKind, "synthetic");
  assert.equal(preview.rowCount, 1);
  assert.equal(preview.acceptedCount, 1);
  assert.equal(preview.rejectedCount, 0);
  assert.equal(preview.reportingPeriodStart, "2026-10-24");
  assert.equal(store.created[0]?.stagedRows.length, 1);
  assert.equal(store.lookups[0]?.datasetKind, "synthetic");

  const imported = await service.confirm(staff, preview.batchId);
  assert.equal(imported.status, "imported");
  assert.equal(imported.importedCount, 1);
  assert.equal(store.commits.length, 1);

  const repeated = await service.confirm(staff, preview.batchId);
  assert.equal(repeated.status, "imported");
  assert.equal(store.commits.length, 1);
});

test("existing reports are rejected by default", async () => {
  const store = new FakeStore({
    existing: { synthetic: ["2026-10-24|1|1"] },
  });
  const service = serviceFor(store);
  const buffer = await workbookBuffer([inventoryRow()]);
  const preview = await service.preview({
    user: staff,
    fileName: "inventory.xlsx",
    fileSize: buffer.length,
    buffer,
    datasetKind: "synthetic",
    correctionMode: "reject",
  });

  assert.equal(preview.status, "rejected");
  assert.equal(preview.acceptedCount, 0);
  assert.equal(preview.rejectedCount, 1);
  assert.equal(
    preview.rows[0]?.issues.some((issue) => issue.code === "EXISTING_REPORT"),
    true,
  );
});

test("replace mode warns and counts corrections without silently merging", async () => {
  const store = new FakeStore({
    existing: { synthetic: ["2026-10-24|1|1"] },
  });
  const service = serviceFor(store);
  const buffer = await workbookBuffer([inventoryRow()]);
  const preview = await service.preview({
    user: staff,
    fileName: "inventory.xlsx",
    fileSize: buffer.length,
    buffer,
    datasetKind: "synthetic",
    correctionMode: "replace",
  });

  assert.equal(preview.status, "previewed");
  assert.equal(preview.acceptedCount, 1);
  assert.equal(preview.warningCount, 1);
  assert.equal(preview.replacementCount, 1);
  assert.equal(
    preview.rows[0]?.issues.some((issue) => issue.code === "REPLACES_EXISTING"),
    true,
  );
});

test("synthetic and real report uniqueness is checked independently", async () => {
  const store = new FakeStore({
    existing: { real: ["2026-10-24|1|1"] },
  });
  const service = serviceFor(store);
  const buffer = await workbookBuffer([inventoryRow()]);
  const preview = await service.preview({
    user: staff,
    fileName: "inventory.xlsx",
    fileSize: buffer.length,
    buffer,
    datasetKind: "synthetic",
    correctionMode: "reject",
  });

  assert.equal(store.lookups[0]?.datasetKind, "synthetic");
  assert.equal(preview.status, "previewed");
  assert.equal(preview.acceptedCount, 1);
});

test("real imports reject synthetic source labels", async () => {
  const store = new FakeStore();
  const service = serviceFor(store);
  const buffer = await workbookBuffer([inventoryRow()]);
  const preview = await service.preview({
    user: staff,
    fileName: "inventory.xlsx",
    fileSize: buffer.length,
    buffer,
    datasetKind: "real",
    correctionMode: "reject",
  });

  assert.equal(preview.status, "rejected");
  assert.equal(
    preview.rows[0]?.issues.some(
      (issue) => issue.code === "SYNTHETIC_SOURCE_FOR_REAL_DATA",
    ),
    true,
  );
});

test("stock equation mismatches and duplicate report keys reject rows", async () => {
  const store = new FakeStore();
  const service = serviceFor(store);
  const buffer = await workbookBuffer([
    inventoryRow({ closing_stock: 99 }),
    inventoryRow(),
    inventoryRow({ opening_stock: 30, closing_stock: 40 }),
  ]);
  const preview = await service.preview({
    user: staff,
    fileName: "inventory.xlsx",
    fileSize: buffer.length,
    buffer,
    datasetKind: "synthetic",
    correctionMode: "reject",
  });

  assert.equal(preview.rejectedCount, 3);
  assert.equal(preview.acceptedCount, 0);
  assert.equal(
    preview.rows[0]?.issues.some(
      (issue) => issue.code === "CLOSING_STOCK_MISMATCH",
    ),
    true,
  );
  assert.equal(
    preview.rows.every((row) =>
      row.issues.some((issue) => issue.code === "DUPLICATE_IN_FILE"),
    ),
    true,
  );
});

test("invalid file formats fail before creating a batch", async () => {
  const store = new FakeStore();
  const service = serviceFor(store);
  const buffer = Buffer.from("not an xlsx file");

  await assert.rejects(
    () =>
      service.preview({
        user: staff,
        fileName: "inventory.csv",
        fileSize: buffer.length,
        buffer,
        datasetKind: "synthetic",
        correctionMode: "reject",
      }),
    (error: unknown) =>
      error instanceof InventoryError &&
      error.code === "UNSUPPORTED_FILE_FORMAT" &&
      error.status === 415,
  );

  assert.equal(store.created.length, 0);
});

test("Excel date cells are parsed as calendar dates without timezone drift", async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Inventory");

  sheet.addRow([...INVENTORY_TEMPLATE_COLUMNS]);
  const row = inventoryRow({ report_date: new Date(Date.UTC(2026, 9, 24)) });
  sheet.addRow(
    INVENTORY_TEMPLATE_COLUMNS.map((column) => row[column] ?? null),
  );
  sheet.getCell("A2").numFmt = "yyyy-mm-dd";
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  const parsed = await parseInventoryWorkbook(buffer);

  assert.equal(parsed.fileErrors.length, 0);
  const parsedDate = parsed.rows[0]?.values.report_date;
  assert.equal(parsedDate instanceof Date, true);
  assert.equal(
    `${(parsedDate as Date).getUTCFullYear()}-${String(
      (parsedDate as Date).getUTCMonth() + 1,
    ).padStart(2, "0")}-${String((parsedDate as Date).getUTCDate()).padStart(
      2,
      "0",
    )}`,
    "2026-10-24",
  );

  const results = validateInventoryRows(parsed.rows, {
    datasetKind: "synthetic",
    correctionMode: "reject",
    existingKeys: new Set<string>(),
    reference: catalog,
    allHospitals: true,
    allowedHospitalIds: new Set<number>(),
    today: "2026-10-26",
  });

  assert.equal(results[0]?.data?.report_date, "2026-10-24");
});

function makeLargeCatalog(medicineCount: number): InventoryReferenceCatalog {
  const medicines = [];
  for (let i = 1; i <= medicineCount; i++) {
    medicines.push({ id: i, name: `Medicine ${i}`, unit: "tablet" });
  }
  return {
    hospitals: [{ id: 1, name: "City Hospital" }],
    medicines,
  };
}

async function largeWorkbookBuffer(rowCount: number): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Inventory");

  sheet.addRow([...INVENTORY_TEMPLATE_COLUMNS]);

  for (let i = 1; i <= rowCount; i++) {
    sheet.addRow([
      "2026-10-24", // report_date
      1,            // hospital_id
      i,            // medicine_id
      `Medicine ${i}`, // medicine_name
      "tablet",     // unit
      100,          // opening_stock
      50,           // quantity_received
      40,           // quantity_dispensed
      0,            // quantity_expired_or_written_off
      0,            // adjustments
      110,          // closing_stock (100 + 50 - 40 - 0 + 0 = 110)
      40,           // minimum_stock_level
      20,           // safety_stock
      5,            // reserved_stock
      20,           // pending_order_quantity
      "SUP-001",    // supplier_id
      "2026-10-20", // order_date
      "2026-10-25", // expected_delivery_date
      "",           // actual_delivery_date
      5,            // typical_lead_time_days
      false,        // stockout_flag
      0,            // unmet_demand_quantity
      "Synthetic demo", // data_source
    ]);
  }

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

test("valid 100-row workbook previews, stages, and persists all 100 records end-to-end", async () => {
  const store = new FakeStore({ catalog: makeLargeCatalog(100) });
  const service = serviceFor(store);
  const buffer = await largeWorkbookBuffer(100);

  const preview = await service.preview({
    user: staff,
    fileName: "inventory-100.xlsx",
    fileSize: buffer.length,
    buffer,
    datasetKind: "synthetic",
    correctionMode: "reject",
  });

  assert.equal(preview.rowCount, 100);
  assert.equal(preview.acceptedCount, 100);
  assert.equal(preview.rejectedCount, 0);
  assert.equal(preview.warningCount, 0);

  const imported = await service.confirm(staff, preview.batchId);
  assert.equal(imported.importedCount, 100);
  assert.equal(store.persistedReports.size, 100);
});

test("valid 1,999-row workbook previews, stages, and persists all 1,999 records end-to-end", async () => {
  const store = new FakeStore({ catalog: makeLargeCatalog(1999) });
  const service = serviceFor(store);
  const buffer = await largeWorkbookBuffer(1999);

  const preview = await service.preview({
    user: staff,
    fileName: "inventory-1999.xlsx",
    fileSize: buffer.length,
    buffer,
    datasetKind: "synthetic",
    correctionMode: "reject",
  });

  assert.equal(preview.rowCount, 1999);
  assert.equal(preview.acceptedCount, 1999);
  assert.equal(preview.rejectedCount, 0);

  const imported = await service.confirm(staff, preview.batchId);
  assert.equal(imported.importedCount, 1999);
  assert.equal(store.persistedReports.size, 1999);
});

test("valid 2,001-row workbook previews, stages, and persists all 2,001 records without hitting previous 2,000 cap", async () => {
  const store = new FakeStore({ catalog: makeLargeCatalog(2001) });
  const service = serviceFor(store);
  const buffer = await largeWorkbookBuffer(2001);

  const preview = await service.preview({
    user: staff,
    fileName: "inventory-2001.xlsx",
    fileSize: buffer.length,
    buffer,
    datasetKind: "synthetic",
    correctionMode: "reject",
  });

  assert.equal(preview.rowCount, 2001);
  assert.equal(preview.acceptedCount, 2001);
  assert.equal(preview.rejectedCount, 0);

  const imported = await service.confirm(staff, preview.batchId);
  assert.equal(imported.importedCount, 2001);
  assert.equal(store.persistedReports.size, 2001);
});

test("valid 4,500-row workbook previews, stages, and persists all 4,500 records end-to-end", async () => {
  const store = new FakeStore({ catalog: makeLargeCatalog(4500) });
  const service = serviceFor(store);
  const buffer = await largeWorkbookBuffer(4500);

  const preview = await service.preview({
    user: staff,
    fileName: "inventory-4500.xlsx",
    fileSize: buffer.length,
    buffer,
    datasetKind: "synthetic",
    correctionMode: "reject",
  });

  assert.equal(preview.rowCount, 4500);
  assert.equal(preview.acceptedCount, 4500);
  assert.equal(preview.rejectedCount, 0);
  assert.equal(store.created[0]?.stagedRows.length, 4500);

  const imported = await service.confirm(staff, preview.batchId);
  assert.equal(imported.importedCount, 4500);
  assert.equal(store.persistedReports.size, 4500);
});

test("valid 10,000-row workbook previews, stages, and persists exactly 10,000 records end-to-end", async () => {
  const store = new FakeStore({ catalog: makeLargeCatalog(10000) });
  const service = serviceFor(store);
  const buffer = await largeWorkbookBuffer(10000);

  const preview = await service.preview({
    user: staff,
    fileName: "inventory-10000.xlsx",
    fileSize: buffer.length,
    buffer,
    datasetKind: "synthetic",
    correctionMode: "reject",
  });

  assert.equal(preview.rowCount, 10000);
  assert.equal(preview.acceptedCount, 10000);
  assert.equal(preview.rejectedCount, 0);
  assert.equal(store.created[0]?.stagedRows.length, 10000);

  const imported = await service.confirm(staff, preview.batchId);
  assert.equal(imported.importedCount, 10000);
  assert.equal(store.persistedReports.size, 10000);
});

test("workbook with 10,001 data rows is rejected with clear TOO_MANY_ROWS error and not silently truncated", async () => {
  const store = new FakeStore({ catalog: makeLargeCatalog(10001) });
  const service = serviceFor(store);
  const buffer = await largeWorkbookBuffer(10001);

  await assert.rejects(
    () =>
      service.preview({
        user: staff,
        fileName: "inventory-10001.xlsx",
        fileSize: buffer.length,
        buffer,
        datasetKind: "synthetic",
        correctionMode: "reject",
      }),
    (error: unknown) => {
      assert.equal(error instanceof InventoryError, true);
      const invErr = error as InventoryError;
      assert.equal(invErr.status, 422);
      assert.equal(invErr.code, "INVENTORY_FILE_INVALID");
      const details = invErr.details as { fileErrors?: Array<{ code: string; message: string }> };
      assert.equal(
        details?.fileErrors?.some((e) => e.code === "TOO_MANY_ROWS"),
        true,
      );
      assert.match(
        details?.fileErrors?.find((e) => e.code === "TOO_MANY_ROWS")?.message ?? "",
        /A single file may contain at most 10000 inventory rows/,
      );
      return true;
    },
  );

  assert.equal(store.created.length, 0);
  assert.equal(store.persistedReports.size, 0);
});

test("missing required columns rejects workbook with MISSING_COLUMNS error", async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Inventory");
  sheet.addRow(["report_date", "hospital_id", "medicine_id"]);
  sheet.addRow(["2026-10-24", 1, 1]);
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

  const service = serviceFor(new FakeStore());
  await assert.rejects(
    () =>
      service.preview({
        user: staff,
        fileName: "incomplete.xlsx",
        fileSize: buffer.length,
        buffer,
        datasetKind: "synthetic",
        correctionMode: "reject",
      }),
    (error: unknown) => {
      assert.equal(error instanceof InventoryError, true);
      const invErr = error as InventoryError;
      assert.equal(invErr.status, 422);
      const details = invErr.details as { fileErrors?: Array<{ code: string }> };
      assert.equal(
        details?.fileErrors?.some((e) => e.code === "MISSING_COLUMNS"),
        true,
      );
      return true;
    },
  );
});

test("invalid dates and unknown IDs reject rows with specific issue codes", async () => {
  const store = new FakeStore();
  const service = serviceFor(store);
  const buffer = await workbookBuffer([
    inventoryRow({ report_date: "2026-11-01" }), // future date
    inventoryRow({ hospital_id: 999 }), // unknown hospital
    inventoryRow({ medicine_id: 999 }), // unknown medicine
  ]);

  const preview = await service.preview({
    user: staff,
    fileName: "invalid-fields.xlsx",
    fileSize: buffer.length,
    buffer,
    datasetKind: "synthetic",
    correctionMode: "reject",
  });

  assert.equal(preview.rejectedCount, 3);
  assert.equal(preview.acceptedCount, 0);
  assert.equal(
    preview.rows[0]?.issues.some((e) => e.code === "FUTURE_REPORT_DATE"),
    true,
  );
  assert.equal(
    preview.rows[1]?.issues.some((e) => e.code === "UNKNOWN_HOSPITAL"),
    true,
  );
  assert.equal(
    preview.rows[2]?.issues.some((e) => e.code === "UNKNOWN_MEDICINE"),
    true,
  );
});

test("invalid numeric fields and non-integer IDs are flagged with errors", async () => {
  const store = new FakeStore();
  const service = serviceFor(store);
  const buffer = await workbookBuffer([
    inventoryRow({ opening_stock: -10, closing_stock: 0 }),
    inventoryRow({ closing_stock: "not-a-number" }),
    inventoryRow({ hospital_id: 1.5 }),
  ]);

  const preview = await service.preview({
    user: staff,
    fileName: "invalid-numbers.xlsx",
    fileSize: buffer.length,
    buffer,
    datasetKind: "synthetic",
    correctionMode: "reject",
  });

  assert.equal(preview.rejectedCount, 3);
  assert.equal(
    preview.rows[0]?.issues.some((e) => e.code === "NEGATIVE_NOT_ALLOWED"),
    true,
  );
  assert.equal(
    preview.rows[1]?.issues.some((e) => e.code === "INVALID_NUMBER"),
    true,
  );
  assert.equal(
    preview.rows[2]?.issues.some((e) => e.code === "INVALID_INTEGER"),
    true,
  );
});

test("failure during database insertion prevents false success and preserves state", async () => {
  const store = new FakeStore({ catalog: makeLargeCatalog(100) });
  const service = serviceFor(store);
  const buffer = await largeWorkbookBuffer(100);

  const preview = await service.preview({
    user: staff,
    fileName: "fail-test.xlsx",
    fileSize: buffer.length,
    buffer,
    datasetKind: "synthetic",
    correctionMode: "reject",
  });

  store.failCommitOnBatchId = preview.batchId;

  await assert.rejects(
    () => service.confirm(staff, preview.batchId),
    (error: unknown) =>
      error instanceof InventoryError &&
      error.code === "INVENTORY_STORAGE_ERROR" &&
      error.status === 500,
  );

  assert.equal(store.persistedReports.size, 0);
});
