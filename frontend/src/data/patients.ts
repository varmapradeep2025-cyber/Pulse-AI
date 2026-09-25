/*
 * Synthetic Demo Data
 * -------------------
 * Patient identifiers used across the Pulse AI demo. These are SYNTHETIC
 * placeholder IDs only. They are not linked to any real person, real
 * medical records, or real personal information.
 */

export const PATIENT_ID_PREFIX = "PAT";

export const syntheticPatientIds: string[] = [
  "PAT-001",
  "PAT-002",
  "PAT-003",
  "PAT-004",
  "PAT-005",
];

export function buildPatientId(index: number): string {
  return `${PATIENT_ID_PREFIX}-${String(index).padStart(3, "0")}`;
}