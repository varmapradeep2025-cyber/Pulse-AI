import type { HealthcareScheme } from "../types/domain";

/*
 * Synthetic Demo Citizen
 * ----------------------
 * A clearly-labelled synthetic user profile used only to demonstrate the
 * Government Schemes flow. No real personal information is collected or
 * stored. Values are fictional demo values for the hackathon.
 */

export interface DemoCitizenProfile {
  userId: string;
  linkedPatientId: string;
  label: string;
  state: string;
  area: string;
  age: number;
  gender: string;
  incomeCategory: string;
  incomeBand: string;
  beneficiaryCategory: string;
  bplCardHolder: string;
  seccListed: string;
  employeeStatus: string;
  centralGovtEmployee: string;
  disabilityStatus: string;
  firstLiveBirth: string;
  govtInstitutionalDelivery: string;
  unorganizedWorker: string;
  samagraIdHolder: string;
}

export const demoCitizenProfile: DemoCitizenProfile = {
  userId: "DEMO-001",
  linkedPatientId: "PAT-001",
  label: "Synthetic Demo Citizen",
  state: "Madhya Pradesh",
  area: "Urban",
  age: 32,
  gender: "Female",
  incomeCategory: "Very low income (non-BPL)",
  incomeBand: "Up to ₹21,000/month",
  beneficiaryCategory: "General category",
  bplCardHolder: "Yes",
  seccListed: "Yes",
  employeeStatus: "No",
  centralGovtEmployee: "No",
  disabilityStatus: "No",
  firstLiveBirth: "Yes",
  govtInstitutionalDelivery: "Yes",
  unorganizedWorker: "Yes",
  samagraIdHolder: "Yes",
};

export type SchemeTrackingPhase =
  | "Not Started"
  | "Checking Eligibility"
  | "Documents Pending"
  | "Ready to Apply"
  | "Application Information Viewed";

export interface SchemeTrackingFlags {
  eligibilityChecked: boolean;
  appearsEligible: boolean;
  infoViewed: boolean;
}

export const TRACKING_STORAGE_KEY = "pulse-ai-scheme-tracking";

export const DOCUMENTS_STORAGE_KEY = "pulse-ai-demo-citizen-docs";

export const INITIAL_DEMO_DOCUMENTS: string[] = [
  "Aadhaar",
  "Address/residence proof",
  "Bank account details",
  "Birth certificate",
];

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);

    if (raw) {
      return JSON.parse(raw) as T;
    }
  } catch {
    // localStorage unavailable or corrupt; use the fallback.
  }

  return fallback;
}

function writeJson<T>(key: string, value: T): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore persistence failures; in-memory state still applies.
  }
}

/** The document names the synthetic citizen has "uploaded" in the demo. */
export function getUploadedDocumentNames(): string[] {
  const stored = readJson<string[]>(DOCUMENTS_STORAGE_KEY, INITIAL_DEMO_DOCUMENTS);

  const merged = new Set([...INITIAL_DEMO_DOCUMENTS, ...stored]);

  return Array.from(merged);
}

/** Record a document upload made in the Documents portal. */
export function markDocumentUploaded(documentName: string): void {
  const current = getUploadedDocumentNames();

  const next = [...new Set([...current, documentName.trim()].filter(Boolean))];

  writeJson(DOCUMENTS_STORAGE_KEY, next);
}

export function isDocumentAvailable(documentName: string): boolean {
  return getUploadedDocumentNames().some(
    (name) => name.toLowerCase() === documentName.toLowerCase(),
  );
}

/* ------------------------------------------------------------------ */
/* Scheme tracking state (prototype only — not a real application)     */
/* ------------------------------------------------------------------ */

export function getSchemeTrackingFlags(
  schemeId: string,
): SchemeTrackingFlags {
  const all = readJson<Record<string, Partial<SchemeTrackingFlags>>>(
    TRACKING_STORAGE_KEY,
    {},
  );

  const flags = all[schemeId] ?? {};

  return {
    eligibilityChecked: flags.eligibilityChecked ?? false,
    appearsEligible: flags.appearsEligible ?? false,
    infoViewed: flags.infoViewed ?? false,
  };
}

export function setSchemeTrackingFlags(
  schemeId: string,
  patch: Partial<SchemeTrackingFlags>,
): void {
  const all = readJson<Record<string, Partial<SchemeTrackingFlags>>>(
    TRACKING_STORAGE_KEY,
    {},
  );

  all[schemeId] = { ...(all[schemeId] ?? {}), ...patch };

  writeJson(TRACKING_STORAGE_KEY, all);
}

export function resetSchemeTracking(schemeId: string): void {
  const all = readJson<Record<string, Partial<SchemeTrackingFlags>>>(
    TRACKING_STORAGE_KEY,
    {},
  );

  delete all[schemeId];

  writeJson(TRACKING_STORAGE_KEY, all);
}

/**
 * Prototype tracking state for a scheme. This reflects the demo flow only
 * and never claims that Pulse AI has submitted a real application.
 */
export function computeSchemePhase(
  scheme: HealthcareScheme,
  flags: SchemeTrackingFlags,
): SchemeTrackingPhase {
  if (!flags.eligibilityChecked) {
    return "Not Started";
  }

  if (!flags.appearsEligible) {
    return "Checking Eligibility";
  }

  const docsComplete = scheme.required_documents.every(
    (name) => isDocumentAvailable(name) || name.trim() === "",
  );

  if (!docsComplete) {
    return "Documents Pending";
  }

  if (!flags.infoViewed) {
    return "Ready to Apply";
  }

  return "Application Information Viewed";
}

/** True when all required documents for the scheme are available. */
export function areSchemeDocumentsComplete(
  scheme: HealthcareScheme,
): boolean {
  return scheme.required_documents.every(
    (name) => isDocumentAvailable(name) || name.trim() === "",
  );
}