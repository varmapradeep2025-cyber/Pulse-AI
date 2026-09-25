import type { Document, DocumentCategory, DocumentStatus } from "../types/domain";

/*
 * Synthetic Demo Data
 * -------------------
 * Documents below are FICTIONAL demo records. patient_id values are
 * synthetic placeholders (PAT-001 …) and are NOT linked to any real
 * person or real medical record. hospital_id values reference the
 * synthetic hospital dataset (H001 … H005).
 */

export const SYNTHETIC_DOCUMENT_TYPES = [
  "Lab Report",
  "Blood Test",
  "Imaging Report",
  "Discharge Summary",
  "Prescription Record",
  "Vaccination Record",
  "Referral Document",
  "Medical Certificate",
  "Identity Document (Aadhaar)",
  "Address/Residence Proof",
  "Birth Certificate",
  "Age Proof",
  "Caste Certificate",
  "Bank/Financial Proof",
  "Photograph",
  "Income Certificate",
  "BPL Certificate",
  "MCP Card",
  "Disability Certificate (UDID)",
  "Samagra ID Card",
  "ESI/CGHS Card",
  "Employer/Service Proof",
] as const;

const DOCUMENT_TYPE_CATEGORY: Record<string, DocumentCategory> = {
  "Lab Report": "Reports",
  "Blood Test": "Reports",
  "Imaging Report": "Reports",
  "Discharge Summary": "Healthcare Documents",
  "Prescription Record": "Prescriptions",
  "Vaccination Record": "Healthcare Documents",
  "Referral Document": "Healthcare Documents",
  "Medical Certificate": "Identity Documents",
  "Identity Document (Aadhaar)": "Identity Documents",
  "Address/Residence Proof": "Identity Documents",
  "Birth Certificate": "Identity Documents",
  "Age Proof": "Identity Documents",
  "Caste Certificate": "Identity Documents",
  "Bank/Financial Proof": "Identity Documents",
  Photograph: "Identity Documents",
  "Income Certificate": "Scheme Documents",
  "BPL Certificate": "Scheme Documents",
  "MCP Card": "Scheme Documents",
  "Disability Certificate (UDID)": "Scheme Documents",
  "Samagra ID Card": "Identity Documents",
  "ESI/CGHS Card": "Scheme Documents",
  "Employer/Service Proof": "Scheme Documents",
};

/*
 * Maps a scheme's required-document name (from the Government Schemes
 * dataset) to a document type in the Documents portal dropdown. This is
 * used when a scheme's "Upload Missing Document" button opens the existing
 * Documents portal with the form prefilled.
 */
const SCHEME_DOCUMENT_TYPE: Record<string, string> = {
  Aadhaar: "Identity Document (Aadhaar)",
  "Address/residence proof": "Address/Residence Proof",
  "Bank account details": "Bank/Financial Proof",
  "Birth certificate": "Birth Certificate",
  "Income certificate (BPL)": "Income Certificate",
  "Age proof": "Age Proof",
  "Caste certificate": "Caste Certificate",
  "MCP card": "MCP Card",
  "Disability certificate (UDID)": "Disability Certificate (UDID)",
  "Samagra ID card": "Samagra ID Card",
  "ESI IP card": "ESI/CGHS Card",
  "CGHS card": "ESI/CGHS Card",
  "Employer/service proof": "Employer/Service Proof",
  "Medical certificate": "Medical Certificate",
  Photograph: "Photograph",
};

export function schemeDocumentType(documentName: string): string {
  return SCHEME_DOCUMENT_TYPE[documentName] ?? "Medical Certificate";
}

export function documentCategoryByType(
  documentType: string,
): DocumentCategory {
  return DOCUMENT_TYPE_CATEGORY[documentType] ?? "Healthcare Documents";
}

export const documentCategories: DocumentCategory[] = [
  "Identity Documents",
  "Healthcare Documents",
  "Scheme Documents",
  "Reports",
  "Prescriptions",
];

export const categoryIcons: Record<DocumentCategory, string> = {
  "Identity Documents": "🪪",
  "Healthcare Documents": "🩺",
  "Scheme Documents": "🏛️",
  "Reports": "📋",
  "Prescriptions": "💊",
};

export const statusIcons: Record<DocumentStatus, string> = {
  Uploaded: "⬆️",
  Processing: "⏳",
  Ready: "✅",
  Verified: "🛡️",
  Rejected: "⚠️",
};

const DEFAULT_STATUS: DocumentStatus = "Ready";

const RECORDS: Array<
  Omit<Document, "id" | "title" | "category" | "dateAdded" | "fileType" | "isDemo">
> = [
  {
    document_id: "DOC-001",
    patient_id: "PAT-001",
    document_type: "Lab Report",
    document_name: "Glycated Haemoglobin (HbA1c)",
    hospital_id: "H001",
    upload_date: "2026-03-18",
    status: "Verified",
    file_type: "PDF",
    file_size: "1.2 MB",
    description: "Lab report for HbA1c measurement, marked Verified in the demo.",
  },
  {
    document_id: "DOC-002",
    patient_id: "PAT-001",
    document_type: "Blood Test",
    document_name: "Complete Blood Count (CBC)",
    hospital_id: "H001",
    upload_date: "2026-02-26",
    status: "Ready",
    file_type: "PDF",
    file_size: "0.9 MB",
    description: "CBC blood test report from the synthetic demo dataset.",
  },
  {
    document_id: "DOC-003",
    patient_id: "PAT-002",
    document_type: "Imaging Report",
    document_name: "Chest X-Ray PA View",
    hospital_id: "H002",
    upload_date: "2026-03-10",
    status: "Ready",
    file_type: "JPEG",
    file_size: "2.4 MB",
    description: "Chest X-ray imaging report, synthetic demo record.",
  },
  {
    document_id: "DOC-004",
    patient_id: "PAT-003",
    document_type: "Discharge Summary",
    document_name: "Inpatient Discharge Summary",
    hospital_id: "H001",
    upload_date: "2026-03-02",
    status: "Verified",
    file_type: "PDF",
    file_size: "1.6 MB",
    description: "Discharge summary from the synthetic demo hospital stay.",
  },
  {
    document_id: "DOC-005",
    patient_id: "PAT-002",
    document_type: "Prescription Record",
    document_name: "Prescription — General Medicine",
    hospital_id: "H002",
    upload_date: "2026-02-19",
    status: "Ready",
    file_type: "PNG",
    file_size: "0.4 MB",
    description: "Prescription record entry, synthetic demo data.",
  },
  {
    document_id: "DOC-006",
    patient_id: "PAT-004",
    document_type: "Vaccination Record",
    document_name: "Immunization Record Card",
    hospital_id: "H005",
    upload_date: "2026-03-12",
    status: "Verified",
    file_type: "PDF",
    file_size: "0.7 MB",
    description: "Synthetic immunization / vaccination record card.",
  },
  {
    document_id: "DOC-007",
    patient_id: "PAT-003",
    document_type: "Blood Test",
    document_name: "Random Blood Sugar (RBS)",
    hospital_id: "H004",
    upload_date: "2026-03-05",
    status: "Ready",
    file_type: "PDF",
    file_size: "0.6 MB",
    description: "RBS blood sugar test report, synthetic demo record.",
  },
  {
    document_id: "DOC-008",
    patient_id: "PAT-001",
    document_type: "Imaging Report",
    document_name: "X-Ray — Right Wrist",
    hospital_id: "H001",
    upload_date: "2026-01-28",
    status: "Uploaded",
    file_type: "JPEG",
    file_size: "2.1 MB",
    description: "Synthetic imaging report for a wrist X-ray.",
  },
  {
    document_id: "DOC-009",
    patient_id: "PAT-005",
    document_type: "Referral Document",
    document_name: "Referral to Higher Centre",
    hospital_id: "H003",
    upload_date: "2026-03-15",
    status: "Processing",
    file_type: "PDF",
    file_size: "0.5 MB",
    description: "Referral document towards an advanced care centre (synthetic).",
  },
  {
    document_id: "DOC-010",
    patient_id: "PAT-002",
    document_type: "Blood Test",
    document_name: "Lipid Profile",
    hospital_id: "H002",
    upload_date: "2026-02-27",
    status: "Verified",
    file_type: "PDF",
    file_size: "0.8 MB",
    description: "Lipid profile report, synthetic demo data.",
  },
  {
    document_id: "DOC-011",
    patient_id: "PAT-003",
    document_type: "Lab Report",
    document_name: "Urine Routine Examination",
    hospital_id: "H004",
    upload_date: "2026-03-22",
    status: "Processing",
    file_type: "PDF",
    file_size: "0.3 MB",
    description: "Routine laboratory examination record, synthetic demo.",
  },
  {
    document_id: "DOC-012",
    patient_id: "PAT-004",
    document_type: "Medical Certificate",
    document_name: "Medical Fitness Certificate",
    hospital_id: "H005",
    upload_date: "2026-02-16",
    status: "Verified",
    file_type: "PDF",
    file_size: "0.4 MB",
    description: "Synthetic medical fitness certificate sample.",
  },
  {
    document_id: "DOC-013",
    patient_id: "PAT-001",
    document_type: "Prescription Record",
    document_name: "Prescription — Cardiology",
    hospital_id: "H001",
    upload_date: "2026-03-14",
    status: "Ready",
    file_type: "JPEG",
    file_size: "0.5 MB",
    description: "Cardiology prescription record, synthetic demo data.",
  },
  {
    document_id: "DOC-014",
    patient_id: "PAT-005",
    document_type: "Imaging Report",
    document_name: "Ultrasound — Abdomen",
    hospital_id: "H005",
    upload_date: "2026-03-19",
    status: "Ready",
    file_type: "PDF",
    file_size: "3.1 MB",
    description: "Ultrasound imaging report, synthetic demo record.",
  },
  {
    document_id: "DOC-015",
    patient_id: "PAT-002",
    document_type: "Discharge Summary",
    document_name: "Emergency Observation Summary",
    hospital_id: "H002",
    upload_date: "2026-03-08",
    status: "Ready",
    file_type: "PDF",
    file_size: "1.3 MB",
    description: "Emergency observation discharge summary (synthetic).",
  },
  {
    document_id: "DOC-016",
    patient_id: "PAT-003",
    document_type: "Vaccination Record",
    document_name: "Child Vaccination Schedule",
    hospital_id: "H003",
    upload_date: "2026-01-20",
    status: "Verified",
    file_type: "PDF",
    file_size: "0.6 MB",
    description: "Childhood vaccination schedule record, synthetic demo.",
  },
  {
    document_id: "DOC-017",
    patient_id: "PAT-004",
    document_type: "Lab Report",
    document_name: "Kidney Function Test (KFT)",
    hospital_id: "H004",
    upload_date: "2026-03-26",
    status: "Processing",
    file_type: "PDF",
    file_size: "0.9 MB",
    description: "KFT lab report, synthetic demo record.",
  },
  {
    document_id: "DOC-018",
    patient_id: "PAT-005",
    document_type: "Referral Document",
    document_name: "Specialist Referral — Obstetrics",
    hospital_id: "H005",
    upload_date: "2026-02-24",
    status: "Verified",
    file_type: "PDF",
    file_size: "0.5 MB",
    description: "Obstetrics specialist referral, synthetic demo record.",
  },
];

export const sampleDocuments: Document[] = RECORDS.map((record) => ({
  id: record.document_id,
  title: record.document_name,
  category: documentCategoryByType(record.document_type),
  dateAdded: record.upload_date,
  fileType: record.file_type,
  isDemo: true,
  ...record,
  status: record.status ?? DEFAULT_STATUS,
}));