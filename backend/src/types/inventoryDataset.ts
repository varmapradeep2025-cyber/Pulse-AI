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

export interface InventoryDatasetHospital {
  id: number;
  name: string;
}

export interface InventoryDatasetMedicine {
  id: number;
  name: string;
  unit: string;
}

export type SafetyStockSource =
  | "safety_stock"
  | "minimum_stock_level"
  | "missing";

export interface InventoryStockSnapshot {
  hospitalId: number;
  medicineId: number;
  reportDate: string | null;
  closingStock: number | null;
  safetyStock: number | null;
  minimumStockLevel: number | null;
  reservedStock: number | null;
  pendingOrderQuantity: number | null;
  expectedDeliveryDate: string | null;
  supplierId: string | null;
  dailyConsumption: number | null;
  stockoutFlag: boolean | null;
  unmetDemandQuantity: number | null;
  dataSource: string | null;
}

export interface InventoryDemandPoint {
  hospitalId: number;
  medicineId: number;
  date: string;
  demand: number;
}

export interface InventoryDataset {
  id: string;
  source: InventoryDatasetSource;
  kind: InventoryDatasetKindLabel;
  snapshotDate: string | null;
  importedAt: string | null;
  loadedAt: string;
  hospitals: InventoryDatasetHospital[];
  medicines: InventoryDatasetMedicine[];
  stockRows: InventoryStockSnapshot[];
  demandRows: InventoryDemandPoint[];
  warnings: string[];
}

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
