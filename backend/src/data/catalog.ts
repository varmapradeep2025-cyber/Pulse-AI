/*
 * Pulse AI — supply-chain catalog (prototype / demonstration data)
 * =================================================================
 * Realistic medicine, hospital and supplier reference data used by the
 * Scenario Simulation module.
 *
 * All records are demonstration data for a hackathon prototype. They are
 * based on publicly available, generic descriptions of medicines and
 * facility types. They do NOT claim that any real organisation is
 * connected to Pulse AI, and they contain NO patient information and NO
 * clinical indications or dosage guidance.
 */

export const DEMO_DISCLAIMER =
  "Prototype / Demonstration Data — Not for Clinical Decision-Making";

export interface CatalogMedicine {
  medicine_id: number;
  generic_name: string;
  category: string;
  unit: string;
  lead_time_days: number;
  supplier_ids: string[];
  criticality: "critical" | "standard";
}

export interface CatalogHospital {
  hospital_id: number;
  hospital_name: string;
  city: string;
  state: string;
  facility_type: string;
  departments: string[];
  bed_capacity: number;
  emergency_available: boolean;
  inventory_location: string;
  supplier_ids: string[];
  demonstration: true;
}

export interface CatalogSupplier {
  supplier_id: string;
  supplier_name: string;
  location: string;
  supplied_medicines: string[];
  normal_lead_time: number;
  emergency_lead_time: number;
  reliability_score: number;
  current_status: "active" | "disrupted";
}

/* Generic medicine names only — no indications, no dosage. */
export const CATALOG_MEDICINES: CatalogMedicine[] = [
  { medicine_id: 1, generic_name: "Insulin", category: "Diabetes care", unit: "vials", lead_time_days: 3, supplier_ids: ["S01", "S05"], criticality: "critical" },
  { medicine_id: 2, generic_name: "Paracetamol", category: "Analgesic / antipyretic", unit: "tablets", lead_time_days: 4, supplier_ids: ["S01", "S05"], criticality: "standard" },
  { medicine_id: 3, generic_name: "Amoxicillin", category: "Antibiotic", unit: "tablets", lead_time_days: 5, supplier_ids: ["S01"], criticality: "standard" },
  { medicine_id: 4, generic_name: "Ceftriaxone", category: "Antibiotic (injectable)", unit: "vials", lead_time_days: 5, supplier_ids: ["S02", "S04"], criticality: "critical" },
  { medicine_id: 5, generic_name: "Normal Saline 0.9%", category: "IV fluids", unit: "bags", lead_time_days: 4, supplier_ids: ["S03", "S04"], criticality: "critical" },
  { medicine_id: 6, generic_name: "Ringer Lactate", category: "IV fluids", unit: "bags", lead_time_days: 4, supplier_ids: ["S03", "S04"], criticality: "standard" },
  { medicine_id: 7, generic_name: "Azithromycin", category: "Antibiotic", unit: "tablets", lead_time_days: 6, supplier_ids: ["S02"], criticality: "standard" },
  { medicine_id: 8, generic_name: "Metformin", category: "Diabetes care", unit: "tablets", lead_time_days: 4, supplier_ids: ["S01", "S05"], criticality: "standard" },
  { medicine_id: 9, generic_name: "ORS (Oral Rehydration Salts)", category: "Rehydration", unit: "sachets", lead_time_days: 3, supplier_ids: ["S02", "S05"], criticality: "standard" },
  { medicine_id: 10, generic_name: "Medical Oxygen", category: "Medical gas", unit: "cylinders", lead_time_days: 7, supplier_ids: ["S03"], criticality: "critical" },
];

/*
 * Demonstration facility data — realistic facility types and public-level
 * details (city, state). These are NOT claims that the named facility is
 * connected to Pulse AI.
 */
export const CATALOG_HOSPITALS: CatalogHospital[] = [
  {
    hospital_id: 1,
    hospital_name: "City General Hospital",
    city: "Gwalior",
    state: "Madhya Pradesh",
    facility_type: "District General Hospital",
    departments: ["General Medicine", "Emergency", "Cardiology", "Maternal & Child Health", "Surgery"],
    bed_capacity: 320,
    emergency_available: true,
    inventory_location: "Central medical store",
    supplier_ids: ["S01", "S02", "S03"],
    demonstration: true,
  },
  {
    hospital_id: 2,
    hospital_name: "District Medical Center",
    city: "Indore",
    state: "Madhya Pradesh",
    facility_type: "District Hospital",
    departments: ["General Medicine", "Emergency", "Surgery", "Diagnostics", "Paediatrics"],
    bed_capacity: 250,
    emergency_available: true,
    inventory_location: "Pharmacy store",
    supplier_ids: ["S01", "S02", "S04"],
    demonstration: true,
  },
  {
    hospital_id: 3,
    hospital_name: "Central Public Hospital",
    city: "Bhopal",
    state: "Madhya Pradesh",
    facility_type: "Public Tertiary Hospital",
    departments: ["General Medicine", "Emergency", "Critical Care", "Cardiology", "Surgery", "Obstetrics"],
    bed_capacity: 500,
    emergency_available: true,
    inventory_location: "Central medical store",
    supplier_ids: ["S01", "S03", "S05"],
    demonstration: true,
  },
  {
    hospital_id: 4,
    hospital_name: "Community Health Hospital",
    city: "Jabalpur",
    state: "Madhya Pradesh",
    facility_type: "Community Health Centre",
    departments: ["General Medicine", "Maternal & Child Health", "Emergency", "OPD"],
    bed_capacity: 120,
    emergency_available: false,
    inventory_location: "Pharmacy store",
    supplier_ids: ["S02", "S05"],
    demonstration: true,
  },
  {
    hospital_id: 5,
    hospital_name: "Emergency Care Hospital",
    city: "Ujjain",
    state: "Madhya Pradesh",
    facility_type: "Emergency & Trauma Centre",
    departments: ["Emergency", "Trauma", "Critical Care", "General Surgery"],
    bed_capacity: 180,
    emergency_available: true,
    inventory_location: "Emergency store",
    supplier_ids: ["S03", "S04"],
    demonstration: true,
  },
];

/* Fictional supplier names (kept generic so no real company is implied). */
export const CATALOG_SUPPLIERS: CatalogSupplier[] = [
  {
    supplier_id: "S01",
    supplier_name: "Arogya LifeSciences Distributors LLP",
    location: "Gwalior, Madhya Pradesh",
    supplied_medicines: ["Insulin", "Paracetamol", "Amoxicillin", "Metformin"],
    normal_lead_time: 3,
    emergency_lead_time: 1,
    reliability_score: 0.96,
    current_status: "active",
  },
  {
    supplier_id: "S02",
    supplier_name: "MedLink Pharma Distribution",
    location: "Indore, Madhya Pradesh",
    supplied_medicines: ["Ceftriaxone", "Azithromycin", "ORS (Oral Rehydration Salts)"],
    normal_lead_time: 5,
    emergency_lead_time: 2,
    reliability_score: 0.91,
    current_status: "active",
  },
  {
    supplier_id: "S03",
    supplier_name: "BharatMed Supplies Co.",
    location: "Bhopal, Madhya Pradesh",
    supplied_medicines: ["Normal Saline 0.9%", "Ringer Lactate", "Medical Oxygen"],
    normal_lead_time: 4,
    emergency_lead_time: 2,
    reliability_score: 0.94,
    current_status: "active",
  },
  {
    supplier_id: "S04",
    supplier_name: "Globalcare Infusions Pvt Ltd",
    location: "Jabalpur, Madhya Pradesh",
    supplied_medicines: ["Ceftriaxone", "Normal Saline 0.9%", "Ringer Lactate"],
    normal_lead_time: 5,
    emergency_lead_time: 2,
    reliability_score: 0.88,
    current_status: "active",
  },
  {
    supplier_id: "S05",
    supplier_name: "Swasthya Surgical & Pharma Traders",
    location: "Ujjain, Madhya Pradesh",
    supplied_medicines: ["Insulin", "Paracetamol", "Metformin", "ORS (Oral Rehydration Salts)"],
    normal_lead_time: 4,
    emergency_lead_time: 1,
    reliability_score: 0.92,
    current_status: "active",
  },
];

/* Supplier that becomes unavailable in the supplier-failure / combined scenario. */
export const DISRUPTED_SUPPLIER_ID = "S02";

export function medicineById(id: number): CatalogMedicine | undefined {
  return CATALOG_MEDICINES.find((medicine) => medicine.medicine_id === id);
}

export function medicineByName(name: string): CatalogMedicine | undefined {
  return CATALOG_MEDICINES.find((medicine) => medicine.generic_name === name);
}

export function hospitalById(id: number): CatalogHospital | undefined {
  return CATALOG_HOSPITALS.find((hospital) => hospital.hospital_id === id);
}

export function supplierById(id: string): CatalogSupplier | undefined {
  return CATALOG_SUPPLIERS.find((supplier) => supplier.supplier_id === id);
}