import { useState } from "react";
import { useVoiceAssistant } from "../hooks/useVoiceAssistant";
import { useLanguage } from "../context/LanguageContext";
import { useSimpleMode } from "../context/SimpleModeContext";
import { getSpeechLocale } from "../data/voiceLocales";
import { recognitionErrorKey } from "../voice/errors";
import VoiceButton from "./VoiceButton";
import type { TranslationKey } from "../data/translations";

interface VoiceAssistantCardProps {
  compact?: boolean;
}

const ASSISTANT_REPLY_KEYS: TranslationKey[] = [
  "assistant.reply.help",
  "assistant.reply.guide",
  "assistant.reply.understand",
];

export default function VoiceAssistantCard({ compact = false }: VoiceAssistantCardProps) {
  const { t, language } = useLanguage();
  const { tx } = useSimpleMode();
  const locale = getSpeechLocale(language.code);
  const {
    voiceState,
    isSupported,
    transcript,
    interimTranscript,
    error,
    listen,
    reset,
  } = useVoiceAssistant(locale);
  const [replyIndex, setReplyIndex] = useState(0);

  const title = t("assistant.heading");
  const tagline = tx("voice.tagline", "voice.tagline.simple");

  const handlePress = () => {
    listen();
  };

  const statusText =
    !isSupported
      ? ""
      : voiceState === "listening"
        ? t("voice.listening")
        : voiceState === "processing"
          ? t("voice.processing")
          : voiceState === "response"
            ? transcript.trim().length > 0
              ? t("voice.understood")
              : tx("voice.tapToSpeak", "voice.simple")
            : voiceState === "error"
              ? t(recognitionErrorKey(error ?? "unknown"))
              : tx("voice.tapToSpeak", "voice.simple");

  const replyText = t(
    ASSISTANT_REPLY_KEYS[replyIndex % ASSISTANT_REPLY_KEYS.length],
  );

  return (
    <section
      className={`voice-card${compact ? " voice-card--compact" : ""}`}
      aria-label={title}
    >
      <div className="voice-card__text">
        <h2>{title}</h2>
        <p>{tagline}</p>
      </div>

      <VoiceButton
        state={voiceState}
        onPress={handlePress}
        size={compact ? "small" : "large"}
        label={t("voice.tapToSpeak")}
        disabled={!isSupported}
      />

      {!isSupported && (
        <p className="voice-card__error" role="alert">
          {t("voice.notSupported")}
        </p>
      )}

      <p className="voice-card__status" aria-live="polite">
        {statusText}
      </p>

      {voiceState === "listening" && interimTranscript && (
        <p className="voice-card__transcript" aria-live="polite">
          “{interimTranscript}”
        </p>
      )}

      {voiceState === "response" && transcript.trim().length > 0 && (
        <div className="voice-card__response">
          <span aria-hidden="true">🏥</span>
          <p>{replyText}</p>
          <button
            type="button"
            className="btn btn--tiny"
            onClick={() => {
              setReplyIndex((i) => i + 1);
              reset();
            }}
          >
            {t("voice.tryAgain")}
          </button>
        </div>
      )}

      {voiceState === "error" && error && (
        <p className="voice-card__error" role="alert">
          {t(recognitionErrorKey(error))}
        </p>
      )}

      {voiceState === "error" && !error && (
        <p className="voice-card__error" role="alert">
          {t("voice.unrecognized")}
        </p>
      )}

      <p className="voice-card__hint">{t("voice.permissionHint")}</p>
    </section>
  );
}