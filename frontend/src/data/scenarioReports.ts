/*
 * Pulse AI — persisted scenario simulation reports.
 *
 * Every simulation the user runs is stored in localStorage and surfaced
 * inside the existing Reports Portal (ReportsPage) so simulations and
 * medical reports share one reporting space.
 */

import type { RiskLabel, ScenarioResponse } from "../api/scenarios";

const STORAGE_KEY = "pulseai.scenarioReports";

export type ScenarioReportItem = {
  hospital_id: number;
  hospital_name: string;
  city: string;
  medicine_name: string;
  unit: string;
  starting_stock: number;
  safety_stock: number;
  effective_daily_demand: number;
  window_days: number;
  risk_label: RiskLabel;
  risk_reason: string;
  projected_remaining_stock: number;
  days_of_stock_remaining: number;
  shortage_quantity: number;
  stock_out_day: number | null;
  recommendation: string;
  donor_hospital_name?: string;
  transfer_units?: number;
};

export type ScenarioReport = {
  id: string;
  scenario_id: number;
  scenario_name: string;
  disruption_type: string;
  created_at: string;
  headline: string;
  disclaimer: string;
  demand_change_label: string;
  supplier_disruption_label: string;
  projected_shortage_total: number;
  worst_risk_label: RiskLabel;
  result_counts: Record<RiskLabel, number>;
  affected_hospitals: string[];
  affected_medicines: string[];
  assumptions: string[];
  items: ScenarioReportItem[];
};

export function loadScenarioReports(): ScenarioReport[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);

    return Array.isArray(parsed) ? (parsed as ScenarioReport[]) : [];
  } catch {
    return [];
  }
}

export function buildScenarioReport(
  response: ScenarioResponse,
  scenarioId: number,
): ScenarioReport {
  const scenario = response.scenario;

  const affectedHospitals = Array.from(
    new Set(
      response.results.map(
        (result) => `${result.hospital.hospital_name} (${result.hospital.city})`,
      ),
    ),
  );

  const affectedMedicines = Array.from(
    new Set(
      response.results.map((result) => result.medicine.generic_name),
    ),
  );

  const items: ScenarioReportItem[] = response.results.map((result) => ({
    hospital_id: result.hospital_id,
    hospital_name: result.hospital.hospital_name,
    city: result.hospital.city,
    medicine_name: result.medicine.generic_name,
    unit: result.medicine.unit,
    starting_stock: result.starting_stock,
    safety_stock: result.safety_stock,
    effective_daily_demand: result.effective_daily_demand,
    window_days: result.disruption_window_days,
    risk_label: result.risk_label,
    risk_reason: result.risk_reason,
    projected_remaining_stock: result.projected_remaining_stock,
    days_of_stock_remaining: result.days_of_stock_remaining,
    shortage_quantity: result.estimated_shortage_quantity,
    stock_out_day: result.stock_out_day,
    recommendation: result.recommendation,
    donor_hospital_name: result.redistribution?.donor_hospital_name,
    transfer_units: result.redistribution?.transfer_units,
  }));

  return {
    id: `SIM-${Date.now()}`,
    scenario_id: scenarioId,
    scenario_name: scenario.scenario.name,
    disruption_type: scenario.scenario.disruption_type,
    created_at: new Date().toISOString(),
    headline: scenario.headline,
    disclaimer: scenario.disclaimer,
    demand_change_label: scenario.demand_change_label,
    supplier_disruption_label: scenario.supplier_disruption_label,
    projected_shortage_total: scenario.projected_shortage_total,
    worst_risk_label: scenario.worst_risk_label,
    result_counts: scenario.result_counts,
    affected_hospitals: affectedHospitals,
    affected_medicines: affectedMedicines,
    assumptions: scenario.assumptions,
    items,
  };
}

export function saveScenarioReport(
  response: ScenarioResponse,
  scenarioId: number,
): ScenarioReport {
  const reports = loadScenarioReports();
  const report = buildScenarioReport(response, scenarioId);

  reports.unshift(report);

  // Keep the last 12 runs to avoid unbounded growth of localStorage.
  localStorage.setItem(STORAGE_KEY, JSON.stringify(reports.slice(0, 12)));

  return report;
}

export function clearScenarioReports(): void {
  localStorage.removeItem(STORAGE_KEY);
}