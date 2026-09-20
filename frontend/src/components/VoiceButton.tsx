import type { VoiceState } from "../types/domain";
import { useLanguage } from "../context/LanguageContext";

interface VoiceButtonProps {
  state: VoiceState;
  onPress: () => void;
  label?: string;
  size?: "large" | "small";
  disabled?: boolean;
}

export default function VoiceButton({
  state,
  onPress,
  label,
  size = "large",
  disabled = false,
}: VoiceButtonProps) {
  const { t } = useLanguage();

  const stateClass =
    state === "listening"
      ? " voice-button--listening"
      : state === "processing"
        ? " voice-button--processing"
        : state === "error"
          ? " voice-button--error"
          : "";

  const ariaLabel =
    state === "listening"
      ? t("voice.listeningAria")
      : state === "processing"
        ? t("voice.understandingAria")
        : label ?? t("voice.talkAria");

  return (
    <button
      type="button"
      className={`voice-button voice-button--${size}${stateClass}`}
      aria-label={ariaLabel}
      onClick={onPress}
      disabled={disabled}
    >
      <span className="voice-button__rings" aria-hidden="true" />
      <span className="voice-button__mic" aria-hidden="true">
        🎙️
      </span>
    </button>
  );
}