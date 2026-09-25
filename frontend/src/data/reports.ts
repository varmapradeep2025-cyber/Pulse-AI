import type { MedicalReport } from "../types/domain";

/*
 * Synthetic Demo Data
 * -------------------
 * Reports below are FICTIONAL demo records. patient_id values are
 * synthetic placeholders (PAT-001 …) and are NOT linked to any real
 * person or real medical result. document_id values reference the
 * synthetic documents dataset (DOC-001 …), and hospital_id values
 * reference the synthetic hospital dataset (H001 … H005).
 */

export const sampleReports: MedicalReport[] = [
  {
    id: "REPORT-01",
    title: "CBC Blood Test",
    reportType: "Blood Test",
    date: "2026-03-14",
    status: "Ready",
    isDemo: true,
    simpleSummary:
      "Demo explanation only. This sample card shows how a CBC blood report can be explained in simpler words. Always ask a qualified healthcare provider or a doctor about your own report.",
    report_id: "REPORT-01",
    patient_id: "PAT-001",
    hospital_id: "H001",
    document_id: "DOC-002",
    issued_by: "Pulse Care Multispecialty Hospital — Laboratory",
  },
  {
    id: "REPORT-02",
    title: "Chest X-Ray",
    reportType: "Imaging",
    date: "2026-03-10",
    status: "Reviewed",
    isDemo: true,
    simpleSummary:
      "Demo explanation only. This sample card shows how an imaging report could be summarised. It is not a medical result.",
    report_id: "REPORT-02",
    patient_id: "PAT-002",
    hospital_id: "H002",
    document_id: "DOC-003",
    issued_by: "Central District Hospital — Radiology",
  },
  {
    id: "REPORT-03",
    title: "Random Blood Sugar",
    reportType: "Blood Test",
    date: "2026-03-05",
    status: "Ready",
    isDemo: true,
    simpleSummary:
      "Demo explanation only. This sample shows a test result card. Please discuss any result with a qualified healthcare provider.",
    report_id: "REPORT-03",
    patient_id: "PAT-003",
    hospital_id: "H004",
    document_id: "DOC-007",
    issued_by: "Aarogya Diagnostics & Care Centre — Laboratory",
  },
  {
    id: "REPORT-04",
    title: "ECG",
    reportType: "Heart Test",
    date: "2026-02-27",
    status: "Pending",
    isDemo: true,
    simpleSummary:
      "Demo explanation only. This sample shows how a heart test report could be explained in simple language once results are ready.",
    report_id: "REPORT-04",
    patient_id: "PAT-002",
    hospital_id: "H002",
    document_id: "DOC-015",
    issued_by: "Central District Hospital — Cardiology",
  },
  {
    id: "REPORT-05",
    title: "Lipid Profile",
    reportType: "Blood Test",
    date: "2026-02-27",
    status: "Reviewed",
    isDemo: true,
    simpleSummary:
      "Demo explanation only. This sample shows a lipid panel result card. Please share any result with a qualified healthcare provider.",
    report_id: "REPORT-05",
    patient_id: "PAT-002",
    hospital_id: "H002",
    document_id: "DOC-010",
    issued_by: "Central District Hospital — Laboratory",
  },
  {
    id: "REPORT-06",
    title: "Kidney Function Test",
    reportType: "Blood Test",
    date: "2026-03-26",
    status: "Pending",
    isDemo: true,
    simpleSummary:
      "Demo explanation only. This sample shows how a kidney function report could be summarised once the results are available.",
    report_id: "REPORT-06",
    patient_id: "PAT-004",
    hospital_id: "H004",
    document_id: "DOC-017",
    issued_by: "Aarogya Diagnostics & Care Centre — Laboratory",
  },
  {
    id: "REPORT-07",
    title: "Ultrasound — Abdomen",
    reportType: "Imaging",
    date: "2026-03-19",
    status: "Ready",
    isDemo: true,
    simpleSummary:
      "Demo explanation only. This sample shows how an ultrasound imaging report could be explained in simpler words. It is not a medical result.",
    report_id: "REPORT-07",
    patient_id: "PAT-005",
    hospital_id: "H005",
    document_id: "DOC-014",
    issued_by: "Janani Maternal & Child Care Hospital — Imaging",
  },
  {
    id: "REPORT-08",
    title: "HbA1c (Glycated Haemoglobin)",
    reportType: "Blood Test",
    date: "2026-03-18",
    status: "Reviewed",
    isDemo: true,
    simpleSummary:
      "Demo explanation only. This sample shows a diabetes marker result card. Please discuss any result with a qualified healthcare provider.",
    report_id: "REPORT-08",
    patient_id: "PAT-001",
    hospital_id: "H001",
    document_id: "DOC-001",
    issued_by: "Pulse Care Multispecialty Hospital — Laboratory",
  },
];