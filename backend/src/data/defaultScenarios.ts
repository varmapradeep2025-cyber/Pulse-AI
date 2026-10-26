/*
 * Pulse AI — code-defined scenario defaults
 * ==========================================
 * The dashboard uses scenario IDs 1-5. These definitions mirror the
 * reference seed in README.md so the demo can run even when the
 * `scenarios` table has not been seeded.
 */

export type SupportedDisruptionType =
  | "supplier_failure"
  | "transport_delay"
  | "demand_surge"
  | "hospital_disruption"
  | "combined";

export interface ScenarioDefinition {
  id: number;
  name: string;
  description: string;
  disruption_type: SupportedDisruptionType;
  duration_days: number;
  demand_change_percent: number;
  transport_delay_days: number;
}

const SUPPORTED_DISRUPTION_TYPES: ReadonlySet<string> = new Set([
  "supplier_failure",
  "transport_delay",
  "demand_surge",
  "hospital_disruption",
  "combined",
]);

export const DEFAULT_SCENARIOS: readonly ScenarioDefinition[] = [
  {
    id: 1,
    name: "Supplier Failure",
    description: "Primary supplier unavailable for 7 days.",
    disruption_type: "supplier_failure",
    duration_days: 7,
    demand_change_percent: 0,
    transport_delay_days: 0,
  },
  {
    id: 2,
    name: "Transport Delay",
    description: "Expected deliveries delayed by 3 days.",
    disruption_type: "transport_delay",
    duration_days: 3,
    demand_change_percent: 0,
    transport_delay_days: 3,
  },
  {
    id: 3,
    name: "Demand Surge",
    description: "Demand for selected resources increases by 30% for 7 days.",
    disruption_type: "demand_surge",
    duration_days: 7,
    demand_change_percent: 30,
    transport_delay_days: 0,
  },
  {
    id: 4,
    name: "Hospital Disruption",
    description:
      "Facility-level demand rises 20%; redistribution matches surplus.",
    disruption_type: "hospital_disruption",
    duration_days: 7,
    demand_change_percent: 20,
    transport_delay_days: 0,
  },
  {
    id: 5,
    name: "Combined Crisis",
    description:
      "Supplier failure + 30% demand rise + 3-day delivery delay.",
    disruption_type: "combined",
    duration_days: 7,
    demand_change_percent: 30,
    transport_delay_days: 3,
  },
];

export function defaultScenarioForId(
  id: number,
): ScenarioDefinition | undefined {
  return DEFAULT_SCENARIOS.find((scenario) => scenario.id === id);
}

export function isSupportedDisruptionType(
  value: string,
): value is SupportedDisruptionType {
  return SUPPORTED_DISRUPTION_TYPES.has(value);
}

export function supportedScenarioIds(): number[] {
  return DEFAULT_SCENARIOS.map((scenario) => scenario.id);
}
