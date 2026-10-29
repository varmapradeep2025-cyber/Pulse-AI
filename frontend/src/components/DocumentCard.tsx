import { useState } from "react";
import { categoryIcons, statusIcons } from "../data/documents";
import { getHospitalName } from "../data/hospitals";
import type { Document, DocumentStatus } from "../types/domain";
import { useLanguage } from "../context/LanguageContext";
import type { TranslationKey } from "../data/translations";

const CATEGORY_KEYS: Record<Document["category"], TranslationKey> = {
  "Identity Documents": "doc.identity",
  "Healthcare Documents": "doc.healthcare",
  "Scheme Documents": "doc.scheme",
  Reports: "doc.reports",
  Prescriptions: "doc.prescriptions",
};

const STATUS_TONE: Record<DocumentStatus, "ready" | "pending" | "reviewed"> = {
  Uploaded: "ready",
  Processing: "pending",
  Ready: "ready",
  Verified: "reviewed",
  Rejected: "pending",
};

interface DocumentCardProps {
  doc: Document;
}

export default function DocumentCard({ doc }: DocumentCardProps) {
  const { t } = useLanguage();
  const [viewOpen, setViewOpen] = useState(false);

  const statusTone = STATUS_TONE[doc.status];
  const hospitalName = getHospitalName(doc.hospital_id);

  return (
    <article className="document-card">
      <span className="document-card__icon" aria-hidden="true">
        {categoryIcons[doc.category]}
      </span>
      <div className="document-card__body">
        <h3 className="document-card__title">{doc.document_name ?? doc.title}</h3>
        <p className="document-card__meta">
          {t(CATEGORY_KEYS[doc.category])} · {doc.file_type} · {t("doc.added")}{" "}
          {doc.upload_date ?? doc.dateAdded}
        </p>

        <div className="document-card__meta">
          <span
            className={`chip chip--status chip--${statusTone}`}
            style={{ minHeight: "1.6rem", padding: "0.1rem 0.6rem", fontSize: "0.8rem" }}
          >
            {statusIcons[doc.status]} {doc.status}
          </span>
        </div>

        <div className="document-card__actions">
          <button
            type="button"
            className="btn btn--small"
            aria-expanded={viewOpen}
            onClick={() => setViewOpen((open) => !open)}
          >
            {t("doc.view")}
          </button>

          {doc.fileDataUrl && (
            <a
              className="btn btn--small"
              href={doc.fileDataUrl}
              download={doc.document_name ?? doc.title}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open original file
            </a>
          )}
        </div>

        {viewOpen && (
          <div className="document-card__preview">
            <p>
              <strong>Document ID:</strong> {doc.document_id}
            </p>
            <p>
              <strong>Patient ID:</strong> {doc.patient_id} (synthetic)
            </p>
            <p>
              <strong>Hospital:</strong> {hospitalName}
            </p>
            <p>
              <strong>Type:</strong> {doc.document_type}
            </p>
            <p>
              <strong>Size:</strong> {doc.file_size} ·{" "}
              <strong>Uploaded:</strong> {doc.upload_date ?? doc.dateAdded}
            </p>
            <p>
              <strong>Status:</strong> {doc.status}
            </p>
            {doc.description && <p>{doc.description}</p>}
  
            <p>{t("doc.scanNote")}</p>
          </div>
        )}
      </div>
    </article>
  );
}