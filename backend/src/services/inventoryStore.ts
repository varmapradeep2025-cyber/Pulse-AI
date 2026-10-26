import { supabase } from "../utils/supabase.js";
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

function throwStoreError(error: SupabaseError, operation: string): never {
  if (
    error.code &&
    MISSING_SCHEMA_CODES.has(error.code)
  ) {
    throw new InventoryError(
      503,
      "INVENTORY_SCHEMA_NOT_READY",
      "Inventory import storage is not configured yet. Apply the inventory migration before using uploads.",
    );
  }

  if (error.message?.includes("does not exist")) {
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

class SupabaseInventoryStore implements InventoryStore {
  async loadReferenceCatalog(): Promise<InventoryReferenceCatalog> {
    const [hospitalsResult, medicinesResult] = await Promise.all([
      supabase.from("hospitals").select("id,name").order("id"),
      supabase.from("medicines").select("id,name,unit").order("id"),
    ]);

    if (hospitalsResult.error) {
      throwStoreError(hospitalsResult.error, "hospital catalog");
    }

    if (medicinesResult.error) {
      throwStoreError(medicinesResult.error, "medicine catalog");
    }

    return {
      hospitals: (hospitalsResult.data ?? []).map((hospital) => ({
        id: toNumber(hospital.id),
        name: String(hospital.name ?? ""),
      })),
      medicines: (medicinesResult.data ?? []).map((medicine) => ({
        id: toNumber(medicine.id),
        name: String(medicine.name ?? ""),
        unit: String(medicine.unit ?? ""),
      })),
    };
  }

  async findExistingKeys(
    datasetKind: InventoryDatasetKind,
    keys: string[],
  ): Promise<ReadonlySet<string>> {
    const found = new Set<string>();

    if (keys.length === 0) {
      return found;
    }

    for (let offset = 0; offset < keys.length; offset += 100) {
      const chunk = keys.slice(offset, offset + 100);
      const { data, error } = await supabase
        .from("inventory_daily_reports")
        .select("report_key")
        .eq("is_synthetic", datasetKind === "synthetic")
        .in("report_key", chunk);

      if (error) {
        throwStoreError(error, "existing report lookup");
      }

      for (const row of data ?? []) {
        if (typeof row.report_key === "string") {
          found.add(row.report_key);
        }
      }
    }

    return found;
  }

  async createBatch(input: CreateInventoryBatchInput): Promise<string> {
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
      throwStoreError(error, "batch creation");
    }

    return String(data.id);
  }

  async getBatch(
    batchId: string,
    userId: string,
  ): Promise<InventoryBatchRecord | null> {
    const { data, error } = await supabase
      .from("inventory_import_batches")
      .select("*")
      .eq("id", batchId)
      .eq("uploaded_by", userId)
      .maybeSingle();

    if (error) {
      throwStoreError(error, "batch lookup");
    }

    return data ? toBatch(data as Record<string, unknown>) : null;
  }

  async commitBatch(
    batchId: string,
    userId: string,
  ): Promise<InventoryImportResult> {
    const { data, error } = await supabase.rpc("commit_inventory_import", {
      p_batch_id: batchId,
      p_user_id: userId,
    });

    if (error) {
      rpcError(error);
    }

    if (!data || typeof data !== "object") {
      throw new InventoryError(
        500,
        "INVENTORY_IMPORT_ERROR",
        "The inventory import did not return a result.",
      );
    }

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

  async getLedgerSummary(
    scope: InventoryHospitalScope,
  ): Promise<InventoryLedgerSummary> {
    const scoped = !scope.allHospitals;

    if (scoped && scope.hospitalIds.length === 0) {
      return {
        latestReal: null,
        latestSynthetic: null,
        realRowCount: 0,
        syntheticRowCount: 0,
        recentBatches: [],
      };
    }

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

    for (const result of [
      latestReal,
      latestSynthetic,
      realCount,
      syntheticCount,
      recent,
    ]) {
      if (result.error) {
        throwStoreError(result.error, "ledger summary");
      }
    }

    return {
      latestReal: latestReal.data?.report_date
        ? {
            reportDate: String(latestReal.data.report_date),
            rowCount: realCount.count ?? 0,
          }
        : null,
      latestSynthetic: latestSynthetic.data?.report_date
        ? {
            reportDate: String(latestSynthetic.data.report_date),
            rowCount: syntheticCount.count ?? 0,
          }
        : null,
      realRowCount: realCount.count ?? 0,
      syntheticRowCount: syntheticCount.count ?? 0,
      recentBatches: (recent.data ?? []).map((row) =>
        toBatchSummary(row as unknown as Record<string, unknown>),
      ),
    };
  }
}

export const inventoryStore: InventoryStore = new SupabaseInventoryStore();