import type { MedicalReport } from "../types/domain";

export const sampleReports: MedicalReport[] = [
  {
    id: "demo-report-1",
    title: "CBC Blood Test",
    reportType: "Blood Test",
    date: "2026-03-14",
    status: "Ready",
    isDemo: true,
    simpleSummary: "Demo explanation only. This sample card shows how a report can be explained in simpler words. Always ask a qualified healthcare provider or a doctor about your own report.",
  },
  {
    id: "demo-report-2",
    title: "Chest X-Ray",
    reportType: "Imaging",
    date: "2026-03-10",
    status: "Reviewed",
    isDemo: true,
    simpleSummary: "Demo explanation only. This sample card shows how an imaging report could be summarised. It is not a medical result.",
  },
  {
    id: "demo-report-3",
    title: "Random Blood Sugar",
    reportType: "Blood Test",
    date: "2026-03-05",
    status: "Ready",
    isDemo: true,
    simpleSummary: "Demo explanation only. This sample shows a test result card. Please discuss any result with a qualified healthcare provider.",
  },
  {
    id: "demo-report-4",
    title: "ECG",
    reportType: "Heart Test",
    date: "2026-02-27",
    status: "Pending",
    isDemo: true,
    simpleSummary: "Demo explanation only. This sample shows how a heart test report could be explained in simple language once results are ready.",
  },
];