/*
 * Pulse AI — deterministic synthetic hospital dataset
 * ====================================================
 * Used by the backend intelligence pipeline when Supabase is not available
 * (or not seeded), so the demo runs "without manually manipulating data".
 * All records are FICTIONAL and clearly labelled in the UI.
 */

export interface SyntheticHospital {
  id: number;
  name: string;
}

export interface SyntheticMedicine {
  id: number;
  name: string;
  category: string;
  criticality: string;
  unit: string;
}

export interface SyntheticInventory {
  hospital_id: number;
  medicine_id: number;
  current_stock: number;
  safety_stock: number;
  daily_consumption: number;
}

export interface SyntheticDemandRow {
  hospital_id: number;
  medicine_id: number;
  date: string;
  demand: number;
}

export interface SyntheticDataset {
  hospitals: SyntheticHospital[];
  medicines: SyntheticMedicine[];
  inventory: SyntheticInventory[];
  demandRows: SyntheticDemandRow[];
}

/* mulberry32 — tiny deterministic PRNG so results are reproducible. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;

    let t = state;

    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const HOSPITAL_NAMES = [
  "City General Hospital",
  "District Civil Hospital",
  "Rural Community Health Centre",
  "Urban Primary Health Centre",
  "Mother & Child Care Hospital",
];

const MEDICINE_DEFS: Array<[string, string, string]> = [
  ["Insulin", "Diabetes", "vials"],
  ["Paracetamol", "Pain & Fever", "tablets"],
  ["Amoxicillin", "Antibiotics", "capsules"],
  ["ORS Sachets", "Rehydration", "sachets"],
  ["Iron + Folic Acid", "Maternal & Child", "tablets"],
  ["Amlodipine", "Hypertension", "tablets"],
  ["Salbutamol Inhaler", "Respiratory", "inhalers"],
  ["Normal Saline 0.9%", "Infusion", "bottles"],
  ["Metformin", "Diabetes", "tablets"],
  ["Ceftriaxone Injection", "Antibiotics", "vials"],
];

const DAY_OF_WEEK = [0.62, 0.8, 0.95, 1.0, 1.08, 0.92, 0.7];

export function buildSyntheticDataset(): SyntheticDataset {
  const rand = mulberry32(20260924);

  const hospitals = HOSPITAL_NAMES.map((name, index) => ({
    id: index + 1,
    name,
  }));

  const medicines = MEDICINE_DEFS.map((defs, index) => ({
    id: index + 1,
    name: defs[0],
    category: defs[1],
    criticality: index % 3 === 0 ? "critical" : "normal",
    unit: defs[2],
  }));

  const inventory: SyntheticInventory[] = [];
  const demandRows: SyntheticDemandRow[] = [];

  /* Dataset ends "yesterday" and spans one full year. */
  const end = new Date(2026, 8, 22); // 2026-09-22

  for (const hospital of hospitals) {
    const scale = 12 + hospital.id * 6;

    for (const medicine of medicines) {
      const base = 8 + ((medicine.id * 13 + hospital.id * 7) % 24);

      const mean = Math.max(4, base * (scale / 26));

      const safetyStock = Math.round(mean * 4.5);

      const currentStock = Math.round(
        Math.max(safetyStock, mean * (8 + rand() * 20)),
      );

      inventory.push({
        hospital_id: hospital.id,
        medicine_id: medicine.id,
        current_stock: currentStock,
        safety_stock: safetyStock,
        daily_consumption: Number(mean.toFixed(2)),
      });

      const series: SyntheticDemandRow[] = [];

      for (let dayOffset = 364; dayOffset >= 0; dayOffset--) {
        const date = new Date(end);

        date.setDate(date.getDate() - dayOffset);

        const weekday = date.getDay();

        const month = date.getMonth();

        const seasonal = 1 + 0.18 * Math.sin((2 * Math.PI * month) / 12 + 0.6);

        const trend = 1 + 0.002 * (dayOffset / 7);

        const noise = 0.75 + rand() * 0.5;

        const spike = rand() < 0.04 ? 1.6 : 1;

        const demand = Math.max(
          1,
          Math.round(
            mean * DAY_OF_WEEK[weekday] * seasonal * trend * noise * spike,
          ),
        );

        series.push({
          hospital_id: hospital.id,
          medicine_id: medicine.id,
          date: date.toISOString().split("T")[0],
          demand,
        });
      }

      demandRows.push(...series);
    }
  }

  return { hospitals, medicines, inventory, demandRows };
}