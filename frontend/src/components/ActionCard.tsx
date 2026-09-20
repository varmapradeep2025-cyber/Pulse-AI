import { Link } from "react-router-dom";
import { useSimpleMode } from "../context/SimpleModeContext";
import { useLanguage } from "../context/LanguageContext";
import type { TranslationKey } from "../data/translations";

interface ActionCardProps {
  icon: string;
  titleKey: TranslationKey;
  titleSimpleKey: TranslationKey;
  descriptionKey: TranslationKey;
  to?: string;
  onClick?: () => void;
  variant?: "primary" | "default";
}

export default function ActionCard({
  icon,
  titleKey,
  titleSimpleKey,
  descriptionKey,
  to,
  onClick,
  variant = "default",
}: ActionCardProps) {
  const { tx } = useSimpleMode();
  const { t } = useLanguage();
  const title = tx(titleKey, titleSimpleKey);

  const cardContent = (
    <>
      <span className="action-card__icon" aria-hidden="true">
        {icon}
      </span>
      <div>
        <h3 className="action-card__title">{title}</h3>
        <p className="action-card__description">{t(descriptionKey)}</p>
      </div>
    </>
  );

  const className = `action-card${
    variant === "primary" ? " action-card--primary" : ""
  }`;

  if (to) {
    return (
      <Link to={to} className={className}>
        {cardContent}
      </Link>
    );
  }

  return (
    <button type="button" className={className} onClick={onClick}>
      {cardContent}
    </button>
  );
}