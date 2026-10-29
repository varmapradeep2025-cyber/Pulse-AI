import { createHash } from "node:crypto";
import ExcelJS from "exceljs";
import {
  INVENTORY_TEMPLATE_COLUMNS,
  type InventoryCorrectionMode,
  type InventoryDatasetKind,
  type InventoryImportResult,
  type InventoryLedgerSummary,
  type InventoryPreview,
  type InventoryRowResult,
  type InventoryUser,
} from "../types/inventory.js";
import { InventoryError } from "./inventoryErrors.js";
import {
  parseInventoryWorkbook,
  reportingPeriod,
  validateInventoryRows,
} from "./inventoryWorkbook.js";
import type { InventoryStore } from "./inventoryStore.js";
import { hasInventoryHospitalScope } from "./inventoryAccess.js";
import { summarizeOperationalDataset } from "./inventoryDatasetSummary.js";
import {
  analyticsScope,
  loadOperationalDataset,
} from "./operationalData.js";

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const PREVIEW_TTL_MS = 24 * 60 * 60 * 1000;

const COLUMN_GUIDANCE: Record<string, string> = {
  report_date: "Required. Report date in YYYY-MM-DD or DD/MM/YYYY. Future dates are rejected.",
  hospital_id: "Required. Numeric hospital ID from the hospital catalog.",
  medicine_id: "Required. Numeric medicine ID from the medicine catalog.",
  medicine_name: "Required. Name of the medicine. Mismatches with the catalog are warnings.",
  unit: "Required. Must match the medicine catalog unit exactly.",
  opening_stock: "Required. Stock at the start of the reporting day. Zero or more.",
  quantity_received: "Required. Stock received during the reporting day. Zero or more.",
  quantity_dispensed: "Required. Stock dispensed during the reporting day. Zero or more.",
  quantity_expired_or_written_off: "Required. Expired or written-off stock. Zero or more.",
  adjustments: "Required. Signed correction amount. Use a negative value to reduce stock.",
  closing_stock: "Required. Must equal opening + received - dispensed - expired + adjustments.",
  minimum_stock_level: "Required. Local minimum stock target. Zero or more.",
  safety_stock: "Optional. Safety stock threshold used for operational risk. Zero or more.",
  reserved_stock: "Optional. Stock reserved for patients or departments.",
  pending_order_quantity: "Optional. Quantity on order but not yet received.",
  supplier_id: "Optional text. Supplier identifier. Supplier orders are not modified by this import.",
  order_date: "Optional. Supplier order date.",
  expected_delivery_date: "Optional. Expected supplier delivery date.",
  actual_delivery_date: "Optional. Actual supplier delivery date.",
  typical_lead_time_days: "Optional whole number. Typical supplier lead time in days.",
  stockout_flag: "Optional. true/false, yes/no, or 1/0.",
  unmet_demand_quantity: "Optional. Demand that could not be dispensed.",
  data_source: "Optional text. Label the source, especially for synthetic or demo data.",
};

export interface InventoryPreviewRequest {
  user: InventoryUser;
  fileName: string;
  fileSize: number;
  buffer: Buffer;
  datasetKind: string;
  correctionMode: string;
}

function isDatasetKind(value: string): value is InventoryDatasetKind {
  return value === "synthetic" || value === "real";
}

function isCorrectionMode(value: string): value is InventoryCorrectionMode {
  return value === "reject" || value === "replace";
}

function todayInIndia(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function shiftDate(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function acceptedRows(rows: InventoryRowResult[]) {
  return rows.flatMap((row) =>
    row.status !== "rejected" && row.data ? [row.data] : [],
  );
}

function importedResultFromBatch(batch: {
  id: string;
  dataset_kind: InventoryDatasetKind;
  accepted_count: number;
  replacement_count: number;
  rejected_count: number;
  reporting_period_start: string | null;
  reporting_period_end: string | null;
  imported_at: string | null;
}): InventoryImportResult {
  return {
    batchId: batch.id,
    status: "imported",
    datasetKind: batch.dataset_kind,
    importedCount: batch.accepted_count,
    replacedCount: batch.replacement_count,
    rejectedCount: batch.rejected_count,
    reportingPeriodStart: batch.reporting_period_start,
    reportingPeriodEnd: batch.reporting_period_end,
    importedAt: batch.imported_at ?? new Date().toISOString(),
  };
}

export class InventoryImportService {
  constructor(
    private readonly store: InventoryStore,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async preview(request: InventoryPreviewRequest): Promise<InventoryPreview> {
    if (!request.user.isStaff) {
      throw new InventoryError(
        403,
        "INVENTORY_STAFF_ACCESS_REQUIRED",
        "Inventory staff access is required.",
      );
    }

    if (!hasInventoryHospitalScope(request.user)) {
      throw new InventoryError(
        403,
        "INVENTORY_HOSPITAL_SCOPE_REQUIRED",
        "Inventory hospital access is required.",
      );
    }

    if (!isDatasetKind(request.datasetKind)) {
      throw new InventoryError(
        400,
        "INVALID_DATASET_KIND",
        "Choose whether this workbook contains synthetic or real hospital data.",
      );
    }

    if (!isCorrectionMode(request.correctionMode)) {
      throw new InventoryError(
        400,
        "INVALID_CORRECTION_MODE",
        "Choose whether existing reports should be rejected or replaced.",
      );
    }

    if (!request.fileName.toLowerCase().endsWith(".xlsx")) {
      throw new InventoryError(
        415,
        "UNSUPPORTED_FILE_FORMAT",
        "Only .xlsx workbooks are supported.",
      );
    }

    if (request.buffer.length === 0) {
      throw new InventoryError(
        422,
        "EMPTY_FILE",
        "The uploaded workbook is empty.",
      );
    }

    if (request.fileSize > MAX_FILE_BYTES || request.buffer.length > MAX_FILE_BYTES) {
      throw new InventoryError(
        413,
        "FILE_TOO_LARGE",
        "Workbooks must be 5 MB or smaller.",
      );
    }

    const parsed = await parseInventoryWorkbook(request.buffer);

    if (parsed.fileErrors.length > 0) {
      throw new InventoryError(
        422,
        "INVENTORY_FILE_INVALID",
        "The workbook could not be validated. Fix the file errors and upload it again.",
        {
          fileErrors: parsed.fileErrors,
          fileWarnings: parsed.fileWarnings,
        },
      );
    }

    const reference = await this.store.loadReferenceCatalog();
    const validationOptions = {
      datasetKind: request.datasetKind,
      correctionMode: request.correctionMode,
      reference,
      allHospitals: request.user.allHospitals,
      allowedHospitalIds: new Set(request.user.hospitalIds),
      today: todayInIndia(this.now()),
    };
    const initialRows = validateInventoryRows(parsed.rows, {
      ...validationOptions,
      existingKeys: new Set<string>(),
    });
    const keys = [
      ...new Set(
        initialRows
          .filter(
            (row) =>
              !row.issues.some(
                (item) => item.code === "HOSPITAL_NOT_ALLOWED",
              ),
          )
          .map((row) => row.key)
          .filter((key): key is string => Boolean(key)),
      ),
    ];
    const existingKeys = await this.store.findExistingKeys(
      request.datasetKind,
      keys,
    );
    const rows =
      existingKeys.size === 0
        ? initialRows
        : validateInventoryRows(parsed.rows, {
            ...validationOptions,
            existingKeys,
          });
    const period = reportingPeriod(
      rows.filter((row) => row.status !== "rejected"),
    );
    const stagedRows = acceptedRows(rows);
    const hospitalIds = [
      ...new Set(stagedRows.map((row) => row.hospital_id)),
    ];
    const acceptedCount = stagedRows.length;
    const warningCount = rows.filter((row) => row.status === "warning").length;
    const rejectedCount = rows.filter((row) => row.status === "rejected").length;
    const replacementCount = rows.filter(
      (row) =>
        row.status !== "rejected" &&
        row.issues.some((item) => item.code === "REPLACES_EXISTING"),
    ).length;
    const createdAt = this.now();
    const expiresAt = new Date(createdAt.getTime() + PREVIEW_TTL_MS);
    const fileHash = createHash("sha256").update(request.buffer).digest("hex");
    const batchId = await this.store.createBatch({
      uploadedBy: request.user.id,
      originalFilename: request.fileName,
      fileHash,
      datasetKind: request.datasetKind,
      correctionMode: request.correctionMode,
      status: acceptedCount > 0 ? "previewed" : "rejected",
      reportingPeriodStart: period.start,
      reportingPeriodEnd: period.end,
      rowCount: rows.length,
      acceptedCount,
      warningCount,
      rejectedCount,
      replacementCount,
      hospitalIds,
      fileErrors: [],
      fileWarnings: parsed.fileWarnings,
      validationResults: rows,
      stagedRows,
      createdAt: createdAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
    });

    return {
      batchId,
      fileName: request.fileName,
      fileHash,
      datasetKind: request.datasetKind,
      sheetName: parsed.sheetName,
      correctionMode: request.correctionMode,
      status: acceptedCount > 0 ? "previewed" : "rejected",
      reportingPeriodStart: period.start,
      reportingPeriodEnd: period.end,
      rowCount: rows.length,
      acceptedCount,
      warningCount,
      rejectedCount,
      replacementCount,
      hospitalIds,
      fileErrors: [],
      fileWarnings: parsed.fileWarnings,
      rows,
      createdAt: createdAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };
  }

  async confirm(
    user: InventoryUser,
    batchId: string,
  ): Promise<InventoryImportResult> {
    if (!user.isStaff) {
      throw new InventoryError(
        403,
        "INVENTORY_STAFF_ACCESS_REQUIRED",
        "Inventory staff access is required.",
      );
    }

    if (!batchId || !/^[0-9a-f-]{36}$/i.test(batchId)) {
      throw new InventoryError(
        400,
        "INVALID_BATCH_ID",
        "Choose a valid import preview.",
      );
    }

    const batch = await this.store.getBatch(batchId, user.id);

    if (!batch) {
      throw new InventoryError(
        404,
        "IMPORT_BATCH_NOT_FOUND",
        "That import preview was not found.",
      );
    }

    if (batch.status === "imported") {
      return importedResultFromBatch(batch);
    }

    if (batch.status !== "previewed") {
      throw new InventoryError(
        409,
        "IMPORT_BATCH_NOT_IMPORTABLE",
        "That import preview cannot be confirmed. Upload the workbook again.",
      );
    }

    if (new Date(batch.expires_at).getTime() <= this.now().getTime()) {
      throw new InventoryError(
        409,
        "IMPORT_BATCH_EXPIRED",
        "That import preview has expired. Upload the workbook again.",
      );
    }

    if (!batch.staged_rows || batch.staged_rows.length === 0) {
      throw new InventoryError(
        409,
        "NO_ACCEPTED_ROWS",
        "There are no accepted rows to import.",
      );
    }

    const outOfScope = batch.staged_rows.some(
      (row) =>
        !user.allHospitals && !user.hospitalIds.includes(row.hospital_id),
    );

    if (outOfScope) {
      throw new InventoryError(
        403,
        "HOSPITAL_NOT_ALLOWED",
        "This import contains a hospital that is not assigned to your account. Upload the workbook again.",
      );
    }

    return this.store.commitBatch(batch.id, user.id);
  }

  async summary(user: InventoryUser): Promise<InventoryLedgerSummary> {
    if (!user.isStaff) {
      throw new InventoryError(
        403,
        "INVENTORY_STAFF_ACCESS_REQUIRED",
        "Inventory staff access is required.",
      );
    }

    if (!hasInventoryHospitalScope(user)) {
      throw new InventoryError(
        403,
        "INVENTORY_HOSPITAL_SCOPE_REQUIRED",
        "Inventory hospital access is required.",
      );
    }

    const ledger = await this.store.getLedgerSummary({
      allHospitals: user.allHospitals,
      hospitalIds: user.hospitalIds,
    });

    if (!ledger.storageReady) {
      return ledger;
    }

    const dataset = await loadOperationalDataset(
      analyticsScope(user.allHospitals, user.hospitalIds),
    );

    return {
      ...ledger,
      active: summarizeOperationalDataset(dataset),
    };
  }

  async template(
    includeSample: boolean,
    user?: InventoryUser,
  ): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Pulse AI";
    const sheet = workbook.addWorksheet("Inventory");
    const widths: Record<string, number> = {
      report_date: 14,
      hospital_id: 13,
      medicine_id: 13,
      medicine_name: 28,
      unit: 14,
      opening_stock: 15,
      quantity_received: 18,
      quantity_dispensed: 18,
      quantity_expired_or_written_off: 30,
      adjustments: 14,
      closing_stock: 15,
      minimum_stock_level: 20,
      safety_stock: 14,
      reserved_stock: 16,
      pending_order_quantity: 22,
      supplier_id: 16,
      order_date: 14,
      expected_delivery_date: 22,
      actual_delivery_date: 22,
      typical_lead_time_days: 22,
      stockout_flag: 15,
      unmet_demand_quantity: 22,
      data_source: 22,
    };

    sheet.columns = INVENTORY_TEMPLATE_COLUMNS.map((column) => ({
      header: column,
      key: column,
      width: widths[column] ?? 18,
    }));

    const header = sheet.getRow(1);
    header.font = { bold: true, color: { argb: "FFFFFFFF" } };
    header.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF0F766E" },
    };
    header.alignment = { vertical: "middle", wrapText: true };
    header.height = 32;
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    sheet.autoFilter = {
      from: "A1",
      to: `${sheet.getColumn(INVENTORY_TEMPLATE_COLUMNS.length).letter}1`,
    };

    if (includeSample) {
      const reference = await this.store.loadReferenceCatalog();
      const hospitals =
        user && !user.allHospitals
          ? reference.hospitals.filter((item) =>
              user.hospitalIds.includes(item.id),
            )
          : reference.hospitals;
      const hospital = hospitals[0];
      const medicine = reference.medicines[0];

      if (!hospital || !medicine) {
        throw new InventoryError(
          503,
          "INVENTORY_CATALOG_UNAVAILABLE",
          "The hospital or medicine catalog is empty. Add catalog rows before downloading a sample workbook.",
        );
      }

      const reportDate = todayInIndia(this.now());

      sheet.addRow({
        report_date: reportDate,
        hospital_id: hospital.id,
        medicine_id: medicine.id,
        medicine_name: medicine.name,
        unit: medicine.unit,
        opening_stock: 100,
        quantity_received: 50,
        quantity_dispensed: 40,
        quantity_expired_or_written_off: 0,
        adjustments: 0,
        closing_stock: 110,
        minimum_stock_level: 40,
        safety_stock: 20,
        reserved_stock: 5,
        pending_order_quantity: 20,
        supplier_id: "SUP-001",
        order_date: shiftDate(reportDate, -4),
        expected_delivery_date: shiftDate(reportDate, -1),
        actual_delivery_date: "",
        typical_lead_time_days: 3,
        stockout_flag: false,
        unmet_demand_quantity: 0,
        data_source: "Synthetic demo",
      });
    }

    const instructions = workbook.addWorksheet("Instructions");
    instructions.columns = [
      { header: "Field", key: "field", width: 32 },
      { header: "Guidance", key: "guidance", width: 100 },
    ];
    instructions.getRow(1).font = { bold: true };
    for (const column of INVENTORY_TEMPLATE_COLUMNS) {
      instructions.addRow({
        field: column,
        guidance: COLUMN_GUIDANCE[column] ?? "",
      });
    }
    instructions.addRow({});
    instructions.addRow({
      field: "Synthetic vs real",
      guidance:
        "Choose the data class in Pulse AI before uploading. Synthetic and real reports are stored separately and are never silently merged.",
    });
    instructions.addRow({
      field: "Duplicate reports",
      guidance:
        "Use Reject existing by default. Use Replace existing only when this workbook intentionally corrects reports already imported for the same hospital, medicine, and date.",
    });
    instructions.getColumn(2).alignment = { wrapText: true, vertical: "top" };

    return Buffer.from(await workbook.xlsx.writeBuffer());
  }
}
