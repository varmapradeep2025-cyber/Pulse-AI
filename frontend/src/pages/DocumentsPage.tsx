import { useState } from "react";
import { documentCategories, sampleDocuments } from "../data/documents";
import { useLanguage } from "../context/LanguageContext";
import DocumentCard from "../components/DocumentCard";
import EmptyState from "../components/EmptyState";
import type { DocumentCategory } from "../types/domain";
import type { TranslationKey } from "../data/translations";

const CATEGORY_KEYS: Record<DocumentCategory, TranslationKey> = {
  "Identity Documents": "doc.identity",
  "Healthcare Documents": "doc.healthcare",
  "Scheme Documents": "doc.scheme",
  Reports: "doc.reports",
  Prescriptions: "doc.prescriptions",
};

export default function DocumentsPage() {
  const { t } = useLanguage();
  const [category, setCategory] = useState<DocumentCategory | "All">("All");
  const [addOpen, setAddOpen] = useState(false);

  const documents =
    category === "All"
      ? sampleDocuments
      : sampleDocuments.filter((doc) => doc.category === category);

  const heading = t("action.documents");

  return (
    <div className="container page">
      <header className="page__header page__header--split">
        <div>
          <h1>{heading}</h1>
          <p>{t("doc.subtitle")}</p>
        </div>
        <button
          type="button"
          className="btn btn--primary"
          aria-expanded={addOpen}
          onClick={() => setAddOpen((open) => !open)}
        >
          {t("doc.add")}
        </button>
      </header>

      {addOpen && (
        <div className="add-panel">
          <h2>{t("doc.addTitle")}</h2>
          <div className="add-panel__actions">
            <button type="button" className="btn btn--secondary">
              {t("doc.upload")}
            </button>
            <button type="button" className="btn btn--secondary">
              {t("doc.takePhoto")}
            </button>
          </div>
          <p className="demo-note">{t("doc.scanNote")}</p>
        </div>
      )}

      <div className="filters" role="group" aria-label="Filter documents by category">
        {(["All", ...documentCategories] as const).map((cat) => (
          <button
            key={cat}
            type="button"
            className={`chip chip--filter${category === cat ? " chip--active" : ""}`}
            aria-pressed={category === cat}
            onClick={() => setCategory(cat as DocumentCategory | "All")}
          >
            {cat === "All" ? t("doc.all") : t(CATEGORY_KEYS[cat])}
          </button>
        ))}
      </div>

      {documents.length === 0 ? (
        <EmptyState
          icon="📁"
          title={t("doc.noDocs")}
          description={t("doc.noDocsDesc")}
        />
      ) : (
        <div className="document-list">
          {documents.map((doc) => (
            <DocumentCard key={doc.id} doc={doc} />
          ))}
        </div>
      )}
    </div>
  );
}