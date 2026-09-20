import { useLanguage } from "../context/LanguageContext";
import { languages } from "../data/languages";

interface LanguageSelectorProps {
  compact?: boolean;
  id?: string;
}

export default function LanguageSelector({
  compact = false,
  id = "language-selector",
}: LanguageSelectorProps) {
  const { language, setLanguage, t } = useLanguage();

  return (
    <label className={`language-selector${compact ? " language-selector--compact" : ""}`}>
      {!compact && <span className="language-selector__label">{t("languages.label")}</span>}
      <select
        id={id}
        value={language.code}
        onChange={(event) =>
          setLanguage(event.target.value as typeof language.code)
        }
        aria-label={t("languages.choose")}
      >
        {languages.map((option) => (
          <option key={option.code} value={option.code}>
            {option.nativeName}
          </option>
        ))}
      </select>
    </label>
  );
}