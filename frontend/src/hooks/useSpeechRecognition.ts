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

function toErrorKind(code: string): SpeechRecognitionErrorKind {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return "not-allowed";
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
 * Thin wrapper around the browser SpeechRecognition / webkitSpeechRecognition
 * API. Transient (interim) results are surfaced separately from the final
 * transcript so the UI can show live "typing" feedback while the user speaks.
 */
export function useSpeechRecognition(): SpeechRecognitionControls {
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const finalRef = useRef("");
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [error, setError] = useState<SpeechRecognitionErrorKind | null>(null);

  const isSupported = useMemo(
    () => getRecognitionConstructor() !== undefined,
    [],
  );

  const ensureRecognition = useCallback((): SpeechRecognition | null => {
    if (recognitionRef.current) {
      return recognitionRef.current;
    }
    const Constructor = getRecognitionConstructor();
    if (!Constructor) {
      return null;
    }

    const recognition = new Constructor();
    recognition.continuous = true;
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
      setError(toErrorKind(event.error));
    };

    recognition.onend = () => {
      setIsListening(false);
      setInterimTranscript("");
    };

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognitionRef.current = recognition;
    return recognition;
  }, []);

  const startListening = useCallback(
    (lang?: string) => {
      const recognition = ensureRecognition();
      if (!recognition) {
        setError("not-supported");
        return;
      }
      finalRef.current = "";
      setTranscript("");
      setInterimTranscript("");
      setError(null);
      if (lang) {
        recognition.lang = lang;
      }
      try {
        recognition.start();
      } catch {
        setError("unknown");
      }
    },
    [ensureRecognition],
  );

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  const resetTranscript = useCallback(() => {
    finalRef.current = "";
    setTranscript("");
    setInterimTranscript("");
    setError(null);
  }, []);

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
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