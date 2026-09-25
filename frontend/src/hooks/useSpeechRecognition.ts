import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  SpeechRecognition,
  SpeechRecognitionErrorKind,
  SpeechRecognitionEvent,
} from "../types/speech";

export interface SpeechRecognitionControls {
  isSupported: boolean;
  isListening: boolean;
  transcript: string;
  interimTranscript: string;
  error: SpeechRecognitionErrorKind | null;
  startListening: (lang?: string) => void;
  stopListening: () => void;
  resetTranscript: () => void;
}

function getRecognitionConstructor(): (new () => SpeechRecognition) | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }
  return window.SpeechRecognition ?? window.webkitSpeechRecognition;
}

/**
 * Maps the raw browser SpeechRecognition error code to a normalized kind so
 * the UI can explain the real failure. The raw code is also logged to the
 * console so developers can always see exactly what the browser reported.
 */
function toErrorKind(code: string): SpeechRecognitionErrorKind {
  switch (code) {
    case "not-allowed":
      return "not-allowed";
    case "service-not-allowed":
      return "not-supported";
    case "audio-capture":
      return "audio-capture";
    case "network":
      return "network";
    case "no-speech":
      return "no-speech";
    case "aborted":
      return "aborted";
    case "language-not-supported":
      return "language-not-supported";
    default:
      return "unknown";
  }
}

/**
 * Best-effort preflight that checks the two user-correctable conditions
 * BEFORE the (network-bound) speech session starts:
 * 1. Microphone permission is not denied.
 * 2. At least one audio input device exists.
 *
 * Returns a normalized error kind, or null when nothing is obviously wrong.
 */
async function preflightMicrophone(): Promise<SpeechRecognitionErrorKind | null> {
  try {
    if (navigator.permissions?.query) {
      try {
        const status = await navigator.permissions.query({
          name: "microphone" as PermissionName,
        });
        if (status.state === "denied") {
          return "not-allowed";
        }
      } catch {
        // `microphone` is not a queryable permission here; fall through.
      }
    }

    if (navigator.mediaDevices?.enumerateDevices) {
      const devices = await navigator.mediaDevices.enumerateDevices();
      if (!devices.some((device) => device.kind === "audioinput")) {
        return "audio-capture";
      }
    }
  } catch {
    // Permission API / device enumeration unavailable; let SpeechRecognition
    // itself report the definitive failure.
  }

  return null;
}

/**
 * Thin wrapper around the browser SpeechRecognition / webkitSpeechRecognition
 * API. Transient (interim) results are surfaced separately from the final
 * transcript so the UI can show live "typing" feedback while the user speaks.
 *
 * Reliability notes:
 * - The Web Speech service only works in a secure context (HTTPS or
 *   localhost). `isSupported` therefore also checks `window.isSecureContext`,
 *   so on an insecure origin the UI shows the "not supported" message instead
 *   of a misleading "check your internet connection" error.
 * - `service-not-allowed` means the speech *service* is blocked in this
 *   browser, which is a different condition from a denied microphone
 *   (`not-allowed`), and is surfaced as "not supported".
 * - Chrome reports failures to reach its cloud speech service as `network`.
 *   That is a service-level refusal, not necessarily the user's own internet
 *   connection, so `network` is surfaced with a "service currently
 *   unavailable — use text input" message and the raw code is logged.
 * - No automatic retries: a failed session ends cleanly and the user can
 *   simply tap the microphone again.
 */
export function useSpeechRecognition(): SpeechRecognitionControls {
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const finalRef = useRef("");
  const sessionActiveRef = useRef(false);
  const langRef = useRef<string | undefined>(undefined);
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [error, setError] = useState<SpeechRecognitionErrorKind | null>(null);

  const isSupported = useMemo(
    () =>
      typeof window !== "undefined" &&
      getRecognitionConstructor() !== undefined &&
      window.isSecureContext !== false,
    [],
  );

  /*
   * TEMP DIAGNOSTICS — browser/API-level facts. Kept only while diagnosing
   * the Web Speech failure; safe to delete once the root cause is confirmed.
   */
  useEffect(() => {
    console.log("[Pulse AI Voice] SpeechRecognition:", typeof window.SpeechRecognition);
    console.log("[Pulse AI Voice] webkitSpeechRecognition:", typeof window.webkitSpeechRecognition);
    console.log("[Pulse AI Voice] secure context:", window.isSecureContext);
    console.log("[Pulse AI Voice] mediaDevices:", !!navigator.mediaDevices);
    console.log("[Pulse AI Voice] getUserMedia:", !!navigator.mediaDevices?.getUserMedia);
  }, []);

  /**
   * A fresh recognizer is built for every session. Disposing the previous
   * instance after each session avoids Chrome's "network" failure when an
   * errored/long-lived instance is restarted, and guarantees event handlers
   * are never duplicated or accumulated across sessions.
   */
  const createRecognition = useCallback((): SpeechRecognition | null => {
    const Constructor = getRecognitionConstructor();
    if (!Constructor) {
      return null;
    }

    const recognition = new Constructor();
    /*
     * Single-shot mode (continuous = false): the browser ends the session on
     * its own once the user finishes speaking, firing `onend`. In continuous
     * mode the session would never end and the transcript could never be
     * finalized into the input box.
     */
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (result.isFinal) {
          const chunk = result[0].transcript.trim();
          if (chunk) {
            finalRef.current = finalRef.current
              ? `${finalRef.current} ${chunk}`
              : chunk;
          }
        } else {
          interim += result[0].transcript;
        }
      }
      if (finalRef.current) {
        setTranscript(finalRef.current);
      }
      setInterimTranscript(interim);
    };

    recognition.onerror = (event) => {
      const kind = toErrorKind(event.error);

      /*
       * Always surface the raw code + message so the real failure
       * ("not-allowed", "audio-capture", "network", "no-speech", ...) is
       * never hidden behind a generic UI string. `aborted` is the expected
       * result of the user deliberately stopping, so it is logged at debug
       * level instead of being treated as an error.
       */
      if (kind === "aborted") {
        console.debug(
          "[Pulse AI Voice] Speech session stopped:",
          event.error,
          event.message ?? "",
        );
      } else {
        console.error(
          "[Pulse AI Voice] Speech recognition error:",
          event.error,
          event.message ?? "",
        );
      }

      /*
       * The session has gone away. Mark it inactive so `stopListening()`
       * becomes a cheap no-op, release the recognition instance, and surface
       * the normalized error. `abort()` also guarantees `onend` fires.
       */
      sessionActiveRef.current = false;
      setIsListening(false);
      setInterimTranscript("");
      try {
        recognition.abort();
      } catch {
        // Nothing to abort; the browser already tore the session down.
      }
      setError(kind);
    };

    recognition.onend = () => {
      sessionActiveRef.current = false;
      setIsListening(false);
      setInterimTranscript("");
    };

    recognition.onstart = () => {
      setIsListening(true);
    };

    return recognition;
  }, []);

  const startSession = useCallback(
    async (lang?: string) => {
      if (lang) {
        langRef.current = lang;
      }

      /*
       * Claim the session slot synchronously so a rapid second tap while the
       * preflight await is in flight cannot start a second recognizer.
       */
      if (sessionActiveRef.current) {
        return;
      }
      sessionActiveRef.current = true;

      const preflight = await preflightMicrophone();
      if (preflight !== null) {
        sessionActiveRef.current = false;
        setTranscript("");
        setInterimTranscript("");
        setError(preflight);
        return;
      }

      const recognition = createRecognition();
      if (!recognition) {
        sessionActiveRef.current = false;
        setError("not-supported");
        return;
      }
      recognitionRef.current = recognition;
      finalRef.current = "";
      setTranscript("");
      setInterimTranscript("");
      setError(null);
      if (langRef.current) {
        recognition.lang = langRef.current;
      }
      try {
        recognition.start();
      } catch (err) {
        sessionActiveRef.current = false;
        console.error("[Pulse AI Voice] SpeechRecognition.start() threw:", err);
        setError("unknown");
      }
    },
    [createRecognition],
  );

  const startListening = useCallback(
    (lang?: string) => {
      /*
       * Guard against rapid double clicks / double-starts: start() throws
       * an InvalidStateError when a session is already starting or running.
       */
      if (sessionActiveRef.current) {
        return;
      }
      void startSession(lang);
    },
    [startSession],
  );

  const stopListening = useCallback(() => {
    if (!sessionActiveRef.current) {
      return;
    }
    sessionActiveRef.current = false;
    /*
     * Use abort() (not stop()) so a deliberate tap-again-to-stop ends the
     * session immediately instead of waiting for the browser's silence
     * timeout. Final transcripts already collected are kept and still land
     * in the input box (the "listening → processing → response" path).
     */
    recognitionRef.current?.abort();
  }, []);

  const resetTranscript = useCallback(() => {
    finalRef.current = "";
    setTranscript("");
    setInterimTranscript("");
    setError(null);
  }, []);

  useEffect(() => {
    return () => {
      sessionActiveRef.current = false;
      recognitionRef.current?.abort();
      recognitionRef.current = null;
    };
  }, []);

  return {
    isSupported,
    isListening,
    transcript,
    interimTranscript,
    error,
    startListening,
    stopListening,
    resetTranscript,
  };
}