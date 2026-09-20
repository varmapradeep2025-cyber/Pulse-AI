import { useLanguage } from "../context/LanguageContext";

export default function Disclaimer() {
  const { t } = useLanguage();

  return (
    <p className="disclaimer" role="note">
      ⚕️ {t("disclaimer.text")}
    </p>
  );
}