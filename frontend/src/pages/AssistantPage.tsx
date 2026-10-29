import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

import { useLanguage } from "../context/LanguageContext";
import { useVoiceAssistant } from "../hooks/useVoiceAssistant";
import { useSpeechSynthesis } from "../hooks/useSpeechSynthesis";
import { getSpeechLocale } from "../data/voiceLocales";
import { recognitionErrorKey, synthesisErrorKey } from "../voice/errors";

import VoiceButton from "../components/VoiceButton";
import LanguageSelector from "../components/LanguageSelector";
import ChatMessage from "../components/ChatMessage";
import Disclaimer from "../components/Disclaimer";

import { syntheticHospitals } from "../data/hospitals";
import {
  matchHospitalNeeds,
  formatMatchReply,
} from "../data/hospitalMatching";
import type { HospitalMatchResult } from "../data/hospitalMatching";

import type { AssistantMessage } from "../types/domain";
import { queryLiveAssistant } from "../api/notifications";

let messageCounter = 0;

/*
 * Quick-start examples. Picking one starts a full triage flow.
 */
const QUICK_START_CHIPS = [
  "What is my appointment status?",
  "What is my queue token and position?",
  "Show my notifications",
  "I have a fever and cold",
  "I have chest pain",
  "I need a routine checkup",
];

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
 * Handle a user message using the synthetic hospital matcher.
 *
 * IMPORTANT:
 * This is NOT diagnosis. It only maps symptoms to a basic urgency
 * level and suggests relevant hospital facilities from the
 * synthetic demo dataset.
 */
export default function AssistantPage() {
  const { t, format, language } = useLanguage();

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
    syntheticHospitals.slice(0, 3),
  );

  const [triage, setTriage] = useState<HospitalMatchResult | null>(null);

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

  const previousLanguageCodeRef = useRef(language.code);

  useEffect(() => {
    if (previousLanguageCodeRef.current === language.code) {
      return;
    }
    previousLanguageCodeRef.current = language.code;
    speech.stop();
  }, [language.code, speech]);

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
  const respondToUser = async (userText: string) => {
    appendMessage(
      makeMessage("user", userText),
    );

    const lower = userText.toLowerCase();
    const isQueueOrApptQuery =
      lower.includes("appointment") ||
      lower.includes("queue") ||
      lower.includes("token") ||
      lower.includes("notification") ||
      lower.includes("wait") ||
      lower.includes("position") ||
      lower.includes("turn");

    if (isQueueOrApptQuery) {
      try {
        const liveResponse = await queryLiveAssistant({ query: userText });
        if (liveResponse && liveResponse.answer) {
          appendMessage(makeMessage("assistant", liveResponse.answer));
          return;
        }
      } catch {
        // Fall back to triage matcher
      }
    }

    const result = matchHospitalNeeds(userText);

    setMatchedFacilities(result.matchedHospitals);
    setTriage(result);

    appendMessage(
      makeMessage(
        "assistant",
        formatMatchReply(result, format),
      ),
    );
  };

  /*
   * Start a flow from a quick-start chip.
   */
  const handleQuickStart = (text: string) => {
    respondToUser(text);

    setDraft("");
  };

  /*
   * Put a finished voice session's transcript into the input box so the user
   * can review/edit it and press Send. The voice session is NOT auto-submitted.
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

      const transcript = voice.transcript.trim();

      setDraft((current) => {
        const trimmed = current.trim();
        if (trimmed.includes(transcript)) {
          return current;
        }
        return trimmed
          ? `${trimmed} ${transcript}`
          : transcript;
      });
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

      {/* VOICE INPUT */}
      <section
        className="assistant__voice"
        aria-label={t("home.speakVoice")}
      >
        {voice.isSupported ? (
          <>
            <div className="assistant__voice-control">
              <VoiceButton
                state={voice.voiceState}
                onPress={handleMic}
                label={t("voice.tapToSpeak")}
                disabled={!voice.isSupported}
              />

              <div
                className="assistant__voice-feedback"
                aria-live="polite"
              >
                <p className="assistant__mic-label">
                  {voice.voiceState === "listening"
                    ? `🔴 ${t("voice.listening")}`
                    : voice.voiceState === "processing"
                      ? `⏳ ${t("voice.processing")}`
                      : `🎙️ ${t("home.speakVoice")}`}
                </p>

                <p className="assistant__permission-hint">
                  {voice.voiceState === "listening" &&
                  voice.interimTranscript
                    ? `“${voice.interimTranscript}”`
                    : t("voice.permissionHint")}
                </p>
              </div>
            </div>

            {voice.voiceState === "error" &&
              voice.error && (
                <p
                  className="voice-error"
                  role="alert"
                >
                  ⚠️{" "}
                  {t(
                    recognitionErrorKey(
                      voice.error,
                    ),
                  )}
                </p>
              )}
          </>
        ) : (
          <div className="assistant__voice-control">
            <p className="voice-error" role="alert">
              ⚠️ {t("voice.notSupported")}
            </p>
          </div>
        )}
      </section>

      {/* QUICK-START */}
      <section
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "8px",
          alignItems: "center",
        }}
      >
        <span
          style={{
            fontSize: "13px",
            color: "#64748b",
          }}
        >
          Try:
        </span>

        {QUICK_START_CHIPS.map((chip) => (
          <button
            key={chip}
            type="button"
            onClick={() =>
              handleQuickStart(chip)
            }
            style={{
              padding: "7px 12px",
              borderRadius: "999px",
              border: "1px solid #cbd5e1",
              background: "#fff",
              fontSize: "13px",
              cursor: "pointer",
            }}
          >
            {chip}
          </button>
        ))}

        <span
          style={{
            fontSize: "12px",
            color: "#94a3b8",
            marginLeft: "auto",
          }}
        >
          Demo triage — not a diagnosis
        </span>
      </section>

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

        <div ref={messagesEndRef} />
      </section>

      {/* TRIAGE PANEL */}
      {triage && (
        <section
          style={{
            marginTop: "30px",
            padding: "18px 20px",
            border: "1px solid #e2e8f0",
            borderRadius: "14px",
            background: "#fff",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              flexWrap: "wrap",
            }}
          >
            <span
              style={{
                fontWeight: 700,
                marginRight: "2px",
              }}
            >
              Assistant triage
            </span>

            <span
              style={{
                padding: "4px 10px",
                borderRadius: "999px",
                fontSize: "12px",
                fontWeight: 700,
                color:
                  triage.urgency === "HIGH"
                    ? "#991b1b"
                    : triage.urgency === "MODERATE"
                      ? "#854d0e"
                      : "#166534",
                background:
                  triage.urgency === "HIGH"
                    ? "#fee2e2"
                    : triage.urgency === "MODERATE"
                      ? "#fef3c7"
                      : "#dcfce7",
              }}
            >
              Urgency: {triage.urgency}
            </span>

            <span
              style={{
                fontSize: "13px",
                color: "#475569",
              }}
            >
              · {triage.matchedHospitals.length} matching facilities · department:
            </span>

            {triage.suggestedDepartments.map(
              (department) => (
                <span
                  key={department}
                  style={{
                    padding: "4px 10px",
                    borderRadius: "999px",
                    background: "#eef2ff",
                    color: "#3730a3",
                    fontSize: "12px",
                    fontWeight: 600,
                  }}
                >
                  {department}
                </span>
              ),
            )}
          </div>

          <p
            style={{
              margin: "10px 0 0",
              fontSize: "12px",
              color: "#94a3b8",
            }}
          >
            Urgency is a basic keyword heuristics for the demo. It is not a
            medical assessment — {triage.urgency === "HIGH" ? "seek emergency care immediately if needed." : "see a healthcare professional for a proper assessment."}
          </p>
        </section>
      )}

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
                to={`/hospitals/${facility.id}`}
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

                  {/* EMERGENCY + BEDS */}
                  <p
                    style={{
                      margin: "0 0 12px",
                      fontSize: "13px",
                      color: "#17332a",
                    }}
                  >
                    🚨{" "}
                    {facility.emergency_available
                      ? "Emergency available"
                      : "No emergency unit"}{" "}
                    · 🛏️{" "}
                    {facility.available_beds}{" "}
                    beds available
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
                    View hospital details
                    →
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