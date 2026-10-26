/*
 * Pulse AI — scenario simulation API client + response types.
 *
 * Types mirror backend/src/services/scenarioService.ts and the
 * supply-chain catalog (backend/src/data/catalog.ts).
 */

const API_BASE_URL = "http://localhost:4000";

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type RiskLabel = "GREEN" | "YELLOW" | "RED" | "CRITICAL";

export type SimulationDay = {
  day: number;
  projected_stock: number;
  status: "NORMAL" | "AT_RISK" | "STOCK_OUT";
};

export type CatalogMedicine = {
  medicine_id: number;
  generic_name: string;
  category: string;
  unit: string;
  lead_time_days: number;
  supplier_ids: string[];
  criticality: "critical" | "standard";
};

export type CatalogHospital = {
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
  demonstration: boolean;
};

export type CatalogSupplier = {
  supplier_id: string;
  supplier_name: string;
  location: string;
  supplied_medicines: string[];
  normal_lead_time: number;
  emergency_lead_time: number;
  reliability_score: number;
  current_status: "active" | "disrupted";
};

export type RecommendationType =
  | "reallocate"
  | "alternate_supplier"
  | "emergency_procurement"
  | "monitoring";

export type Recommendation = {
  type: RecommendationType;
  why: string;
  action: string;
  expected_impact: string;
};

export type RedistributionTransfer = {
  medicine_id: number;
  donor_hospital_id: number;
  donor_hospital_name: string;
  transfer_units: number;
};

export type SimulationResult = {
  /* Legacy fields (kept for the existing result cards). */
  hospital_id: number;
  medicine_id: number;
  starting_stock: number;
  safety_stock: number;
  predicted_daily_demand: number;
  risk_level: RiskLevel;
  recommendation: string;
  model?: ModelInfo;
  days: SimulationDay[];
  stock_out_day: number | null;

  /* Realistic entity metadata. */
  hospital: CatalogHospital;
  medicine: CatalogMedicine;

  /* Disruption parameters applied to this item. */
  effective_daily_demand: number;
  disruption_window_days: number;
  supplier_disrupted: boolean;

  /* Impact. */
  projected_demand: number;
  projected_remaining_stock: number;
  days_of_stock_remaining: number;
  safety_stock_breach: boolean;
  estimated_shortage_quantity: number;

  /* Risk (transparent). */
  risk_label: RiskLabel;
  risk_reason: string;

  /* Recommendations (operational only). */
  recommendations: Recommendation[];
  redistribution?: RedistributionTransfer;
};

export type ModelInfo = {
  name: string;
  featureNames: string[];
  trainRows: number;
  testRows: number;
  mlMae: number;
  baselineMae: number;
};

export type ScenarioSummary = {
  scenario: {
    id: number;
    name: string;
    description: string;
    disruption_type: string;
    duration_days: number;
    demand_change_percent: number;
    transport_delay_days: number;
  };
  disclaimer: string;
  affected_suppliers: CatalogSupplier[];
  affected_medicine_ids: number[];
  affected_hospital_ids: number[];
  headline: string;
  demand_change_label: string;
  supplier_disruption_label: string;
  projected_shortage_total: number;
  worst_risk_label: RiskLabel;
  result_counts: Record<RiskLabel, number>;
  assumptions: string[];
};

export type ScenarioDataSource = "supabase" | "demo";

export type ScenarioResponse = {
  scenario: ScenarioSummary;
  model: ModelInfo;
  results: SimulationResult[];
  source: ScenarioDataSource;
};

export async function runScenarioSimulation(
  scenarioId: number,
): Promise<ScenarioResponse> {
  const response = await fetch(
    `${API_BASE_URL}/api/scenarios/simulate`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        scenarioId,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(
      `Simulation failed: ${response.status}`,
    );
  }

  const data = await response.json();

  if (!data.success) {
    throw new Error(
      data.message ?? "Simulation failed",
    );
  }

  return data.results;
}