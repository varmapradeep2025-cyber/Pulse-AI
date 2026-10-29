import { useState } from "react";
import { Link } from "react-router-dom";
import type { HealthcareScheme } from "../types/domain";
import { useLanguage } from "../context/LanguageContext";

interface SchemeCardProps {
  scheme: HealthcareScheme;
}

export default function SchemeCard({ scheme }: SchemeCardProps) {
  const { t } = useLanguage();
  const [expanded, setExpanded] = useState(false);

  return (
    <article className="scheme-card">
      <div className="scheme-card__head">
        <h3 className="scheme-card__name">{scheme.name}</h3>
      </div>

      <div className="scheme-card__chips">
        <span className="chip chip--status">{scheme.category}</span>
        <span className="chip chip--scope">
          {scheme.scope === "State" ? "State-specific" : "Central"}
        </span>
      </div>

      <p className="scheme-card__desc">
        {scheme.short_description}
      </p>

      <p className="scheme-card__who">
        <span aria-hidden="true">👤</span>{" "}
        <strong>Target:</strong>{" "}
        {scheme.target_beneficiaries.join(", ")}
      </p>

      <p className="scheme-card__benefit">
        <span aria-hidden="true">🎯</span>{" "}
        <strong>Benefit:</strong> {scheme.coverage}
      </p>

      <div className="scheme-card__actions">
        <Link
          to={`/schemes/${scheme.scheme_id}`}
          className="btn btn--primary btn--full"
        >
          View Details
        </Link>
      </div>

      <button
        type="button"
        className="btn btn--ghost btn--full"
        aria-expanded={expanded}
        onClick={() => setExpanded((open) => !open)}
      >
        {expanded ? t("scheme.hideDetails") : t("scheme.learnMore")}
      </button>

      {expanded && (
        <div className="scheme-card__details">
          <h4>{t("scheme.documents")}</h4>
          <ul className="scheme-card__list">
            {scheme.required_documents.map((doc) => (
              <li key={doc}>{doc}</li>
            ))}
          </ul>
          {scheme.required_documents.length === 0 && (
            <p className="demo-note">No documents required.</p>
          )}
          <h4>{t("scheme.steps")}</h4>
          <ol className="scheme-card__list scheme-card__list--steps">
            {scheme.applicationSteps.map((step, index) => (
              <li key={step}>
                {t("scheme.step")} {index + 1}: {step}
              </li>
            ))}
          </ol>
    
        </div>
      )}
    </article>
  );
}