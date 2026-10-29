import { buildSyntheticDataset } from "./syntheticData.js";

export type OperationalProvenance =
  | "imported-real"
  | "imported-synthetic"
  | "legacy"
  | "synthetic";

export interface OperationalHospital {
  id: number;
  name: string;
}

export interface OperationalMedicine {
  id: number;
  name: string;
  category: string;
  criticality: string;
  unit: string;
}

export interface OperationalInventoryRow {
  hospital_id: number;
  medicine_id: number;
  current_stock: number;
  safety_stock: number;
  daily_consumption: number;
}

export interface OperationalDemandRow {
  hospital_id: number;
  medicine_id: number;
  date: string;
  demand: number;
}

export interface OperationalScope {
  hospitalIds?: readonly number[];
}

export interface OperationalDataset {
  provenance: OperationalProvenance;
  hospitals: OperationalHospital[];
  medicines: OperationalMedicine[];
  inventory: OperationalInventoryRow[];
  demandRows: OperationalDemandRow[];
  latestReportDate: string | null;
  skippedRows: number;
}

export interface ImportedReportRow {
  report_date: unknown;
  hospital_id: unknown;
  medicine_id: unknown;
  medicine_name?: unknown;
  unit?: unknown;
  quantity_dispensed?: unknown;
  closing_stock?: unknown;
  minimum_stock_level?: unknown;
  safety_stock?: unknown;
  unmet_demand_quantity?: unknown;
  imported_at?: unknown;
  is_synthetic?: unknown;
}

interface ImportedDatasetRows {
  rows: ImportedReportRow[];
  kind: "real" | "synthetic";
}

interface ImportedReport {
  reportDate: string;
  hospitalId: number;
  medicineId: number;
  medicineName: string;
  unit: string;
  demand: number;
  closingStock: number;
  safetyStock: number;
  importedAt: number;
}

interface ReferenceCatalog {
  hospitals: OperationalHospital[];
  medicines: OperationalMedicine[];
}

const PAGE_SIZE = 1000;

function normalizedScope(scope?: OperationalScope): number[] | undefined {
  if (!scope?.hospitalIds) {
    return undefined;
  }

  return [
    ...new Set(
      scope.hospitalIds.filter(
        (id) => Number.isInteger(id) && id > 0,
      ),
    ),
  ];
}

function emptyDataset(
  provenance: OperationalProvenance,
): OperationalDataset {
  return {
    provenance,
    hospitals: [],
    medicines: [],
    inventory: [],
    demandRows: [],
    latestReportDate: null,
    skippedRows: 0,
  };
}

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

function nonNegativeNumber(value: unknown): number | null {
  const parsed = numberOrNull(value);

  return parsed !== null && parsed >= 0 ? parsed : null;
}

function positiveInteger(value: unknown): number | null {
  const parsed = numberOrNull(value);

  return parsed !== null && Number.isInteger(parsed) && parsed > 0
    ? parsed
    : null;
}

function calendarDate(value: unknown): string | null {
  const date =
    value instanceof Date
      ? value.toISOString().slice(0, 10)
      : String(value ?? "").slice(0, 10);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return null;
  }

  const parsed = new Date(`${date}T00:00:00Z`);

  return Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== date
    ? null
    : date;
}

function textOrNull(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const text = value.trim();

  return text.length > 0 ? text : null;
}

function timestampValue(value: unknown): number {
  const text = String(value ?? "");
  const timestamp = Date.parse(text);

  return Number.isFinite(timestamp) ? timestamp : 0;
}

function reportKey(
  reportDate: string,
  hospitalId: number,
  medicineId: number,
): string {
  return `${reportDate}|${hospitalId}|${medicineId}`;
}

function compareNullableDates(a: string | null, b: string | null): number {
  return (a ?? "").localeCompare(b ?? "");
}

function chunk<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = [];

  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }

  return chunks;
}

function isMissingTable(error: { code?: string; message?: string }): boolean {
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    /could not find the table|does not exist|schema cache/i.test(
      error.message ?? "",
    )
  );
}

async function database() {
  const { supabase } = await import("../utils/supabase.js");

  return supabase;
}

/* ------------------------------------------------------------------ */
/* Imported inventory_daily_reports                                   */
/* ------------------------------------------------------------------ */

export function buildImportedDataset(
  rows: ImportedReportRow[],
  provenance: "imported-real" | "imported-synthetic",
  scope?: OperationalScope,
): OperationalDataset {
  const allowed = normalizedScope(scope);
  const allowedSet =
    allowed && allowed.length > 0 ? new Set(allowed) : undefined;

  if (allowed && allowed.length === 0) {
    return emptyDataset(provenance);
  }

  let skippedRows = 0;
  let latestReportDate: string | null = null;
  const reports = new Map<string, ImportedReport>();

  for (const row of rows) {
    const reportDate = calendarDate(row.report_date);
    const hospitalId = positiveInteger(row.hospital_id);
    const medicineId = positiveInteger(row.medicine_id);
    const closingStock = nonNegativeNumber(row.closing_stock);
    const dispensed = nonNegativeNumber(row.quantity_dispensed);
    const unmetDemand =
      row.unmet_demand_quantity === null ||
      row.unmet_demand_quantity === undefined ||
      row.unmet_demand_quantity === ""
        ? 0
        : nonNegativeNumber(row.unmet_demand_quantity);
    const primarySafety = nonNegativeNumber(row.safety_stock);
    const minimumStock = nonNegativeNumber(row.minimum_stock_level);
    const safetyStock = primarySafety ?? minimumStock;

    if (
      reportDate === null ||
      hospitalId === null ||
      medicineId === null ||
      closingStock === null ||
      dispensed === null ||
      unmetDemand === null ||
      safetyStock === null ||
      (allowedSet !== undefined && !allowedSet.has(hospitalId))
    ) {
      skippedRows += 1;
      continue;
    }

    const medicineName =
      textOrNull(row.medicine_name) ?? `Medicine ${medicineId}`;
    const unit = textOrNull(row.unit) ?? "units";
    const key = reportKey(reportDate, hospitalId, medicineId);
    const importedAt = timestampValue(row.imported_at);
    const existing = reports.get(key);

    if (existing && existing.importedAt > importedAt) {
      continue;
    }

    reports.set(key, {
      reportDate,
      hospitalId,
      medicineId,
      medicineName,
      unit,
      demand: dispensed + unmetDemand,
      closingStock,
      safetyStock,
      importedAt,
    });

    if (
      latestReportDate === null ||
      reportDate.localeCompare(latestReportDate) > 0
    ) {
      latestReportDate = reportDate;
    }
  }

  const latestBySeries = new Map<string, ImportedReport>();
  const hospitalNames = new Map<number, string>();
  const medicineInfo = new Map<number, OperationalMedicine>();
  const demandRows: OperationalDemandRow[] = [];

  for (const report of reports.values()) {
    const seriesKey = `${report.hospitalId}-${report.medicineId}`;
    const current = latestBySeries.get(seriesKey);

    if (
      !current ||
      compareNullableDates(report.reportDate, current.reportDate) > 0
    ) {
      latestBySeries.set(seriesKey, report);
    }

    hospitalNames.set(
      report.hospitalId,
      hospitalNames.get(report.hospitalId) ?? `Hospital ${report.hospitalId}`,
    );

    if (!medicineInfo.has(report.medicineId)) {
      medicineInfo.set(report.medicineId, {
        id: report.medicineId,
        name: report.medicineName,
        category: "Imported inventory",
        criticality: "standard",
        unit: report.unit,
      });
    }

    demandRows.push({
      hospital_id: report.hospitalId,
      medicine_id: report.medicineId,
      date: report.reportDate,
      demand: report.demand,
    });
  }

  const inventory = [...latestBySeries.values()]
    .map((report) => ({
      hospital_id: report.hospitalId,
      medicine_id: report.medicineId,
      current_stock: report.closingStock,
      safety_stock: report.safetyStock,
      daily_consumption: report.demand,
    }))
    .sort(
      (a, b) =>
        a.hospital_id - b.hospital_id || a.medicine_id - b.medicine_id,
    );

  demandRows.sort(
    (a, b) =>
      a.hospital_id - b.hospital_id ||
      a.medicine_id - b.medicine_id ||
      a.date.localeCompare(b.date),
  );

  return {
    provenance,
    hospitals: [...hospitalNames.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.id - b.id),
    medicines: [...medicineInfo.values()].sort((a, b) => a.id - b.id),
    inventory,
    demandRows,
    latestReportDate,
    skippedRows,
  };
}

async function loadImportedRows(
  scope?: OperationalScope,
): Promise<ImportedDatasetRows | null> {
  const ids = normalizedScope(scope);

  if (ids && ids.length === 0) {
    return null;
  }

  const supabase = await database();

  for (const kind of ["real", "synthetic"] as const) {
    const rows: ImportedReportRow[] = [];
    let offset = 0;

    for (;;) {
      let query = supabase
        .from("inventory_daily_reports")
        .select(
          "report_date, hospital_id, medicine_id, medicine_name, unit, quantity_dispensed, closing_stock, minimum_stock_level, safety_stock, unmet_demand_quantity, imported_at, is_synthetic",
        )
        .eq("is_synthetic", kind === "synthetic")
        .order("report_date", { ascending: true })
        .order("hospital_id", { ascending: true })
        .order("medicine_id", { ascending: true })
        .order("id", { ascending: true });

      if (ids) {
        query = query.in("hospital_id", ids);
      }

      const { data, error } = await query.range(
        offset,
        offset + PAGE_SIZE - 1,
      );

      if (error) {
        if (isMissingTable(error)) {
          return null;
        }

        throw new Error(
          `Imported inventory lookup failed: ${error.message}`,
        );
      }

      if (!data || data.length === 0) {
        break;
      }

      rows.push(...(data as ImportedReportRow[]));

      if (data.length < PAGE_SIZE) {
        break;
      }

      offset += PAGE_SIZE;
    }

    if (rows.length > 0) {
      return { rows, kind };
    }
  }

  return { rows: [], kind: "real" };
}

async function anyImportedKind(): Promise<"real" | "synthetic" | null> {
  const supabase = await database();

  for (const kind of ["real", "synthetic"] as const) {
    const { count, error } = await supabase
      .from("inventory_daily_reports")
      .select("id", { count: "exact", head: true })
      .eq("is_synthetic", kind === "synthetic");

    if (error) {
      if (isMissingTable(error)) {
        return null;
      }

      throw new Error(
        `Imported inventory lookup failed: ${error.message}`,
      );
    }

    if ((count ?? 0) > 0) {
      return kind;
    }
  }

  return null;
}

async function enrichImportedReferences(
  dataset: OperationalDataset,
): Promise<OperationalDataset> {
  if (dataset.hospitals.length === 0) {
    return dataset;
  }

  const supabase = await database();
  const hospitalIds = dataset.hospitals.map((hospital) => hospital.id);
  const medicineIds = dataset.medicines.map((medicine) => medicine.id);
  const hospitals = new Map(
    dataset.hospitals.map((hospital) => [hospital.id, hospital]),
  );
  const medicines = new Map(
    dataset.medicines.map((medicine) => [medicine.id, medicine]),
  );

  for (const ids of chunk(hospitalIds, 200)) {
    const { data, error } = await supabase
      .from("hospitals")
      .select("id, name")
      .in("id", ids);

    if (error) {
      break;
    }

    for (const row of data ?? []) {
      const id = positiveInteger(row.id);

      if (id !== null) {
        hospitals.set(id, { id, name: String(row.name ?? `Hospital ${id}`) });
      }
    }
  }

  for (const ids of chunk(medicineIds, 200)) {
    const { data, error } = await supabase
      .from("medicines")
      .select("id, name, category, criticality, unit")
      .in("id", ids);

    if (error) {
      break;
    }

    for (const row of data ?? []) {
      const id = positiveInteger(row.id);

      if (id === null) {
        continue;
      }

      const existing = medicines.get(id);

      medicines.set(id, {
        id,
        name: String(row.name ?? existing?.name ?? `Medicine ${id}`),
        category: String(row.category ?? existing?.category ?? ""),
        criticality: String(row.criticality ?? existing?.criticality ?? ""),
        unit: String(row.unit ?? existing?.unit ?? "units"),
      });
    }
  }

  return {
    ...dataset,
    hospitals: [...hospitals.values()].sort((a, b) => a.id - b.id),
    medicines: [...medicines.values()].sort((a, b) => a.id - b.id),
  };
}

/* ------------------------------------------------------------------ */
/* Legacy inventory/demand tables                                      */
/* ------------------------------------------------------------------ */

async function loadLegacyDataset(
  scope?: OperationalScope,
): Promise<OperationalDataset | null> {
  const ids = normalizedScope(scope);

  if (ids && ids.length === 0) {
    return null;
  }

  const supabase = await database();
  const inventoryQuery = supabase
    .from("inventory")
    .select("hospital_id, medicine_id, current_stock, safety_stock, daily_consumption");
  const scopedInventoryQuery = ids
    ? inventoryQuery.in("hospital_id", ids)
    : inventoryQuery;

  const [inventoryResult, hospitalResult, medicineResult] =
    await Promise.all([
      scopedInventoryQuery,
      supabase.from("hospitals").select("id, name"),
      supabase.from("medicines").select("id, name, category, criticality, unit"),
    ]);

  if (inventoryResult.error) {
    if (isMissingTable(inventoryResult.error)) {
      return null;
    }

    throw new Error(
      `Inventory lookup failed: ${inventoryResult.error.message}`,
    );
  }

  if (hospitalResult.error && !isMissingTable(hospitalResult.error)) {
    throw new Error(
      `Hospital lookup failed: ${hospitalResult.error.message}`,
    );
  }

  if (medicineResult.error && !isMissingTable(medicineResult.error)) {
    throw new Error(
      `Medicine lookup failed: ${medicineResult.error.message}`,
    );
  }

  const inventory = new Map<string, OperationalInventoryRow>();

  for (const row of inventoryResult.data ?? []) {
    const hospitalId = positiveInteger(row.hospital_id);
    const medicineId = positiveInteger(row.medicine_id);
    const currentStock = nonNegativeNumber(row.current_stock);
    const safetyStock = nonNegativeNumber(row.safety_stock);

    if (
      hospitalId === null ||
      medicineId === null ||
      currentStock === null ||
      safetyStock === null
    ) {
      continue;
    }

    inventory.set(`${hospitalId}-${medicineId}`, {
      hospital_id: hospitalId,
      medicine_id: medicineId,
      current_stock: currentStock,
      safety_stock: safetyStock,
      daily_consumption: nonNegativeNumber(row.daily_consumption) ?? 0,
    });
  }

  const demandRows: OperationalDemandRow[] = [];
  const allowed =
    ids && ids.length > 0 ? new Set(ids) : undefined;
  let offset = 0;

  for (;;) {
    let query = supabase
      .from("demand_history")
      .select("hospital_id, medicine_id, demand_date, demand")
      .order("hospital_id", { ascending: true })
      .order("medicine_id", { ascending: true })
      .order("demand_date", { ascending: true });

    if (ids) {
      query = query.in("hospital_id", ids);
    }

    const { data, error } = await query.range(
      offset,
      offset + PAGE_SIZE - 1,
    );

    if (error) {
      if (isMissingTable(error)) {
        return null;
      }

      throw new Error(`Demand history lookup failed: ${error.message}`);
    }

    if (!data || data.length === 0) {
      break;
    }

    for (const row of data) {
      const hospitalId = positiveInteger(row.hospital_id);
      const medicineId = positiveInteger(row.medicine_id);
      const date = calendarDate(row.demand_date);
      const demand = nonNegativeNumber(row.demand);

      if (
        hospitalId === null ||
        medicineId === null ||
        date === null ||
        demand === null ||
        (allowed !== undefined && !allowed.has(hospitalId))
      ) {
        continue;
      }

      demandRows.push({
        hospital_id: hospitalId,
        medicine_id: medicineId,
        date,
        demand,
      });
    }

    if (data.length < PAGE_SIZE) {
      break;
    }

    offset += PAGE_SIZE;
  }

  const hospitals = (hospitalResult.data ?? [])
    .map((row) => ({
      id: positiveInteger(row.id),
      name: String(row.name ?? ""),
    }))
    .filter(
      (row): row is { id: number; name: string } =>
        row.id !== null &&
        (allowed === undefined || allowed.has(row.id)),
    );

  const medicines = (medicineResult.data ?? [])
    .map((row) => ({
      id: positiveInteger(row.id),
      name: String(row.name ?? ""),
      category: String(row.category ?? ""),
      criticality: String(row.criticality ?? ""),
      unit: String(row.unit ?? ""),
    }))
    .filter(
      (row): row is OperationalMedicine => row.id !== null,
    );

  return {
    provenance: "legacy",
    hospitals,
    medicines,
    inventory: [...inventory.values()].sort(
      (a, b) =>
        a.hospital_id - b.hospital_id || a.medicine_id - b.medicine_id,
    ),
    demandRows,
    latestReportDate:
      demandRows.length > 0
        ? demandRows.reduce(
            (latest, row) => (row.date > latest ? row.date : latest),
            demandRows[0].date,
          )
        : null,
    skippedRows: 0,
  };
}

/* ------------------------------------------------------------------ */
/* Deterministic synthetic fallback                                   */
/* ------------------------------------------------------------------ */

function loadSyntheticDataset(scope?: OperationalScope): OperationalDataset {
  const allowed = normalizedScope(scope);

  if (allowed && allowed.length === 0) {
    return emptyDataset("synthetic");
  }

  const allowedSet =
    allowed && allowed.length > 0 ? new Set(allowed) : undefined;
  const dataset = buildSyntheticDataset();
  const hospitals = dataset.hospitals.filter(
    (hospital) =>
      allowedSet === undefined || allowedSet.has(hospital.id),
  );
  const inventory = dataset.inventory.filter(
    (item) =>
      allowedSet === undefined || allowedSet.has(item.hospital_id),
  );
  const demandRows = dataset.demandRows.filter(
    (row) =>
      allowedSet === undefined || allowedSet.has(row.hospital_id),
  );
  const usedMedicines = new Set(
    inventory.map((item) => item.medicine_id),
  );
  const medicines = dataset.medicines.filter((medicine) =>
    usedMedicines.has(medicine.id),
  );

  if (
    hospitals.length === 0 ||
    inventory.length === 0 ||
    demandRows.length === 0
  ) {
    return emptyDataset("synthetic");
  }

  return {
    provenance: "synthetic",
    hospitals,
    medicines,
    inventory,
    demandRows,
    latestReportDate:
      demandRows.length > 0
        ? demandRows.reduce(
            (latest, row) => (row.date > latest ? row.date : latest),
            demandRows[0].date,
          )
        : null,
    skippedRows: 0,
  };
}

/* ------------------------------------------------------------------ */
/* Public loader                                                      */
/* ------------------------------------------------------------------ */

export async function loadOperationalDataset(
  scope?: OperationalScope,
): Promise<OperationalDataset> {
  const ids = normalizedScope(scope);

  if (ids && ids.length === 0) {
    return emptyDataset("legacy");
  }

  const imported = await loadImportedRows(scope);

  if (imported && imported.rows.length > 0) {
    const provenance =
      imported.kind === "real" ? "imported-real" : "imported-synthetic";

    return enrichImportedReferences(
      buildImportedDataset(imported.rows, provenance, scope),
    );
  }

  if (imported !== null && ids) {
    const kind = await anyImportedKind();

    if (kind !== null) {
      return emptyDataset(
        kind === "real" ? "imported-real" : "imported-synthetic",
      );
    }
  }

  const legacy = await loadLegacyDataset(scope);

  if (
    legacy &&
    legacy.inventory.length > 0 &&
    legacy.demandRows.length > 0
  ) {
    return legacy;
  }

  return loadSyntheticDataset(scope);
}

export function analyticsScope(
  allHospitals: boolean,
  hospitalIds: readonly number[],
): OperationalScope | undefined {
  if (allHospitals) {
    return undefined;
  }

  return {
    hospitalIds: normalizedScope({ hospitalIds: [...hospitalIds] }) ?? [],
  };
}

export function referenceCatalog(
  dataset: OperationalDataset,
): ReferenceCatalog {
  return {
    hospitals: dataset.hospitals,
    medicines: dataset.medicines,
  };
}
