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

export interface HealthcareFacility {
  id: string;
  name: string;
  location: string;
  facilityType: FacilityType;
  services: string[];
  openingHours: string;
  availability: "Open" | "Busy" | "High Demand";
  isDemo: boolean;
}

export interface HealthcareScheme {
  id: string;
  name: string;
  whoIsFor: string;
  documents: string[];
  applicationSteps: string[];
  isDemo: boolean;
}

export type DocumentCategory =
  | "Identity Documents"
  | "Healthcare Documents"
  | "Scheme Documents"
  | "Reports"
  | "Prescriptions";

export interface Document {
  id: string;
  title: string;
  category: DocumentCategory;
  dateAdded: string;
  fileType: string;
  isDemo: boolean;
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