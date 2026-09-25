export type SupportedLanguage =
  | "en"
  | "hi"
  | "mr"
  | "bn"
  | "ta"
  | "te"
  | "gu"
  | "kn"
  | "ml"
  | "pa";

export type LangCode = SupportedLanguage;

export interface LanguageOption {
  code: LangCode;
  label: string;
  nativeName: string;
}

export type FacilityType =
  | "Public Hospital"
  | "District Hospital"
  | "Community Health Centre"
  | "Primary Health Centre"
  | "Dispensary";

export type AvailabilityStatus = "Open" | "Busy" | "High Demand";

export interface HealthcareFacility {
  /* ---- Legacy fields (kept for existing UI components & routes) ---- */
  id: string;
  name: string;
  location: string;
  facilityType: FacilityType;
  services: string[];
  openingHours: string;
  availability: AvailabilityStatus;
  isDemo: boolean;

  /* ---- Synthetic dataset fields (synthetic demo data) ---- */
  hospital_id: string;
  hospital_name: string;
  city: string;
  state: string;
  address: string;
  latitude: number;
  longitude: number;
  hospital_type: string;
  emergency_available: boolean;
  phone: string;
  departments: string[];
  bed_capacity: number;
  available_beds: number;
  ICU_beds: number;
  available_ICU_beds: number;
  specialties: string[];
  status: AvailabilityStatus;
}

export type SchemeCategory =
  | "Health Insurance"
  | "Maternal/Child Health"
  | "Senior Citizens"
  | "Disease Support"
  | "Disability"
  | "General Healthcare";

export type SchemeScope = "Central" | "State";

export type SchemeEligibilityFieldType =
  | "age-range"
  | "select"
  | "boolean";

export interface SchemeEligibilityField {
  /* Machine name used to prefill a value from the demo citizen profile. */
  key: string;
  label: string;
  type: SchemeEligibilityFieldType;
  /* Answer choices rendered in the checker (for select/boolean/age-range). */
  options?: string[];
  /* Age range accepted by the scheme (for age-range fields). */
  ageMin?: number;
  ageMax?: number;
  /* Answer choices that satisfy the basic criterion. */
  matchValues?: string[];
  note?: string;
}

export interface HealthcareScheme {
  /* ---- Legacy fields (kept for existing UI components & search) ---- */
  id: string;
  name: string;
  whoIsFor: string;
  documents: string[];
  applicationSteps: string[];
  isDemo: boolean;

  /* ---- Structured scheme dataset fields (synthetic demo dataset) ---- */
  scheme_id: string;
  short_description: string;
  full_description: string;
  category: SchemeCategory;
  scope: SchemeScope;
  target_beneficiaries: string[];
  eligibility_rules: string[];
  age_requirement?: string;
  income_requirement?: string;
  location_requirement?: string;
  coverage: string;
  required_documents: string[];
  application_method: string;
  official_information_url: string;
  status: "Active";
  last_updated: string;
  demo_eligibility_fields: SchemeEligibilityField[];
  /* "verified" = information cross-checked against an official public source. */
  info_status: "verified" | "needs-confirmation";
}

export type DocumentCategory =
  | "Identity Documents"
  | "Healthcare Documents"
  | "Scheme Documents"
  | "Reports"
  | "Prescriptions";

export type DocumentStatus =
  | "Uploaded"
  | "Processing"
  | "Ready"
  | "Verified"
  | "Rejected";

export interface Document {
  /* ---- Legacy fields (kept for existing UI components & routes) ---- */
  id: string;
  title: string;
  category: DocumentCategory;
  dateAdded: string;
  fileType: string;
  isDemo: boolean;

  /* ---- Synthetic dataset fields (synthetic demo data) ---- */
  document_id: string;
  patient_id: string;
  document_name: string;
  document_type: string;
  hospital_id: string;
  upload_date: string;
  status: DocumentStatus;
  file_type: string;
  file_size: string;
  description: string;

  /*
   * Object URL of the file the user picked for a real (demo) upload.
   * Present only on documents actually uploaded in this session, so the
   * original file can be opened/downloaded from the document card.
   */
  fileDataUrl?: string;
}

export type ReportStatus = "Ready" | "Pending" | "Reviewed";

export interface MedicalReport {
  id: string;
  title: string;
  reportType: string;
  date: string;
  status: ReportStatus;
  isDemo: boolean;
  simpleSummary: string;

  /* ---- Synthetic dataset fields (synthetic demo data) ---- */
  report_id: string;
  patient_id: string;
  hospital_id: string;
  document_id: string;
  issued_by: string;
}

export type AssistantRole = "user" | "assistant";

export type AssistantMessageSource = "voice" | "text";

export interface AssistantMessage {
  id: string;
  role: AssistantRole;
  text: string;
  timestamp: string;
  source?: AssistantMessageSource;
}

export type VoiceState = "idle" | "listening" | "processing" | "response" | "error";

export const VOICE_TIMING = {
  listeningMs: 2500,
  processingMs: 1800,
} as const;