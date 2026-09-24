import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

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

import { sampleFacilities } from "../data/facilities";

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

/*
 * Simple Phase 1 symptom → healthcare-service matching.
 *
 * IMPORTANT:
 * This is NOT diagnosis.
 * It only helps the user discover relevant healthcare facilities
 * based on keywords in their message.
 */
function getMatchedFacilities(userText: string) {
  const text = userText.toLowerCase();

  let preferredServices: string[] = [];

  if (
    text.includes("fever") ||
    text.includes("cold") ||
    text.includes("cough") ||
    text.includes("weakness") ||
    text.includes("headache")
  ) {
    preferredServices = ["OPD"];
  }

  if (
    text.includes("emergency") ||
    text.includes("accident") ||
    text.includes("injury") ||
    text.includes("bleeding") ||
    text.includes("breathing")
  ) {
    preferredServices = ["Emergency"];
  }

  if (
    text.includes("test") ||
    text.includes("diagnostic") ||
    text.includes("blood test") ||
    text.includes("x-ray")
  ) {
    preferredServices = ["Diagnostics"];
  }

  if (
    text.includes("pregnancy") ||
    text.includes("pregnant") ||
    text.includes("maternal")
  ) {
    preferredServices = ["Maternal care"];
  }

  if (
    text.includes("medicine") ||
    text.includes("pharmacy")
  ) {
    preferredServices = ["Pharmacy"];
  }

  // If no specific keyword is detected,
  // show general healthcare facilities.
  if (preferredServices.length === 0) {
    return sampleFacilities.slice(0, 3);
  }

  const matched = sampleFacilities.filter((facility) =>
    facility.services.some((service) =>
      preferredServices.includes(service),
    ),
  );

  // Fallback if no exact service match exists.
  return matched.length > 0
    ? matched.slice(0, 5)
    : sampleFacilities.slice(0, 3);
}

export default function AssistantPage() {
  const { t, language } = useLanguage();
  const { tx } = useSimpleMode();

  const locale = getSpeechLocale(language.code);

  const voice = useVoiceAssistant(locale);
  const speech = useSpeechSynthesis();

  const [messages, setMessages] = useState<AssistantMessage[]>(() => [
    makeMessage(
      "assistant",
      t("assistant.intro.greeting"),
    ),
  ]);

  const [draft, setDraft] = useState("");

  const [matchedFacilities, setMatchedFacilities] = useState(
    sampleFacilities.slice(0, 3),
  );

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const handledVoiceSessionRef = useRef(0);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({
      behavior: "smooth",
    });
  };

  useEffect(() => {
    scrollToBottom();
  }, [
    messages,
    voice.voiceState,
    voice.interimTranscript,
  ]);

  const appendMessage = (
    message: AssistantMessage,
  ) => {
    setMessages((current) => [
      ...current,
      message,
    ]);
  };

  /*
   * Handle a user message.
   */
  const respondToUser = (userText: string) => {
    appendMessage(
      makeMessage("user", userText),
    );

    const facilities = getMatchedFacilities(
      userText,
    );

    setMatchedFacilities(facilities);

    appendMessage(
      makeMessage(
        "assistant",
        "Based on the information you provided, here are healthcare facilities that may be relevant. This is not a medical diagnosis or a medicine prescription.",
      ),
    );
  };

  /*
   * Handle recognized voice input.
   */
  useEffect(() => {
    if (
      voice.voiceState === "response" &&
      voice.sessionId !==
        handledVoiceSessionRef.current &&
      voice.transcript.trim().length > 0
    ) {
      handledVoiceSessionRef.current =
        voice.sessionId;

      const transcript =
        voice.transcript.trim();

      appendMessage(
        makeMessage(
          "user",
          transcript,
          "voice",
        ),
      );

      const facilities =
        getMatchedFacilities(transcript);

      setMatchedFacilities(facilities);

      appendMessage(
        makeMessage(
          "assistant",
          "Based on your message, I found some healthcare facilities that may be relevant. Please consult a qualified healthcare professional for medical advice.",
        ),
      );
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    voice.voiceState,
    voice.sessionId,
    voice.transcript,
  ]);

  const handleMic = () => {
    voice.listen();
  };

  const handleSubmit = (
    event: FormEvent,
  ) => {
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
      speech.speak(
        lastAssistantText,
        locale,
      );
    }
  };

  const heading = t("assistant.heading");

  const speakButtonLabel = speech.isSpeaking
    ? `⏹ ${t("voice.stop")}`
    : `🔊 ${t("voice.listen")}`;

  return (
    <div className="container page assistant">

      {/* HEADER */}
      <header className="page__header page__header--split">
        <div>
          <h1>{heading}</h1>

          <p>
            {t("assistant.speakHint")}
          </p>
        </div>

        <div className="assistant__tools">
          <LanguageSelector
            id="assistant-language"
          />

          <button
            type="button"
            className="btn btn--secondary"
            onClick={toggleSpeech}
            aria-pressed={
              speech.isSpeaking
            }
          >
            {speakButtonLabel}
          </button>
        </div>
      </header>

      {/* CHAT */}
      <section
        className="chat"
        aria-label="Conversation"
      >
        {messages.map((message) => (
          <ChatMessage
            key={message.id}
            message={message}
          />
        ))}

        {voice.voiceState ===
          "listening" && (
          <p
            className="chat__status"
            aria-live="polite"
          >
            {t("voice.listening")}
          </p>
        )}

        {voice.voiceState ===
          "processing" && (
          <p
            className="chat__status"
            aria-live="polite"
          >
            {t("voice.processing")}
          </p>
        )}

        {voice.voiceState ===
          "listening" &&
          voice.interimTranscript && (
            <p
              className="chat__transcript"
              aria-live="polite"
            >
              “{voice.interimTranscript}”
            </p>
          )}

        <div ref={messagesEndRef} />
      </section>

      {/* MATCHED HOSPITALS */}
      <section
        style={{
          marginTop: "30px",
        }}
      >
        <div
          style={{
            marginBottom: "16px",
          }}
        >
          <h2
            style={{
              marginBottom: "6px",
            }}
          >
            🏥 Healthcare Facilities
          </h2>

          <p
            style={{
              margin: 0,
              color: "#666",
            }}
          >
            Facilities that may be relevant
            to your request
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(280px, 1fr))",
            gap: "18px",
          }}
        >
          {matchedFacilities.map(
            (facility) => (
              <Link
                key={facility.id}
                to="/hospitals"
                style={{
                  textDecoration: "none",
                  color: "inherit",
                }}
              >
                <article
                  style={{
                    padding: "20px",
                    border:
                      "1px solid #e2e8f0",
                    borderRadius: "14px",
                    background: "#fff",
                    boxShadow:
                      "0 4px 14px rgba(0,0,0,0.06)",
                    height: "100%",
                    boxSizing: "border-box",
                    transition:
                      "transform 0.2s ease, box-shadow 0.2s ease",
                    cursor: "pointer",
                  }}
                >
                  {/* CARD HEADER */}
                  <div
                    style={{
                      display: "flex",
                      justifyContent:
                        "space-between",
                      alignItems:
                        "flex-start",
                      gap: "12px",
                    }}
                  >
                    <div>
                      <h3
                        style={{
                          margin:
                            "0 0 8px",
                          fontSize:
                            "18px",
                        }}
                      >
                        🏥{" "}
                        {facility.name}
                      </h3>

                      <span
                        style={{
                          display:
                            "inline-block",
                          padding:
                            "4px 8px",
                          borderRadius:
                            "6px",
                          background:
                            "#eef2ff",
                          fontSize:
                            "12px",
                          fontWeight: 600,
                        }}
                      >
                        {
                          facility.facilityType
                        }
                      </span>
                    </div>

                    <span
                      style={{
                        fontSize:
                          "13px",
                        fontWeight: 600,
                        color:
                          facility.availability ===
                          "Open"
                            ? "#15803d"
                            : facility.availability ===
                                "Busy"
                              ? "#ca8a04"
                              : "#dc2626",
                      }}
                    >
                      ●{" "}
                      {
                        facility.availability
                      }
                    </span>
                  </div>

                  {/* LOCATION */}
                  <p
                    style={{
                      margin:
                        "16px 0 10px",
                      fontSize:
                        "14px",
                    }}
                  >
                    📍{" "}
                    {facility.location}
                  </p>

                  {/* SERVICES */}
                  <div
                    style={{
                      display:
                        "flex",
                      flexWrap:
                        "wrap",
                      gap: "6px",
                    }}
                  >
                    {facility.services.map(
                      (service) => (
                        <span
                          key={service}
                          style={{
                            padding:
                              "5px 8px",
                            borderRadius:
                              "6px",
                            background:
                              "#f1f5f9",
                            fontSize:
                              "12px",
                          }}
                        >
                          {service}
                        </span>
                      ),
                    )}
                  </div>

                  {/* HOURS */}
                  <p
                    style={{
                      margin:
                        "14px 0",
                      fontSize:
                        "13px",
                      color:
                        "#64748b",
                    }}
                  >
                    🕐{" "}
                    {
                      facility.openingHours
                    }
                  </p>

                  {/* ACTION */}
                  <div
                    style={{
                      marginTop:
                        "16px",
                      paddingTop:
                        "12px",
                      borderTop:
                        "1px solid #eee",
                      fontWeight: 600,
                      fontSize:
                        "14px",
                    }}
                  >
                    View healthcare
                    facilities →
                  </div>
                </article>
              </Link>
            ),
          )}
        </div>
      </section>

      {/* SPEECH STATUS */}
      {speech.isSpeaking && (
        <p
          className="demo-note"
          role="status"
        >
          {t("assistant.demoNote")}
        </p>
      )}

      {speech.error && (
        <p
          className="voice-error"
          role="alert"
        >
          {t(
            synthesisErrorKey(
              speech.error,
            ),
          )}
        </p>
      )}

      {voice.voiceState === "error" &&
        voice.error && (
          <p
            className="voice-error"
            role="alert"
          >
            {t(
              recognitionErrorKey(
                voice.error,
              ),
            )}
          </p>
        )}

      {/* MICROPHONE */}
      <div className="assistant__mic-area">
        <VoiceButton
          state={voice.voiceState}
          onPress={handleMic}
          label={t(
            "voice.tapToSpeak",
          )}
          disabled={!voice.isSupported}
        />

        <p className="assistant__mic-label">
          {tx(
            "voice.tapToSpeak",
            "voice.simple",
          )}
        </p>

        <p className="assistant__permission-hint">
          {t(
            "voice.permissionHint",
          )}
        </p>
      </div>

      {/* TEXT INPUT */}
      <form
        className="chat-form"
        onSubmit={handleSubmit}
      >
        <label
          className="sr-only"
          htmlFor="chat-input"
        >
          {t(
            "assistant.typingLabel",
          )}
        </label>

        <input
          id="chat-input"
          type="text"
          placeholder={t(
            "assistant.inputPlaceholder",
          )}
          value={draft}
          onChange={(event) =>
            setDraft(
              event.target.value,
            )
          }
        />

        <button
          type="submit"
          className="btn btn--primary"
        >
          {t("assistant.send")}
        </button>
      </form>

      <Disclaimer />
    </div>
  );
}