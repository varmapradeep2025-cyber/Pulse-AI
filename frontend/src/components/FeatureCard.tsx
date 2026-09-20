import { useLanguage } from "../context/LanguageContext";

interface FeatureCardProps {
  icon: string;
  title: string;
  description: string;
  highlight?: boolean;
}

export default function FeatureCard({
  icon,
  title,
  description,
  highlight = false,
}: FeatureCardProps) {
  const { t } = useLanguage();

  return (
    <article className={`feature-card${highlight ? " feature-card--highlight" : ""}`}>
      <span className="feature-card__icon" aria-hidden="true">
        {icon}
      </span>
      <h3 className="feature-card__title">{title}</h3>
      <p className="feature-card__description">{description}</p>
      {highlight && (
        <span className="badge badge--info">{t("home.feature.lowLiteracy.badge")}</span>
      )}
    </article>
  );
}