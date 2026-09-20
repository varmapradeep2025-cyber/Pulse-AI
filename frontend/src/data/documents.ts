import type { Document, DocumentCategory } from "../types/domain";

export const documentCategories: DocumentCategory[] = [
  "Identity Documents",
  "Healthcare Documents",
  "Scheme Documents",
  "Reports",
  "Prescriptions",
];

export const sampleDocuments: Document[] = [
  {
    id: "demo-doc-1",
    title: "Aadhaar Card",
    category: "Identity Documents",
    dateAdded: "2026-01-12",
    fileType: "PDF",
    isDemo: true,
  },
  {
    id: "demo-doc-2",
    title: "Voter ID",
    category: "Identity Documents",
    dateAdded: "2026-02-03",
    fileType: "Image",
    isDemo: true,
  },
  {
    id: "demo-doc-3",
    title: "Hospital Registration Card",
    category: "Healthcare Documents",
    dateAdded: "2026-02-18",
    fileType: "Photo",
    isDemo: true,
  },
  {
    id: "demo-doc-4",
    title: "Previous Scheme Application",
    category: "Scheme Documents",
    dateAdded: "2026-03-01",
    fileType: "PDF",
    isDemo: true,
  },
  {
    id: "demo-doc-5",
    title: "Blood Test Report",
    category: "Reports",
    dateAdded: "2026-03-14",
    fileType: "PDF",
    isDemo: true,
  },
  {
    id: "demo-doc-6",
    title: "Prescription",
    category: "Prescriptions",
    dateAdded: "2026-03-20",
    fileType: "Photo",
    isDemo: true,
  },
];

export const categoryIcons: Record<DocumentCategory, string> = {
  "Identity Documents": "🪪",
  "Healthcare Documents": "🩺",
  "Scheme Documents": "🏛️",
  "Reports": "📋",
  "Prescriptions": "💊",
};