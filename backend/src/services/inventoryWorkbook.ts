import ExcelJS from "exceljs";
import {
  INVENTORY_REQUIRED_COLUMNS,
  INVENTORY_TEMPLATE_COLUMNS,
} from "../types/inventory.js";
import type {
  InventoryCorrectionMode,
  InventoryDatasetKind,
  InventoryIssue,
  InventoryReferenceCatalog,
  InventoryReportInput,
  InventoryRowResult,
} from "../types/inventory.js";

const MAX_DATA_ROWS = 2000;
const XLSX_SIGNATURE = [0x50, 0x4b, 0x03, 0x04];

export interface RawInventoryRow {
  rowNumber: number;
  values: Record<string, unknown>;
}

export interface ParsedInventoryWorkbook {
  sheetName?: string;
  headers: string[];
  rows: RawInventoryRow[];
  fileErrors: InventoryIssue[];
  fileWarnings: InventoryIssue[];
}

export interface ParseInventoryWorkbookOptions {
  sheetName?: string;
}

function worksheetHeaders(worksheet: ExcelJS.Worksheet): string[] {
  const columnCount = Math.max(
    worksheet.columnCount,
    worksheet.getRow(1).cellCount,
  );
  const headerRow = worksheet.getRow(1);
  const headers: string[] = [];

  for (let column = 1; column <= columnCount; column++) {
    headers.push(normalizeHeader(cellValue(headerRow.getCell(column).value)));
  }

  return headers;
}

export interface InventoryValidationOptions {
  datasetKind: InventoryDatasetKind;
  correctionMode: InventoryCorrectionMode;
  existingKeys: ReadonlySet<string>;
  reference: InventoryReferenceCatalog;
  allHospitals: boolean;
  allowedHospitalIds: ReadonlySet<number>;
  today?: string;
}

function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function normalizeText(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeComparable(value: unknown): string {
  return normalizeText(value).toLowerCase().replace(/\s+/g, " ");
}

function cellValue(value: ExcelJS.CellValue): unknown {
  if (value === null || value === undefined) {
    return null;
  }

  if (value instanceof Date) {
    return value;
  }

  if (typeof value === "object") {
    if ("result" in value) {
      return cellValue(value.result as ExcelJS.CellValue);
    }

    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text).join("");
    }

    if ("text" in value && typeof value.text === "string") {
      return value.text;
    }
  }

  return value;
}

function isEmptyValue(value: unknown): boolean {
  return (
    value === null ||
    value === undefined ||
    (typeof value === "string" && value.trim() === "")
  );
}

function todayInIndia(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function validDateParts(year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function dateStringFromParts(
  year: number,
  month: number,
  day: number,
): string | null {
  if (!validDateParts(year, month, day)) {
    return null;
  }

  return `${String(year).padStart(4, "0")}-${String(month).padStart(
    2,
    "0",
  )}-${String(day).padStart(2, "0")}`;
}

function parseDateValue(value: unknown): string | null {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      return null;
    }

    return dateStringFromParts(
      value.getUTCFullYear(),
      value.getUTCMonth() + 1,
      value.getUTCDate(),
    );
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    if (value < 20000 || value > 80000) {
      return null;
    }

    const milliseconds = Math.round((value - 25569) * 86400000);
    const date = new Date(milliseconds);

    return dateStringFromParts(
      date.getUTCFullYear(),
      date.getUTCMonth() + 1,
      date.getUTCDate(),
    );
  }

  const text = normalizeText(value);

  if (!text) {
    return null;
  }

  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/);

  if (iso) {
    return dateStringFromParts(
      Number(iso[1]),
      Number(iso[2]),
      Number(iso[3]),
    );
  }

  const indian = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);

  if (indian) {
    return dateStringFromParts(
      Number(indian[3]),
      Number(indian[2]),
      Number(indian[1]),
    );
  }

  const slashIso = text.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);

  if (slashIso) {
    return dateStringFromParts(
      Number(slashIso[1]),
      Number(slashIso[2]),
      Number(slashIso[3]),
    );
  }

  return null;
}

function issue(
  code: string,
  severity: "error" | "warning",
  message: string,
  field?: string,
): InventoryIssue {
  return { code, severity, message, field };
}

function parseRequiredNumber(
  value: unknown,
  field: string,
  issues: InventoryIssue[],
  options: { signed?: boolean; integer?: boolean } = {},
): number | null {
  if (isEmptyValue(value)) {
    issues.push(issue("REQUIRED_VALUE", "error", `${field} is required.`, field));
    return null;
  }

  if (typeof value === "boolean") {
    issues.push(
      issue("INVALID_NUMBER", "error", `${field} must be a number.`, field),
    );
    return null;
  }

  const normalized =
    typeof value === "string" ? value.replace(/,/g, "").trim() : value;
  const parsed = Number(normalized);

  if (!Number.isFinite(parsed)) {
    issues.push(
      issue("INVALID_NUMBER", "error", `${field} must be a number.`, field),
    );
    return null;
  }

  if (!options.signed && parsed < 0) {
    issues.push(
      issue(
        "NEGATIVE_NOT_ALLOWED",
        "error",
        `${field} cannot be negative.`,
        field,
      ),
    );
    return null;
  }

  if (options.integer && !Number.isInteger(parsed)) {
    issues.push(
      issue("INVALID_INTEGER", "error", `${field} must be a whole number.`, field),
    );
    return null;
  }

  return parsed;
}

function parseOptionalNumber(
  value: unknown,
  field: string,
  issues: InventoryIssue[],
  options: { integer?: boolean } = {},
): number | null {
  if (isEmptyValue(value)) {
    return null;
  }

  return parseRequiredNumber(value, field, issues, options);
}

function parseOptionalDate(
  value: unknown,
  field: string,
  issues: InventoryIssue[],
): string | null {
  if (isEmptyValue(value)) {
    return null;
  }

  const parsed = parseDateValue(value);

  if (!parsed) {
    issues.push(
      issue(
        "INVALID_DATE",
        "error",
        `${field} must be a valid date (YYYY-MM-DD or DD/MM/YYYY).`,
        field,
      ),
    );
  }

  return parsed;
}

function parseOptionalBoolean(
  value: unknown,
  field: string,
  issues: InventoryIssue[],
): boolean | null {
  if (isEmptyValue(value)) {
    return null;
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number" && (value === 0 || value === 1)) {
    return value === 1;
  }

  const normalized = normalizeComparable(value);

  if (["true", "yes", "y", "1"].includes(normalized)) {
    return true;
  }

  if (["false", "no", "n", "0"].includes(normalized)) {
    return false;
  }

  issues.push(
    issue(
      "INVALID_BOOLEAN",
      "error",
      `${field} must be true/false, yes/no, or 1/0.`,
      field,
    ),
  );

  return null;
}

function parseOptionalText(
  value: unknown,
  field: string,
  issues: InventoryIssue[],
  maxLength: number,
): string | null {
  if (isEmptyValue(value)) {
    return null;
  }

  const text = normalizeText(value);

  if (text.length > maxLength) {
    issues.push(
      issue(
        "TEXT_TOO_LONG",
        "error",
        `${field} must be ${maxLength} characters or fewer.`,
        field,
      ),
    );
    return null;
  }

  return text;
}

function rowKey(
  reportDate: string | null,
  hospitalId: number | null,
  medicineId: number | null,
): string | null {
  if (
    !reportDate ||
    hospitalId === null ||
    medicineId === null
  ) {
    return null;
  }

  return `${reportDate}|${hospitalId}|${medicineId}`;
}

export async function parseInventoryWorkbook(
  buffer: Buffer,
  options: ParseInventoryWorkbookOptions = {},
): Promise<ParsedInventoryWorkbook> {
  const fileErrors: InventoryIssue[] = [];
  const fileWarnings: InventoryIssue[] = [];

  if (buffer.length === 0) {
    return {
      headers: [],
      rows: [],
      fileErrors: [
        issue("EMPTY_FILE", "error", "The uploaded workbook is empty."),
      ],
      fileWarnings,
    };
  }

  if (
    buffer.length < 4 ||
    !XLSX_SIGNATURE.every((byte, index) => buffer[index] === byte)
  ) {
    return {
      headers: [],
      rows: [],
      fileErrors: [
        issue(
          "UNSUPPORTED_FILE_FORMAT",
          "error",
          "Only .xlsx workbooks are supported. Re-save legacy .xls or CSV files as .xlsx.",
        ),
      ],
      fileWarnings,
    };
  }

  const workbook = new ExcelJS.Workbook();

  try {
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    return {
      headers: [],
      rows: [],
      fileErrors: [
        issue(
          "MALFORMED_WORKBOOK",
          "error",
          "The workbook could not be read. Check that it is a valid .xlsx file.",
        ),
      ],
      fileWarnings,
    };
  }

  if (workbook.worksheets.length === 0) {
    return {
      headers: [],
      rows: [],
      fileErrors: [
        issue("NO_WORKSHEET", "error", "The workbook has no worksheet."),
      ],
      fileWarnings,
    };
  }

  const requestedSheet = options.sheetName?.trim();
  let worksheet: ExcelJS.Worksheet | undefined;

  if (requestedSheet) {
    worksheet = workbook.worksheets.find(
      (candidate) =>
        candidate.name.toLowerCase() === requestedSheet.toLowerCase(),
    );

    if (!worksheet) {
      return {
        headers: [],
        rows: [],
        fileErrors: [
          issue(
            "SHEET_NOT_FOUND",
            "error",
            `Worksheet "${requestedSheet}" was not found. Available sheets: ${workbook.worksheets
              .map((candidate) => candidate.name)
              .join(", ")}.`,
          ),
        ],
        fileWarnings,
      };
    }
  } else {
    worksheet = workbook.worksheets.find((candidate) => {
      const candidateHeaders = worksheetHeaders(candidate);
      const candidateColumns = new Set(candidateHeaders);

      return INVENTORY_REQUIRED_COLUMNS.every((column) =>
        candidateColumns.has(column),
      );
    });

    if (!worksheet) {
      worksheet = workbook.worksheets[0];
    } else if (worksheet !== workbook.worksheets[0]) {
      fileWarnings.push(
        issue(
          "SHEET_SELECTED_AUTOMATICALLY",
          "warning",
          `Using worksheet "${worksheet.name}" because it contains the required inventory columns.`,
        ),
      );
    }
  }

  if (!worksheet) {
    return {
      headers: [],
      rows: [],
      fileErrors: [
        issue("NO_WORKSHEET", "error", "The workbook has no worksheet."),
      ],
      fileWarnings,
    };
  }

  const headers = worksheetHeaders(worksheet);
  const headerKeys = [...headers];

  if (headerKeys.every((header) => header === "")) {
    return {
      sheetName: worksheet.name,
      headers: [],
      rows: [],
      fileErrors: [
        issue("MISSING_HEADER_ROW", "error", "The header row is empty."),
      ],
      fileWarnings,
    };
  }

  const seenHeaders = new Set<string>();
  const duplicates = new Set<string>();

  for (const header of headerKeys.filter(Boolean)) {
    if (seenHeaders.has(header)) {
      duplicates.add(header);
    }

    seenHeaders.add(header);
  }

  if (duplicates.size > 0) {
    fileErrors.push(
      issue(
        "DUPLICATE_COLUMNS",
        "error",
        `Duplicate columns: ${[...duplicates].join(", ")}.`,
      ),
    );
  }

  const missing = INVENTORY_REQUIRED_COLUMNS.filter(
    (column) => !seenHeaders.has(column),
  );

  if (missing.length > 0) {
    fileErrors.push(
      issue(
        "MISSING_COLUMNS",
        "error",
        `Missing required columns: ${missing.join(", ")}.`,
      ),
    );
  }

  const knownColumns = new Set<string>(INVENTORY_TEMPLATE_COLUMNS);
  const unknown = [...seenHeaders].filter(
    (header) => header !== "" && !knownColumns.has(header),
  );

  if (unknown.length > 0) {
    fileWarnings.push(
      issue(
        "UNKNOWN_COLUMNS",
        "warning",
        `Ignored unrecognized columns: ${unknown.join(", ")}.`,
      ),
    );
  }

  if (fileErrors.length > 0) {
    return { sheetName: worksheet.name, headers, rows: [], fileErrors, fileWarnings };
  }

  const rows: RawInventoryRow[] = [];
  const maxRow = Math.min(
    worksheet.actualRowCount,
    worksheet.rowCount,
  );

  for (let rowNumber = 2; rowNumber <= maxRow; rowNumber++) {
    const worksheetRow = worksheet.getRow(rowNumber);
    const values: Record<string, unknown> = {};
    let hasValue = false;

    for (let column = 1; column <= headerKeys.length; column++) {
      const header = headerKeys[column - 1];

      if (!header) {
        continue;
      }

      const value = cellValue(worksheetRow.getCell(column).value);

      if (!isEmptyValue(value)) {
        hasValue = true;
      }

      values[header] = value;
    }

    if (!hasValue) {
      continue;
    }

    rows.push({ rowNumber, values });

    if (rows.length > MAX_DATA_ROWS) {
      fileErrors.push(
        issue(
          "TOO_MANY_ROWS",
          "error",
          `A single file may contain at most ${MAX_DATA_ROWS} inventory rows.`,
        ),
      );
      break;
    }
  }

  if (rows.length === 0) {
    fileErrors.push(
      issue("NO_DATA_ROWS", "error", "The workbook contains no data rows."),
    );
  }

  return { sheetName: worksheet.name, headers, rows, fileErrors, fileWarnings };
}

export function validateInventoryRows(
  rows: RawInventoryRow[],
  options: InventoryValidationOptions,
): InventoryRowResult[] {
  const hospitals = new Map(
    options.reference.hospitals.map((hospital) => [hospital.id, hospital]),
  );
  const medicines = new Map(
    options.reference.medicines.map((medicine) => [medicine.id, medicine]),
  );
  const today = options.today ?? todayInIndia();
  const results: InventoryRowResult[] = [];

  for (const row of rows) {
    const issues: InventoryIssue[] = [];
    const values = row.values;
    const reportDate = parseDateValue(values.report_date);
    const hospitalId = parseRequiredNumber(
      values.hospital_id,
      "hospital_id",
      issues,
      { integer: true },
    );
    const medicineId = parseRequiredNumber(
      values.medicine_id,
      "medicine_id",
      issues,
      { integer: true },
    );
    const medicineName = normalizeText(values.medicine_name);
    const unit = normalizeText(values.unit);

    if (!reportDate) {
      issues.push(
        issue(
          "INVALID_DATE",
          "error",
          "report_date must be a valid date (YYYY-MM-DD or DD/MM/YYYY).",
          "report_date",
        ),
      );
    } else if (reportDate > today) {
      issues.push(
        issue(
          "FUTURE_REPORT_DATE",
          "error",
          "report_date cannot be in the future.",
          "report_date",
        ),
      );
    }

    if (!medicineName) {
      issues.push(
        issue("REQUIRED_VALUE", "error", "medicine_name is required.", "medicine_name"),
      );
    }

    if (!unit) {
      issues.push(issue("REQUIRED_VALUE", "error", "unit is required.", "unit"));
    }

    const openingStock = parseRequiredNumber(
      values.opening_stock,
      "opening_stock",
      issues,
    );
    const quantityReceived = parseRequiredNumber(
      values.quantity_received,
      "quantity_received",
      issues,
    );
    const quantityDispensed = parseRequiredNumber(
      values.quantity_dispensed,
      "quantity_dispensed",
      issues,
    );
    const quantityExpired = parseRequiredNumber(
      values.quantity_expired_or_written_off,
      "quantity_expired_or_written_off",
      issues,
    );
    const adjustments = parseRequiredNumber(
      values.adjustments,
      "adjustments",
      issues,
      { signed: true },
    );
    const closingStock = parseRequiredNumber(
      values.closing_stock,
      "closing_stock",
      issues,
    );
    const minimumStockLevel = parseRequiredNumber(
      values.minimum_stock_level,
      "minimum_stock_level",
      issues,
    );

    const hospital =
      hospitalId === null ? undefined : hospitals.get(hospitalId);
    const medicine =
      medicineId === null ? undefined : medicines.get(medicineId);

    if (hospitalId !== null && !hospital) {
      issues.push(
        issue(
          "UNKNOWN_HOSPITAL",
          "error",
          `hospital_id ${hospitalId} is not in the hospital catalog.`,
          "hospital_id",
        ),
      );
    } else if (
      hospitalId !== null &&
      hospital &&
      !options.allHospitals &&
      !options.allowedHospitalIds.has(hospitalId)
    ) {
      issues.push(
        issue(
          "HOSPITAL_NOT_ALLOWED",
          "error",
          `hospital_id ${hospitalId} is not assigned to this inventory staff account.`,
          "hospital_id",
        ),
      );
    }

    if (medicineId !== null && !medicine) {
      issues.push(
        issue(
          "UNKNOWN_MEDICINE",
          "error",
          `medicine_id ${medicineId} is not in the medicine catalog.`,
          "medicine_id",
        ),
      );
    }

    if (medicine && medicineName && normalizeComparable(medicineName) !== normalizeComparable(medicine.name)) {
      issues.push(
        issue(
          "MEDICINE_NAME_MISMATCH",
          "warning",
          `medicine_name does not match the catalog name "${medicine.name}". The supplied value will be kept.`,
          "medicine_name",
        ),
      );
    }

    if (
      medicine &&
      unit &&
      normalizeComparable(unit) !== normalizeComparable(medicine.unit)
    ) {
      issues.push(
        issue(
          "UNIT_MISMATCH",
          "error",
          `unit "${unit}" does not match the catalog unit "${medicine.unit}" for this medicine.`,
          "unit",
        ),
      );
    }

    if (
      openingStock !== null &&
      quantityReceived !== null &&
      quantityDispensed !== null &&
      quantityExpired !== null &&
      adjustments !== null &&
      closingStock !== null
    ) {
      const expectedClosing =
        openingStock +
        quantityReceived -
        quantityDispensed -
        quantityExpired +
        adjustments;

      if (Math.abs(expectedClosing - closingStock) > 0.000001) {
        issues.push(
          issue(
            "CLOSING_STOCK_MISMATCH",
            "error",
            `closing_stock is ${closingStock}, but the inventory equation gives ${expectedClosing}.`,
            "closing_stock",
          ),
        );
      }
    }

    const safetyStock = parseOptionalNumber(
      values.safety_stock,
      "safety_stock",
      issues,
    );
    const reservedStock = parseOptionalNumber(
      values.reserved_stock,
      "reserved_stock",
      issues,
    );
    const pendingOrderQuantity = parseOptionalNumber(
      values.pending_order_quantity,
      "pending_order_quantity",
      issues,
    );
    const supplierId = parseOptionalText(
      values.supplier_id,
      "supplier_id",
      issues,
      80,
    );
    const orderDate = parseOptionalDate(
      values.order_date,
      "order_date",
      issues,
    );
    const expectedDeliveryDate = parseOptionalDate(
      values.expected_delivery_date,
      "expected_delivery_date",
      issues,
    );
    const actualDeliveryDate = parseOptionalDate(
      values.actual_delivery_date,
      "actual_delivery_date",
      issues,
    );
    const typicalLeadTime = parseOptionalNumber(
      values.typical_lead_time_days,
      "typical_lead_time_days",
      issues,
      { integer: true },
    );
    const stockoutFlag = parseOptionalBoolean(
      values.stockout_flag,
      "stockout_flag",
      issues,
    );
    const unmetDemand = parseOptionalNumber(
      values.unmet_demand_quantity,
      "unmet_demand_quantity",
      issues,
    );
    const dataSource = parseOptionalText(
      values.data_source,
      "data_source",
      issues,
      120,
    );

    if (orderDate && expectedDeliveryDate && expectedDeliveryDate < orderDate) {
      issues.push(
        issue(
          "DELIVERY_BEFORE_ORDER",
          "warning",
          "expected_delivery_date is earlier than order_date.",
          "expected_delivery_date",
        ),
      );
    }

    if (orderDate && actualDeliveryDate && actualDeliveryDate < orderDate) {
      issues.push(
        issue(
          "DELIVERY_BEFORE_ORDER",
          "warning",
          "actual_delivery_date is earlier than order_date.",
          "actual_delivery_date",
        ),
      );
    }

    if (
      options.datasetKind === "real" &&
      dataSource &&
      /synthetic|demo|sample/i.test(dataSource)
    ) {
      issues.push(
        issue(
          "SYNTHETIC_SOURCE_FOR_REAL_DATA",
          "error",
          "data_source looks synthetic, but this batch is marked as real hospital data.",
          "data_source",
        ),
      );
    }

    const key = rowKey(reportDate, hospitalId, medicineId);

    if (key && options.existingKeys.has(key)) {
      if (options.correctionMode === "reject") {
        issues.push(
          issue(
            "EXISTING_REPORT",
            "error",
            "A report already exists for this hospital, medicine, and date. Choose Replace existing to correct it.",
          ),
        );
      } else {
        issues.push(
          issue(
            "REPLACES_EXISTING",
            "warning",
            "This report will replace the existing hospital, medicine, and date record.",
          ),
        );
      }
    }

    const data: InventoryReportInput | null =
      reportDate &&
      hospitalId !== null &&
      medicineId !== null &&
      medicineName &&
      unit &&
      openingStock !== null &&
      quantityReceived !== null &&
      quantityDispensed !== null &&
      quantityExpired !== null &&
      adjustments !== null &&
      closingStock !== null &&
      minimumStockLevel !== null
        ? {
            report_date: reportDate,
            hospital_id: hospitalId,
            medicine_id: medicineId,
            medicine_name: medicineName,
            unit,
            opening_stock: openingStock,
            quantity_received: quantityReceived,
            quantity_dispensed: quantityDispensed,
            quantity_expired_or_written_off: quantityExpired,
            adjustments,
            closing_stock: closingStock,
            minimum_stock_level: minimumStockLevel,
            safety_stock: safetyStock,
            reserved_stock: reservedStock,
            pending_order_quantity: pendingOrderQuantity,
            supplier_id: supplierId,
            order_date: orderDate,
            expected_delivery_date: expectedDeliveryDate,
            actual_delivery_date: actualDeliveryDate,
            typical_lead_time_days: typicalLeadTime,
            stockout_flag: stockoutFlag,
            unmet_demand_quantity: unmetDemand,
            data_source: dataSource,
          }
        : null;

    results.push({
      row_number: row.rowNumber,
      key,
      status: "accepted",
      issues,
      data,
    });
  }

  const rowsByKey = new Map<string, InventoryRowResult[]>();

  for (const result of results) {
    if (!result.key) {
      continue;
    }

    const group = rowsByKey.get(result.key) ?? [];
    group.push(result);
    rowsByKey.set(result.key, group);
  }

  for (const [key, group] of rowsByKey) {
    if (group.length < 2) {
      continue;
    }

    for (const result of group) {
      result.issues.push(
        issue(
          "DUPLICATE_IN_FILE",
          "error",
          `The file contains more than one row for ${key}. Remove or merge duplicates before importing.`,
        ),
      );
    }
  }

  for (const result of results) {
    result.status = result.issues.some((item) => item.severity === "error")
      ? "rejected"
      : result.issues.length > 0
        ? "warning"
        : "accepted";
  }

  return results;
}

export function reportingPeriod(
  rows: InventoryRowResult[],
): { start: string | null; end: string | null } {
  const dates = rows
    .map((row) => row.data?.report_date)
    .filter((date): date is string => Boolean(date))
    .sort();

  return {
    start: dates[0] ?? null,
    end: dates[dates.length - 1] ?? null,
  };
}
