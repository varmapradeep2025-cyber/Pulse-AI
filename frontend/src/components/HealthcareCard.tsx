import { useState } from "react";
import type { HealthcareFacility } from "../types/domain";
import { useLanguage } from "../context/LanguageContext";
import type { TranslationKey } from "../data/translations";

const AVAILABILITY_KEYS: Record<
  HealthcareFacility["availability"],
  TranslationKey
> = {
  Open: "hospital.open",
  Busy: "hospital.busy",
  "High Demand": "hospital.highDemand",
};

interface HealthcareCardProps {
  facility: HealthcareFacility;
}

export default function HealthcareCard({ facility }: HealthcareCardProps) {
  const { t } = useLanguage();
  const [detailsOpen, setDetailsOpen] = useState(false);

  return (
    <article className="facility-card">
      <div className="facility-card__head">
        <h3 className="facility-card__name">{facility.name}</h3>
        {facility.isDemo && <span className="badge badge--demo">{t("hospital.demo")}</span>}
      </div>
      <p className="facility-card__location">📍 {facility.location}</p>

      <span className={`chip chip--availability chip--${facility.availability.toLowerCase().replaceAll(" ", "-")}`}>
        {t(AVAILABILITY_KEYS[facility.availability])}
      </span>

      <p className="facility-card__hours">🕒 {facility.openingHours}</p>

      <ul className="facility-card__services" aria-label={t("hospital.service")}>
        {facility.services.map((service) => (
          <li key={service} className="chip">
            {service}
          </li>
        ))}
      </ul>

      <button
        type="button"
        className="btn btn--ghost btn--full"
        aria-expanded={detailsOpen}
        onClick={() => setDetailsOpen((open) => !open)}
      >
        {detailsOpen ? t("hospital.hideDetails") : t("hospital.viewDetails")}
      </button>

      {detailsOpen && (
        <div className="facility-card__details">
          <p>
            <strong>{t("hospital.availableServices")}:</strong>{" "}
            {facility.services.join(", ")}
          </p>
          <p>
            <strong>{t("hospital.openingHours")}:</strong> {facility.openingHours}
          </p>
          <p className="demo-note">{t("hospital.demoNote")}</p>
        </div>
      )}
    </article>
  );
}