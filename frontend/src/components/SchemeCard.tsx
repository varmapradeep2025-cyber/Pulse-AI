import { useState } from "react";
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
        <span className="badge badge--demo">{t("scheme.demo")}</span>
      </div>

      <p className="scheme-card__who">
        <span aria-hidden="true">👤</span> {scheme.whoIsFor}
      </p>

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
            {scheme.documents.map((doc) => (
              <li key={doc}>{doc}</li>
            ))}
          </ul>
          <h4>{t("scheme.steps")}</h4>
          <ol className="scheme-card__list scheme-card__list--steps">
            {scheme.applicationSteps.map((step, index) => (
              <li key={step}>
                {t("scheme.step")} {index + 1}: {step}
              </li>
            ))}
          </ol>
          <p className="demo-note">{t("scheme.demoNote")}</p>
        </div>
      )}
    </article>
  );
}