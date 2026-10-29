import type {
  InventoryDatasetItemSummary,
  InventoryDatasetKindLabel,
  InventoryDatasetSource,
  InventoryDatasetSummary,
  InventoryItemStockStatus,
} from "../types/inventoryDataset.js";
import type {
  OperationalDataset,
  OperationalProvenance,
} from "./operationalData.js";

function sourceFor(
  provenance: OperationalProvenance,
): InventoryDatasetSource {
  switch (provenance) {
    case "imported-real":
      return "imported-real";
    case "imported-synthetic":
      return "imported-synthetic";
    case "legacy":
      return "legacy";
    default:
      return "synthetic-demo";
  }
}

function kindFor(
  provenance: OperationalProvenance,
): InventoryDatasetKindLabel {
  switch (provenance) {
    case "imported-real":
      return "real";
    case "imported-synthetic":
      return "synthetic";
    case "legacy":
      return "legacy";
    default:
      return "demo";
  }
}

function stockStatus(
  currentStock: number,
  safetyStock: number,
  stockoutFlag: boolean | null | undefined,
): InventoryItemStockStatus {
  if (stockoutFlag === true || currentStock <= 0) {
    return "stockout";
  }

  if (safetyStock > 0 && currentStock < safetyStock) {
    return "low";
  }

  return "healthy";
}

function latestImportedAt(dataset: OperationalDataset): string | null {
  let latest: string | null = null;

  for (const row of dataset.inventory) {
    if (row.imported_at && (!latest || row.imported_at > latest)) {
      latest = row.imported_at;
    }
  }

  return latest;
}

export function summarizeOperationalDataset(
  dataset: OperationalDataset,
): InventoryDatasetSummary {
  const source = sourceFor(dataset.provenance);
  const hospitals = new Map(
    dataset.hospitals.map((hospital) => [hospital.id, hospital.name]),
  );
  const medicines = new Map(
    dataset.medicines.map((medicine) => [medicine.id, medicine]),
  );
  const items: InventoryDatasetItemSummary[] = dataset.inventory.map(
    (row) => {
      const medicine = medicines.get(row.medicine_id);
      const currentStock = Number.isFinite(row.current_stock)
        ? row.current_stock
        : null;
      const safetyStock = Number.isFinite(row.safety_stock)
        ? row.safety_stock
        : null;

      return {
        hospitalId: row.hospital_id,
        hospitalName:
          hospitals.get(row.hospital_id) ?? `Hospital ${row.hospital_id}`,
        medicineId: row.medicine_id,
        medicineName: medicine?.name ?? `Medicine ${row.medicine_id}`,
        unit: medicine?.unit || "units",
        reportDate: row.report_date ?? null,
        closingStock: currentStock,
        safetyStock,
        minimumStockLevel: row.minimum_stock_level ?? null,
        status:
          currentStock === null
            ? "unknown"
            : stockStatus(
                currentStock,
                safetyStock ?? 0,
                row.stockout_flag,
              ),
      };
    },
  );
  const known = items.filter((item) => item.closingStock !== null);
  const warnings: string[] = [];

  if (dataset.skippedRows > 0) {
    warnings.push(
      `${dataset.skippedRows} imported row(s) were skipped because required values were missing or invalid.`,
    );
  }

  if (dataset.inventory.length === 0) {
    warnings.push("No stock rows are available for the current data source.");
  }

  if (dataset.provenance === "legacy") {
    warnings.push(
      "Scenarios are using seeded legacy inventory and demand records until an import is available.",
    );
  }

  if (dataset.provenance === "synthetic") {
    warnings.push(
      "Scenarios are using deterministic synthetic demo data, not live hospital records.",
    );
  }

  const latestReport = dataset.latestReportDate ?? "undated";

  return {
    id: `${source}:${latestReport}`,
    source,
    kind: kindFor(dataset.provenance),
    snapshotDate: dataset.latestReportDate,
    importedAt: latestImportedAt(dataset),
    loadedAt: new Date().toISOString(),
    rowCount: items.length,
    demandRowCount: dataset.demandRows.length,
    hospitalCount: dataset.hospitals.length,
    medicineCount: dataset.medicines.length,
    knownStockRows: known.length,
    unknownStockRows: items.length - known.length,
    totalStock: known.reduce(
      (total, item) => total + (item.closingStock ?? 0),
      0,
    ),
    lowStockRows: items.filter((item) => item.status === "low").length,
    stockoutRows: items.filter((item) => item.status === "stockout").length,
    warnings,
    items,
  };
}
