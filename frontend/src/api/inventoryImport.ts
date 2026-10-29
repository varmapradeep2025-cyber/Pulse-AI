import { supabase } from "../lib/supabase";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";

export type InventoryDatasetKind = "synthetic" | "real";
export type InventoryCorrectionMode = "reject" | "replace";
export type InventoryBatchStatus = "previewed" | "imported" | "rejected";
export type InventoryIssueSeverity = "error" | "warning";
export type InventoryRowStatus = "accepted" | "warning" | "rejected";

export interface InventoryIssue {
  code: string;
  severity: InventoryIssueSeverity;
  message: string;
  field?: string;
}

export interface InventoryReportRow {
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
  safety_stock: number | null;
  reserved_stock: number | null;
  pending_order_quantity: number | null;
  supplier_id: string | null;
  order_date: string | null;
  expected_delivery_date: string | null;
  actual_delivery_date: string | null;
  typical_lead_time_days: number | null;
  stockout_flag: boolean | null;
  unmet_demand_quantity: number | null;
  data_source: string | null;
}

export interface InventoryRowResult {
  row_number: number;
  key: string | null;
  status: InventoryRowStatus;
  issues: InventoryIssue[];
  data: InventoryReportRow | null;
}

export interface InventoryPreview {
  batchId: string;
  fileName: string;
  fileHash: string;
  datasetKind: InventoryDatasetKind;
  correctionMode: InventoryCorrectionMode;
  status: InventoryBatchStatus;
  reportingPeriodStart: string | null;
  reportingPeriodEnd: string | null;
  rowCount: number;
  acceptedCount: number;
  warningCount: number;
  rejectedCount: number;
  replacementCount: number;
  hospitalIds: number[];
  fileErrors: InventoryIssue[];
  fileWarnings: InventoryIssue[];
  rows: InventoryRowResult[];
  createdAt: string;
  expiresAt: string;
}

export interface InventoryImportResult {
  batchId: string;
  status: "imported";
  datasetKind: InventoryDatasetKind;
  importedCount: number;
  replacedCount: number;
  rejectedCount: number;
  reportingPeriodStart: string | null;
  reportingPeriodEnd: string | null;
  importedAt: string;
}

export interface InventoryBatchSummary {
  batchId: string;
  fileName: string;
  datasetKind: InventoryDatasetKind;
  correctionMode: InventoryCorrectionMode;
  status: InventoryBatchStatus;
  reportingPeriodStart: string | null;
  reportingPeriodEnd: string | null;
  rowCount: number;
  acceptedCount: number;
  warningCount: number;
  rejectedCount: number;
  replacementCount: number;
  createdAt: string;
  importedAt: string | null;
  expiresAt: string;
}

export interface InventoryLatestReport {
  reportDate: string;
  rowCount: number;
}

export type InventoryDatasetSource =
  | "imported-real"
  | "imported-synthetic"
  | "legacy"
  | "synthetic-demo";
export type InventoryDatasetKindLabel =
  | "real"
  | "synthetic"
  | "legacy"
  | "demo";
export type InventoryItemStockStatus =
  | "healthy"
  | "low"
  | "stockout"
  | "unknown";

export interface InventoryDatasetItemSummary {
  hospitalId: number;
  hospitalName: string;
  medicineId: number;
  medicineName: string;
  unit: string;
  reportDate: string | null;
  closingStock: number | null;
  safetyStock: number | null;
  minimumStockLevel: number | null;
  status: InventoryItemStockStatus;
}

export interface InventoryDatasetSummary {
  id: string;
  source: InventoryDatasetSource;
  kind: InventoryDatasetKindLabel;
  snapshotDate: string | null;
  importedAt: string | null;
  loadedAt: string;
  rowCount: number;
  demandRowCount: number;
  hospitalCount: number;
  medicineCount: number;
  knownStockRows: number;
  unknownStockRows: number;
  totalStock: number;
  lowStockRows: number;
  stockoutRows: number;
  warnings: string[];
  items: InventoryDatasetItemSummary[];
}

export interface InventoryLedgerSummary {
  storageReady: boolean;
  latestReal: InventoryLatestReport | null;
  latestSynthetic: InventoryLatestReport | null;
  realRowCount: number;
  syntheticRowCount: number;
  recentBatches: InventoryBatchSummary[];
  active: InventoryDatasetSummary | null;
}

interface ApiPayload {
  success?: boolean;
  message?: string;
  code?: string;
  details?: unknown;
  preview?: InventoryPreview;
  import?: InventoryImportResult;
  summary?: InventoryLedgerSummary;
}

export class InventoryApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "InventoryApiError";
  }
}

async function accessToken(): Promise<string> {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error || !session?.access_token) {
    throw new InventoryApiError(
      "Sign in again to import inventory data.",
      401,
      "AUTH_REQUIRED",
    );
  }

  return session.access_token;
}

async function readError(response: Response): Promise<InventoryApiError> {
  const payload = (await response
    .json()
    .catch(() => null)) as ApiPayload | null;

  return new InventoryApiError(
    payload?.message ?? `The inventory request failed (${response.status}).`,
    response.status,
    payload?.code,
    payload?.details,
  );
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await accessToken();
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      cache: "no-store",
      headers,
    });
  } catch {
    throw new InventoryApiError(
      "The inventory service is unreachable. Check that the backend is running and try again.",
      0,
      "NETWORK_ERROR",
    );
  }

  if (!response.ok) {
    throw await readError(response);
  }

  return (await response.json()) as T;
}

export async function getInventorySummary(): Promise<InventoryLedgerSummary> {
  const payload = await request<{ success: true; summary: InventoryLedgerSummary }>(
    "/api/staff/inventory/summary",
  );

  return payload.summary;
}

export async function previewInventoryImport(
  file: File,
  datasetKind: InventoryDatasetKind,
  correctionMode: InventoryCorrectionMode,
): Promise<InventoryPreview> {
  const form = new FormData();
  form.append("file", file);
  form.append("datasetKind", datasetKind);
  form.append("correctionMode", correctionMode);

  const payload = await request<{ success: true; preview: InventoryPreview }>(
    "/api/staff/inventory/preview",
    {
      method: "POST",
      body: form,
    },
  );

  return payload.preview;
}

export async function confirmInventoryImport(
  batchId: string,
): Promise<InventoryImportResult> {
  const payload = await request<{
    success: true;
    import: InventoryImportResult;
  }>(`/api/staff/inventory/imports/${encodeURIComponent(batchId)}/confirm`, {
    method: "POST",
  });

  return payload.import;
}

export async function downloadInventoryTemplate(
  sample: boolean,
): Promise<Blob> {
  const token = await accessToken();
  const path = sample
    ? "/api/staff/inventory/template/sample"
    : "/api/staff/inventory/template";

  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      cache: "no-store",
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    throw new InventoryApiError(
      "The inventory service is unreachable. Check that the backend is running and try again.",
      0,
      "NETWORK_ERROR",
    );
  }

  if (!response.ok) {
    throw await readError(response);
  }

  return response.blob();
}

export function fileIssuesFromError(error: unknown): InventoryIssue[] {
  if (!(error instanceof InventoryApiError) || !error.details) {
    return [];
  }

  const details = error.details as {
    fileErrors?: unknown;
    fileWarnings?: unknown;
  };

  return [
    ...(Array.isArray(details.fileErrors) ? details.fileErrors : []),
    ...(Array.isArray(details.fileWarnings) ? details.fileWarnings : []),
  ].filter(
    (item): item is InventoryIssue =>
      Boolean(item) &&
      typeof item === "object" &&
      typeof (item as InventoryIssue).message === "string",
  );
}
