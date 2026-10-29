import { randomUUID } from "node:crypto";
import { supabase } from "../utils/supabase.js";
import { CATALOG_HOSPITALS, CATALOG_MEDICINES } from "../data/catalog.js";
import { InventoryError } from "./inventoryErrors.js";
import type {
  CreateInventoryBatchInput,
  InventoryBatchRecord,
  InventoryBatchSummary,
  InventoryDatasetKind,
  InventoryImportResult,
  InventoryLedgerSummary,
  InventoryReferenceCatalog,
} from "../types/inventory.js";

const MISSING_SCHEMA_CODES = new Set(["42P01", "PGRST202", "PGRST205"]);

export interface InMemoryReportRow {
  report_key: string;
  report_date: string;
  hospital_id: number;
  medicine_id: number;
  medicine_name: string;
  unit: string;
  quantity_dispensed: number;
  closing_stock: number;
  minimum_stock_level: number | null;
  safety_stock: number | null;
  reserved_stock?: number | null;
  pending_order_quantity?: number | null;
  expected_delivery_date?: string | null;
  supplier_id?: string | null;
  stockout_flag?: boolean | null;
  unmet_demand_quantity?: number | null;
  data_source?: string | null;
  imported_at: string;
  is_synthetic: boolean;
}

const inMemoryBatches = new Map<string, InventoryBatchRecord>();
const inMemoryReports: InMemoryReportRow[] = [];

export function getCommittedInMemoryReports(scopeIds?: number[]): {
  rows: InMemoryReportRow[];
  kind: "real" | "synthetic";
} | null {
  if (inMemoryReports.length === 0) {
    return null;
  }

  const allowedSet =
    scopeIds && scopeIds.length > 0 ? new Set(scopeIds) : undefined;
  const filtered = inMemoryReports.filter(
    (row) => allowedSet === undefined || allowedSet.has(row.hospital_id),
  );

  if (filtered.length === 0) {
    return null;
  }

  const hasReal = filtered.some((r) => !r.is_synthetic);
  const rows = filtered.filter((r) =>
    hasReal ? !r.is_synthetic : r.is_synthetic,
  );

  return {
    rows,
    kind: hasReal ? "real" : "synthetic",
  };
}

export function clearCommittedInMemoryReports(): void {
  inMemoryBatches.clear();
  inMemoryReports.length = 0;
}

export interface InventoryHospitalScope {
  allHospitals: boolean;
  hospitalIds: number[];
}

export interface InventoryStore {
  loadReferenceCatalog(): Promise<InventoryReferenceCatalog>;
  findExistingKeys(
    datasetKind: InventoryDatasetKind,
    keys: string[],
  ): Promise<ReadonlySet<string>>;
  createBatch(input: CreateInventoryBatchInput): Promise<string>;
  getBatch(batchId: string, userId: string): Promise<InventoryBatchRecord | null>;
  commitBatch(batchId: string, userId: string): Promise<InventoryImportResult>;
  getLedgerSummary(scope: InventoryHospitalScope): Promise<InventoryLedgerSummary>;
}

interface SupabaseError {
  code?: string;
  message?: string;
}

function isMissingSchema(error: SupabaseError | null | undefined): boolean {
  return Boolean(
    error &&
      ((error.code && MISSING_SCHEMA_CODES.has(error.code)) ||
        error.message?.includes("does not exist") ||
        error.message?.includes("Could not find the table") ||
        error.message?.includes("fetch failed") ||
        error.message?.includes("ECONNREFUSED")),
  );
}

function emptyLedgerSummary(storageReady: boolean): InventoryLedgerSummary {
  return {
    storageReady,
    latestReal: null,
    latestSynthetic: null,
    realRowCount: 0,
    syntheticRowCount: 0,
    recentBatches: [],
    active: null,
  };
}

function throwStoreError(error: SupabaseError, operation: string): never {
  if (isMissingSchema(error)) {
    throw new InventoryError(
      503,
      "INVENTORY_SCHEMA_NOT_READY",
      "Inventory import storage is not configured yet. Apply the inventory migration before using uploads.",
    );
  }

  console.error(`Inventory store ${operation} failed:`, error.message ?? error.code);

  throw new InventoryError(
    500,
    "INVENTORY_STORAGE_ERROR",
    "The inventory storage service could not complete this request.",
  );
}

function toNumber(value: unknown): number {
  return typeof value === "number" ? value : Number(value);
}

function toBatch(row: Record<string, unknown>): InventoryBatchRecord {
  return {
    id: String(row.id),
    uploaded_by: String(row.uploaded_by ?? ""),
    original_filename: String(row.original_filename ?? ""),
    file_sha256: String(row.file_sha256 ?? ""),
    dataset_kind: row.dataset_kind as InventoryDatasetKind,
    correction_mode: row.correction_mode as InventoryBatchRecord["correction_mode"],
    status: row.status as InventoryBatchRecord["status"],
    reporting_period_start:
      (row.reporting_period_start as string | null) ?? null,
    reporting_period_end:
      (row.reporting_period_end as string | null) ?? null,
    row_count: toNumber(row.row_count),
    accepted_count: toNumber(row.accepted_count),
    warning_count: toNumber(row.warning_count),
    rejected_count: toNumber(row.rejected_count),
    replacement_count: toNumber(row.replacement_count),
    hospital_ids: Array.isArray(row.hospital_ids)
      ? row.hospital_ids.map((id) => toNumber(id))
      : [],
    file_errors: Array.isArray(row.file_errors)
      ? (row.file_errors as InventoryBatchRecord["file_errors"])
      : [],
    file_warnings: Array.isArray(row.file_warnings)
      ? (row.file_warnings as InventoryBatchRecord["file_warnings"])
      : [],
    validation_results: Array.isArray(row.validation_results)
      ? (row.validation_results as InventoryBatchRecord["validation_results"])
      : [],
    staged_rows: Array.isArray(row.staged_rows)
      ? (row.staged_rows as InventoryBatchRecord["staged_rows"])
      : null,
    created_at: String(row.created_at),
    imported_at: (row.imported_at as string | null) ?? null,
    expires_at: String(row.expires_at),
  };
}

function toBatchSummary(row: Record<string, unknown>): InventoryBatchSummary {
  const batch = toBatch(row);

  return {
    batchId: batch.id,
    fileName: batch.original_filename,
    datasetKind: batch.dataset_kind,
    correctionMode: batch.correction_mode,
    status: batch.status,
    reportingPeriodStart: batch.reporting_period_start,
    reportingPeriodEnd: batch.reporting_period_end,
    rowCount: batch.row_count,
    acceptedCount: batch.accepted_count,
    warningCount: batch.warning_count,
    rejectedCount: batch.rejected_count,
    replacementCount: batch.replacement_count,
    createdAt: batch.created_at,
    importedAt: batch.imported_at,
    expiresAt: batch.expires_at,
  };
}

function batchFields() {
  return [
    "id",
    "uploaded_by",
    "original_filename",
    "file_sha256",
    "dataset_kind",
    "correction_mode",
    "status",
    "reporting_period_start",
    "reporting_period_end",
    "row_count",
    "accepted_count",
    "warning_count",
    "rejected_count",
    "replacement_count",
    "hospital_ids",
    "created_at",
    "imported_at",
    "expires_at",
  ].join(",");
}

function rpcError(error: SupabaseError): never {
  if (error.code && MISSING_SCHEMA_CODES.has(error.code)) {
    throw new InventoryError(
      503,
      "INVENTORY_SCHEMA_NOT_READY",
      "Inventory import storage is not configured yet. Apply the inventory migration before using uploads.",
    );
  }

  const message = error.message ?? "";

  if (message.includes("BATCH_NOT_FOUND")) {
    throw new InventoryError(
      404,
      "IMPORT_BATCH_NOT_FOUND",
      "That import preview was not found.",
    );
  }

  if (message.includes("BATCH_EXPIRED")) {
    throw new InventoryError(
      409,
      "IMPORT_BATCH_EXPIRED",
      "That import preview has expired. Upload the workbook again.",
    );
  }

  if (message.includes("EXISTING_REPORTS")) {
    throw new InventoryError(
      409,
      "EXISTING_REPORTS",
      "Some reports already exist. Upload again and choose Replace existing to correct them.",
    );
  }

  if (message.includes("NO_ACCEPTED_ROWS")) {
    throw new InventoryError(
      409,
      "NO_ACCEPTED_ROWS",
      "There are no accepted rows to import.",
    );
  }

  if (message.includes("IMPORT_RETRY_REQUIRED")) {
    throw new InventoryError(
      409,
      "IMPORT_RETRY_REQUIRED",
      "The inventory store changed during import. Upload the workbook again.",
    );
  }

  if (message.includes("BATCH_NOT_IMPORTABLE")) {
    throw new InventoryError(
      409,
      "IMPORT_BATCH_NOT_IMPORTABLE",
      "That import preview cannot be confirmed.",
    );
  }

  console.error("Inventory import RPC failed:", message || error.code);

  throw new InventoryError(
    500,
    "INVENTORY_IMPORT_ERROR",
    "The inventory import could not be completed.",
  );
}

let supabaseStorageAvailable: boolean | null = null;

class SupabaseInventoryStore implements InventoryStore {
  private fallbackCatalog(): InventoryReferenceCatalog {
    return {
      hospitals: CATALOG_HOSPITALS.map((h) => ({
        id: h.hospital_id,
        name: h.hospital_name,
      })),
      medicines: CATALOG_MEDICINES.map((m) => ({
        id: m.medicine_id,
        name: m.generic_name,
        unit: m.unit,
      })),
    };
  }

  async loadReferenceCatalog(): Promise<InventoryReferenceCatalog> {
    if (supabaseStorageAvailable === false) {
      return this.fallbackCatalog();
    }

    try {
      const [hospitalsResult, medicinesResult] = await Promise.all([
        supabase.from("hospitals").select("id,name").order("id"),
        supabase.from("medicines").select("id,name,unit").order("id"),
      ]);

      if (hospitalsResult.error || medicinesResult.error) {
        if (
          isMissingSchema(hospitalsResult.error) ||
          isMissingSchema(medicinesResult.error)
        ) {
          supabaseStorageAvailable = false;
          return this.fallbackCatalog();
        }

        throwStoreError(
          hospitalsResult.error ?? medicinesResult.error!,
          "hospital catalog",
        );
      }

      const hospitals = (hospitalsResult.data ?? []).map((hospital) => ({
        id: toNumber(hospital.id),
        name: String(hospital.name ?? ""),
      }));
      const medicines = (medicinesResult.data ?? []).map((medicine) => ({
        id: toNumber(medicine.id),
        name: String(medicine.name ?? ""),
        unit: String(medicine.unit ?? ""),
      }));

      if (hospitals.length === 0 || medicines.length === 0) {
        supabaseStorageAvailable = false;
        return this.fallbackCatalog();
      }

      supabaseStorageAvailable = true;
      return { hospitals, medicines };
    } catch {
      supabaseStorageAvailable = false;
      return this.fallbackCatalog();
    }
  }

  async findExistingKeys(
    datasetKind: InventoryDatasetKind,
    keys: string[],
  ): Promise<ReadonlySet<string>> {
    const found = new Set<string>();

    if (keys.length === 0) {
      return found;
    }

    for (const report of inMemoryReports) {
      if (
        (datasetKind === "synthetic" ? report.is_synthetic : !report.is_synthetic) &&
        keys.includes(report.report_key)
      ) {
        found.add(report.report_key);
      }
    }

    if (supabaseStorageAvailable === false) {
      return found;
    }

    try {
      for (let offset = 0; offset < keys.length; offset += 100) {
        const chunk = keys.slice(offset, offset + 100);
        const { data, error } = await supabase
          .from("inventory_daily_reports")
          .select("report_key")
          .eq("is_synthetic", datasetKind === "synthetic")
          .in("report_key", chunk);

        if (error) {
          if (isMissingSchema(error)) {
            supabaseStorageAvailable = false;
            return found;
          }
          throwStoreError(error, "existing report lookup");
        }

        for (const row of data ?? []) {
          if (typeof row.report_key === "string") {
            found.add(row.report_key);
          }
        }
      }
    } catch {
      supabaseStorageAvailable = false;
      return found;
    }

    return found;
  }

  async createBatch(input: CreateInventoryBatchInput): Promise<string> {
    const memoryId = randomUUID();
    const batchRecord: InventoryBatchRecord = {
      id: memoryId,
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
    };

    inMemoryBatches.set(memoryId, batchRecord);

    if (supabaseStorageAvailable === false) {
      return memoryId;
    }

    try {
      const { data, error } = await supabase
        .from("inventory_import_batches")
        .insert({
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
          expires_at: input.expiresAt,
        })
        .select("id")
        .single();

      if (error) {
        if (isMissingSchema(error)) {
          supabaseStorageAvailable = false;
          return memoryId;
        }
        throwStoreError(error, "batch creation");
      }

      if (data?.id) {
        const idStr = String(data.id);
        batchRecord.id = idStr;
        inMemoryBatches.set(idStr, batchRecord);
        return idStr;
      }
    } catch {
      supabaseStorageAvailable = false;
      return memoryId;
    }

    return memoryId;
  }

  async getBatch(
    batchId: string,
    userId: string,
  ): Promise<InventoryBatchRecord | null> {
    if (supabaseStorageAvailable === false) {
      const memory = inMemoryBatches.get(batchId);
      if (memory && memory.uploaded_by === userId) {
        return memory;
      }
      return null;
    }

    try {
      const { data, error } = await supabase
        .from("inventory_import_batches")
        .select("*")
        .eq("id", batchId)
        .eq("uploaded_by", userId)
        .maybeSingle();

      if (error && !isMissingSchema(error)) {
        throwStoreError(error, "batch lookup");
      }

      if (data) {
        return toBatch(data as Record<string, unknown>);
      }
    } catch {
      supabaseStorageAvailable = false;
    }

    const memory = inMemoryBatches.get(batchId);
    if (memory && memory.uploaded_by === userId) {
      return memory;
    }

    return null;
  }

  private commitInMemoryBatch(batchId: string): InventoryImportResult {
    const batch = inMemoryBatches.get(batchId);
    if (!batch) {
      throw new InventoryError(404, "BATCH_NOT_FOUND", "Import batch not found.");
    }

    if (batch.status === "imported") {
      throw new InventoryError(
        409,
        "BATCH_ALREADY_IMPORTED",
        "This batch has already been imported.",
      );
    }

    const nowIso = new Date().toISOString();
    const staged = ((batch.staged_rows ?? []) as unknown) as Array<Record<string, unknown>>;
    let importedCount = 0;
    let replacedCount = 0;

    for (const row of staged) {
      const reportDate = String(row.report_date ?? "");
      const hospitalId = Number(row.hospital_id);
      const medicineId = Number(row.medicine_id);
      const reportKey = `${reportDate}|${hospitalId}|${medicineId}`;
      const isSynthetic = batch.dataset_kind === "synthetic";

      const existingIndex = inMemoryReports.findIndex(
        (r) => r.report_key === reportKey && r.is_synthetic === isSynthetic,
      );

      const reportRecord: InMemoryReportRow = {
        report_key: reportKey,
        report_date: reportDate,
        hospital_id: hospitalId,
        medicine_id: medicineId,
        medicine_name: String(
          row.medicine_name ?? `Medicine ${medicineId}`,
        ),
        unit: String(row.unit ?? "units"),
        quantity_dispensed: Number(row.quantity_dispensed ?? 0),
        closing_stock: Number(row.closing_stock ?? 0),
        minimum_stock_level:
          row.minimum_stock_level !== undefined &&
          row.minimum_stock_level !== null
            ? Number(row.minimum_stock_level)
            : null,
        safety_stock: Number(
          row.safety_stock ?? row.minimum_stock_level ?? 0,
        ),
        reserved_stock:
          row.reserved_stock !== undefined && row.reserved_stock !== null
            ? Number(row.reserved_stock)
            : null,
        pending_order_quantity:
          row.pending_order_quantity !== undefined &&
          row.pending_order_quantity !== null
            ? Number(row.pending_order_quantity)
            : null,
        expected_delivery_date:
          typeof row.expected_delivery_date === "string"
            ? row.expected_delivery_date
            : null,
        supplier_id:
          typeof row.supplier_id === "string" ? row.supplier_id : null,
        stockout_flag:
          typeof row.stockout_flag === "boolean" ? row.stockout_flag : null,
        unmet_demand_quantity:
          row.unmet_demand_quantity !== undefined &&
          row.unmet_demand_quantity !== null
            ? Number(row.unmet_demand_quantity)
            : null,
        data_source:
          typeof row.data_source === "string"
            ? row.data_source
            : isSynthetic
              ? "Synthetic demo"
              : "Real hospital data",
        imported_at: nowIso,
        is_synthetic: isSynthetic,
      };

      if (existingIndex >= 0) {
        if (batch.correction_mode === "replace") {
          inMemoryReports[existingIndex] = reportRecord;
          replacedCount += 1;
        }
      } else {
        inMemoryReports.push(reportRecord);
        importedCount += 1;
      }
    }

    batch.status = "imported";
    batch.imported_at = nowIso;

    return {
      batchId,
      status: "imported",
      datasetKind: batch.dataset_kind,
      importedCount,
      replacedCount,
      rejectedCount: batch.rejected_count,
      reportingPeriodStart: batch.reporting_period_start,
      reportingPeriodEnd: batch.reporting_period_end,
      importedAt: nowIso,
    };
  }

  async commitBatch(
    batchId: string,
    userId: string,
  ): Promise<InventoryImportResult> {
    if (supabaseStorageAvailable === false) {
      return this.commitInMemoryBatch(batchId);
    }

    try {
      const { data, error } = await supabase.rpc("commit_inventory_import", {
        p_batch_id: batchId,
        p_user_id: userId,
      });

      if (!error && data && typeof data === "object") {
        const result = data as Record<string, unknown>;
        return {
          batchId: String(result.batch_id ?? batchId),
          status: "imported",
          datasetKind: result.dataset_kind as InventoryDatasetKind,
          importedCount: toNumber(result.imported_count),
          replacedCount: toNumber(result.replaced_count),
          rejectedCount: toNumber(result.rejected_count),
          reportingPeriodStart:
            (result.reporting_period_start as string | null) ?? null,
          reportingPeriodEnd:
            (result.reporting_period_end as string | null) ?? null,
          importedAt: String(result.imported_at ?? new Date().toISOString()),
        };
      }

      if (error && !isMissingSchema(error)) {
        rpcError(error);
      }
    } catch {
      supabaseStorageAvailable = false;
    }

    return this.commitInMemoryBatch(batchId);
  }

  private computeInMemoryLedgerSummary(
    scope: InventoryHospitalScope,
  ): InventoryLedgerSummary {
    const filteredReports = inMemoryReports.filter(
      (r) => scope.allHospitals || scope.hospitalIds.includes(r.hospital_id),
    );
    const realReports = filteredReports.filter((r) => !r.is_synthetic);
    const syntheticReports = filteredReports.filter((r) => r.is_synthetic);

    const realDates = realReports
      .map((r) => r.report_date)
      .sort()
      .reverse();
    const syntheticDates = syntheticReports
      .map((r) => r.report_date)
      .sort()
      .reverse();

    const recentBatches: InventoryBatchSummary[] = [...inMemoryBatches.values()]
      .filter(
        (b) =>
          scope.allHospitals ||
          b.hospital_ids.some((id) => scope.hospitalIds.includes(id)),
      )
      .map((b) => ({
        batchId: b.id,
        fileName: b.original_filename,
        datasetKind: b.dataset_kind,
        correctionMode: b.correction_mode,
        status: b.status,
        reportingPeriodStart: b.reporting_period_start,
        reportingPeriodEnd: b.reporting_period_end,
        rowCount: b.row_count,
        acceptedCount: b.accepted_count,
        warningCount: b.warning_count,
        rejectedCount: b.rejected_count,
        replacementCount: b.replacement_count,
        createdAt: b.created_at,
        importedAt: b.imported_at,
        expiresAt: b.expires_at,
      }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 10);

    return {
      storageReady: true,
      latestReal: realDates[0]
        ? { reportDate: realDates[0], rowCount: realReports.length }
        : null,
      latestSynthetic: syntheticDates[0]
        ? { reportDate: syntheticDates[0], rowCount: syntheticReports.length }
        : null,
      realRowCount: realReports.length,
      syntheticRowCount: syntheticReports.length,
      recentBatches,
      active: null,
    };
  }

  async getLedgerSummary(
    scope: InventoryHospitalScope,
  ): Promise<InventoryLedgerSummary> {
    const scoped = !scope.allHospitals;

    if (scoped && scope.hospitalIds.length === 0) {
      return emptyLedgerSummary(true);
    }

    if (supabaseStorageAvailable === false) {
      return this.computeInMemoryLedgerSummary(scope);
    }

    try {
      let latestRealQuery = supabase
        .from("inventory_daily_reports")
        .select("report_date")
        .eq("is_synthetic", false)
        .order("report_date", { ascending: false })
        .limit(1);
      let latestSyntheticQuery = supabase
        .from("inventory_daily_reports")
        .select("report_date")
        .eq("is_synthetic", true)
        .order("report_date", { ascending: false })
        .limit(1);
      let realCountQuery = supabase
        .from("inventory_daily_reports")
        .select("id", { count: "exact", head: true })
        .eq("is_synthetic", false);
      let syntheticCountQuery = supabase
        .from("inventory_daily_reports")
        .select("id", { count: "exact", head: true })
        .eq("is_synthetic", true);
      let recentQuery = supabase
        .from("inventory_import_batches")
        .select(batchFields())
        .order("created_at", { ascending: false })
        .limit(10);

      if (scoped) {
        latestRealQuery = latestRealQuery.in(
          "hospital_id",
          scope.hospitalIds,
        );
        latestSyntheticQuery = latestSyntheticQuery.in(
          "hospital_id",
          scope.hospitalIds,
        );
        realCountQuery = realCountQuery.in("hospital_id", scope.hospitalIds);
        syntheticCountQuery = syntheticCountQuery.in(
          "hospital_id",
          scope.hospitalIds,
        );
        recentQuery = recentQuery.containedBy(
          "hospital_ids",
          scope.hospitalIds,
        );
      }

      const [latestReal, latestSynthetic, realCount, syntheticCount, recent] =
        await Promise.all([
          latestRealQuery.maybeSingle(),
          latestSyntheticQuery.maybeSingle(),
          realCountQuery,
          syntheticCountQuery,
          recentQuery,
        ]);

      const results = [
        latestReal,
        latestSynthetic,
        realCount,
        syntheticCount,
        recent,
      ];

      if (!results.some((result) => isMissingSchema(result.error))) {
        for (const result of results) {
          if (result.error) {
            throwStoreError(result.error, "ledger summary");
          }
        }

        const realCountNum = realCount.count ?? 0;
        const syntheticCountNum = syntheticCount.count ?? 0;

        if (realCountNum > 0 || syntheticCountNum > 0) {
          return {
            storageReady: true,
            latestReal: latestReal.data?.report_date
              ? {
                  reportDate: String(latestReal.data.report_date),
                  rowCount: realCountNum,
                }
              : null,
            latestSynthetic: latestSynthetic.data?.report_date
              ? {
                  reportDate: String(latestSynthetic.data.report_date),
                  rowCount: syntheticCountNum,
                }
              : null,
            realRowCount: realCountNum,
            syntheticRowCount: syntheticCountNum,
            recentBatches: (recent.data ?? []).map((row) =>
              toBatchSummary(row as unknown as Record<string, unknown>),
            ),
            active: null,
          };
        }
      }
    } catch {
      // Fall through to in-memory ledger calculation
    }

    // In-memory ledger summary
    const filteredReports = inMemoryReports.filter(
      (r) => scope.allHospitals || scope.hospitalIds.includes(r.hospital_id),
    );
    const realReports = filteredReports.filter((r) => !r.is_synthetic);
    const syntheticReports = filteredReports.filter((r) => r.is_synthetic);

    const realDates = realReports
      .map((r) => r.report_date)
      .sort()
      .reverse();
    const syntheticDates = syntheticReports
      .map((r) => r.report_date)
      .sort()
      .reverse();

    const recentBatches: InventoryBatchSummary[] = [...inMemoryBatches.values()]
      .filter(
        (b) =>
          scope.allHospitals ||
          b.hospital_ids.some((id) => scope.hospitalIds.includes(id)),
      )
      .map((b) => ({
        batchId: b.id,
        fileName: b.original_filename,
        datasetKind: b.dataset_kind,
        correctionMode: b.correction_mode,
        status: b.status,
        reportingPeriodStart: b.reporting_period_start,
        reportingPeriodEnd: b.reporting_period_end,
        rowCount: b.row_count,
        acceptedCount: b.accepted_count,
        warningCount: b.warning_count,
        rejectedCount: b.rejected_count,
        replacementCount: b.replacement_count,
        createdAt: b.created_at,
        importedAt: b.imported_at,
        expiresAt: b.expires_at,
      }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 10);

    return {
      storageReady: true,
      latestReal: realDates[0]
        ? { reportDate: realDates[0], rowCount: realReports.length }
        : null,
      latestSynthetic: syntheticDates[0]
        ? { reportDate: syntheticDates[0], rowCount: syntheticReports.length }
        : null,
      realRowCount: realReports.length,
      syntheticRowCount: syntheticReports.length,
      recentBatches,
      active: null,
    };
  }
}

export const inventoryStore: InventoryStore = new SupabaseInventoryStore();