import { useSimpleMode } from "../context/SimpleModeContext";
import { useLanguage } from "../context/LanguageContext";

export default function SimpleModeToggle() {
  const { simpleMode, toggleSimpleMode } = useSimpleMode();
  const { t } = useLanguage();

  return (
    <button
      type="button"
      role="switch"
      aria-checked={simpleMode}
      className="simple-mode-toggle"
      onClick={toggleSimpleMode}
    >
      <span className="simple-mode-toggle__track" aria-hidden="true">
        <span className="simple-mode-toggle__thumb" />
      </span>
      <span className="simple-mode-toggle__label">
        {simpleMode ? t("simpleMode.on") : t("simpleMode.off")}
      </span>
    </button>
  );
}