import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useLanguage } from "../context/LanguageContext";
import { useSimpleMode } from "../context/SimpleModeContext";
import { useVoiceAssistant } from "../hooks/useVoiceAssistant";
import { useSpeechSynthesis } from "../hooks/useSpeechSynthesis";
import { getSpeechLocale } from "../data/voiceLocales";
import { recognitionErrorKey, synthesisErrorKey } from "../voice/errors";
import VoiceButton from "../components/VoiceButton";
import LanguageSelector from "../components/LanguageSelector";
import ChatMessage from "../components/ChatMessage";
import Disclaimer from "../components/Disclaimer";
import type { AssistantMessage } from "../types/domain";

let messageCounter = 0;

function makeMessage(
  role: AssistantMessage["role"],
  text: string,
  source: AssistantMessage["source"] = "text",
): AssistantMessage {
  messageCounter += 1;
  return {
    id: `msg-${messageCounter}`,
    role,
    text,
    source,
    timestamp: new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    }),
  };
}

export default function AssistantPage() {
  const { t, language } = useLanguage();
  const { tx } = useSimpleMode();
  const locale = getSpeechLocale(language.code);
  const voice = useVoiceAssistant(locale);
  const speech = useSpeechSynthesis();
  const [messages, setMessages] = useState<AssistantMessage[]>(() => [
    makeMessage("assistant", t("assistant.intro.greeting")),
  ]);
  const [draft, setDraft] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const handledVoiceSessionRef = useRef(0);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, voice.voiceState, voice.interimTranscript]);

  const appendMessage = (message: AssistantMessage) => {
    setMessages((current) => [...current, message]);
  };

  const respondToUser = (userText: string) => {
    appendMessage(makeMessage("user", userText));
    appendMessage(makeMessage("assistant", t("assistant.reply.help")));
  };

  // Real recognized speech becomes a user message, followed by a demo reply.
  useEffect(() => {
    if (
      voice.voiceState === "response" &&
      voice.sessionId !== handledVoiceSessionRef.current &&
      voice.transcript.trim().length > 0
    ) {
      handledVoiceSessionRef.current = voice.sessionId;
      appendMessage(makeMessage("user", voice.transcript, "voice"));
      appendMessage(makeMessage("assistant", t("assistant.reply.help")));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voice.voiceState, voice.sessionId, voice.transcript]);

  const handleMic = () => {
    voice.listen();
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    if (text.length === 0) {
      return;
    }
    respondToUser(text);
    setDraft("");
  };

  const lastAssistantText = useMemo(() => {
    let last = "";
    for (const message of messages) {
      if (message.role === "assistant") {
        last = message.text;
      }
    }
    return last;
  }, [messages]);

  const toggleSpeech = () => {
    if (speech.isSpeaking) {
      speech.stop();
      return;
    }
    if (lastAssistantText) {
      speech.speak(lastAssistantText, locale);
    }
  };

  const heading = t("assistant.heading");
  const speakButtonLabel = speech.isSpeaking
    ? `⏹ ${t("voice.stop")}`
    : `🔊 ${t("voice.listen")}`;

  return (
    <div className="container page assistant">
      <header className="page__header page__header--split">
        <div>
          <h1>{heading}</h1>
          <p>{t("assistant.speakHint")}</p>
        </div>
        <div className="assistant__tools">
          <LanguageSelector id="assistant-language" />
          <button
            type="button"
            className="btn btn--secondary"
            onClick={toggleSpeech}
            aria-pressed={speech.isSpeaking}
          >
            {speakButtonLabel}
          </button>
        </div>
      </header>

      <section className="chat" aria-label="Conversation">
        {messages.map((message) => (
          <ChatMessage key={message.id} message={message} />
        ))}

        {voice.voiceState === "listening" && (
          <p className="chat__status" aria-live="polite">
            {t("voice.listening")}
          </p>
        )}
        {voice.voiceState === "processing" && (
          <p className="chat__status" aria-live="polite">
            {t("voice.processing")}
          </p>
        )}
        {voice.voiceState === "listening" && voice.interimTranscript && (
          <p className="chat__transcript" aria-live="polite">
            “{voice.interimTranscript}”
          </p>
        )}

        <div ref={messagesEndRef} />
      </section>

      {speech.isSpeaking && (
        <p className="demo-note" role="status">
          {t("assistant.demoNote")}
        </p>
      )}

      {speech.error && (
        <p className="voice-error" role="alert">
          {t(synthesisErrorKey(speech.error))}
        </p>
      )}

      {voice.voiceState === "error" && voice.error && (
        <p className="voice-error" role="alert">
          {t(recognitionErrorKey(voice.error))}
        </p>
      )}

      <div className="assistant__mic-area">
        <VoiceButton
          state={voice.voiceState}
          onPress={handleMic}
          label={t("voice.tapToSpeak")}
          disabled={!voice.isSupported}
        />
        <p className="assistant__mic-label">
          {tx("voice.tapToSpeak", "voice.simple")}
        </p>
        <p className="assistant__permission-hint">{t("voice.permissionHint")}</p>
      </div>

      <form className="chat-form" onSubmit={handleSubmit}>
        <label className="sr-only" htmlFor="chat-input">
          {t("assistant.typingLabel")}
        </label>
        <input
          id="chat-input"
          type="text"
          placeholder={t("assistant.inputPlaceholder")}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        <button type="submit" className="btn btn--primary">
          {t("assistant.send")}
        </button>
      </form>

      <Disclaimer />
    </div>
  );
}