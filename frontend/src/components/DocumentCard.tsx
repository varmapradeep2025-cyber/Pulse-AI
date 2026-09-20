import { useState } from "react";
import { categoryIcons } from "../data/documents";
import type { Document } from "../types/domain";
import { useLanguage } from "../context/LanguageContext";
import type { TranslationKey } from "../data/translations";

const CATEGORY_KEYS: Record<Document["category"], TranslationKey> = {
  "Identity Documents": "doc.identity",
  "Healthcare Documents": "doc.healthcare",
  "Scheme Documents": "doc.scheme",
  Reports: "doc.reports",
  Prescriptions: "doc.prescriptions",
};

interface DocumentCardProps {
  doc: Document;
}

export default function DocumentCard({ doc }: DocumentCardProps) {
  const { t } = useLanguage();
  const [viewOpen, setViewOpen] = useState(false);

  return (
    <article className="document-card">
      <span className="document-card__icon" aria-hidden="true">
        {categoryIcons[doc.category]}
      </span>
      <div className="document-card__body">
        <h3 className="document-card__title">{doc.title}</h3>
        <p className="document-card__meta">
          {t(CATEGORY_KEYS[doc.category])} · {doc.fileType} · {t("doc.added")}{" "}
          {doc.dateAdded}
        </p>
        <div className="document-card__actions">
          <button
            type="button"
            className="btn btn--small"
            aria-expanded={viewOpen}
            onClick={() => setViewOpen((open) => !open)}
          >
            {t("doc.view")}
          </button>
        </div>
        {viewOpen && (
          <div className="document-card__preview">
            <p className="demo-note">{t("doc.demoNote")}</p>
            <p>{t("doc.scanNote")}</p>
          </div>
        )}
      </div>
    </article>
  );
}