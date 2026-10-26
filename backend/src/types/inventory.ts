export type InventoryDatasetKind = "synthetic" | "real";
export type InventoryCorrectionMode = "reject" | "replace";
export type InventoryBatchStatus = "previewed" | "imported" | "rejected";
export type InventoryIssueSeverity = "error" | "warning";
export type InventoryRowStatus = "accepted" | "warning" | "rejected";

export const INVENTORY_REQUIRED_COLUMNS = [
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
] as const;

export const INVENTORY_OPTIONAL_COLUMNS = [
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
] as const;

export const INVENTORY_TEMPLATE_COLUMNS = [
  ...INVENTORY_REQUIRED_COLUMNS,
  ...INVENTORY_OPTIONAL_COLUMNS,
] as const;

export interface InventoryIssue {
  code: string;
  severity: InventoryIssueSeverity;
  message: string;
  field?: string;
}

export interface InventoryReportInput {
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
  data: InventoryReportInput | null;
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

export interface InventoryLedgerSummary {
  latestReal: InventoryLatestReport | null;
  latestSynthetic: InventoryLatestReport | null;
  realRowCount: number;
  syntheticRowCount: number;
  recentBatches: InventoryBatchSummary[];
}

export interface InventoryReferenceHospital {
  id: number;
  name: string;
}

export interface InventoryReferenceMedicine {
  id: number;
  name: string;
  unit: string;
}

export interface InventoryReferenceCatalog {
  hospitals: InventoryReferenceHospital[];
  medicines: InventoryReferenceMedicine[];
}

export interface InventoryBatchRecord {
  id: string;
  uploaded_by: string;
  original_filename: string;
  file_sha256: string;
  dataset_kind: InventoryDatasetKind;
  correction_mode: InventoryCorrectionMode;
  status: InventoryBatchStatus;
  reporting_period_start: string | null;
  reporting_period_end: string | null;
  row_count: number;
  accepted_count: number;
  warning_count: number;
  rejected_count: number;
  replacement_count: number;
  hospital_ids: number[];
  file_errors: InventoryIssue[];
  file_warnings: InventoryIssue[];
  validation_results: InventoryRowResult[];
  staged_rows: InventoryReportInput[] | null;
  created_at: string;
  imported_at: string | null;
  expires_at: string;
}

export interface CreateInventoryBatchInput {
  uploadedBy: string;
  originalFilename: string;
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
  validationResults: InventoryRowResult[];
  stagedRows: InventoryReportInput[];
  createdAt: string;
  expiresAt: string;
}

export interface InventoryUser {
  id: string;
  email?: string;
  isStaff: boolean;
  hospitalIds: number[];
  allHospitals: boolean;
}
