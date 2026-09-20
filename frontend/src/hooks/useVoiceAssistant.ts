import { useCallback, useEffect, useRef, useState } from "react";
import { VOICE_TIMING, type VoiceState } from "../types/domain";
import type { SpeechRecognitionErrorKind } from "../types/speech";
import { useSpeechRecognition } from "./useSpeechRecognition";

export interface VoiceAssistantControls {
  voiceState: VoiceState;
  sessionId: number;
  isSupported: boolean;
  transcript: string;
  interimTranscript: string;
  error: SpeechRecognitionErrorKind | null;
  startListening: () => void;
  stopListening: () => void;
  listen: () => void;
  reset: () => void;
}

/**
 * State machine that drives the assistant UI off the real browser
 * SpeechRecognition events instead of timers.
 *
 *   idle → listening (recognition.onstart)
 *   listening → processing (recognition session ended with a transcript)
 *   processing → response (demo reply, short delay only)
 *   any → error (recognition.onerror surfaced to the user)
 */
export function useVoiceAssistant(lang: string): VoiceAssistantControls {
  const {
    isSupported,
    isListening,
    transcript,
    interimTranscript,
    error,
    startListening: startRecognition,
    stopListening: stopRecognition,
    resetTranscript,
  } = useSpeechRecognition();

  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [sessionId, setSessionId] = useState(0);
  const langRef = useRef(lang);
  const stateRef = useRef<VoiceState>("idle");
  const timers = useRef<number[]>([]);

  langRef.current = lang;
  stateRef.current = voiceState;

  const clearTimers = useCallback(() => {
    timers.current.forEach((id) => window.clearTimeout(id));
    timers.current = [];
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  // Listening state is driven by the real recognition onstart/onend events.
  useEffect(() => {
    if (isListening) {
      clearTimers();
      setVoiceState("listening");
    }
  }, [isListening, clearTimers]);

  // Recognition failures surface as an error state (except "aborted", which
  // is expected when the user stops the session).
  useEffect(() => {
    if (error !== null && error !== "aborted") {
      clearTimers();
      setVoiceState("error");
    }
  }, [error, clearTimers]);

  // A recording session ended — move on to processing when we actually
  // captured words, or return to idle/error when there was nothing useful.
  useEffect(() => {
    if (isListening) {
      return;
    }
    if (stateRef.current !== "listening") {
      return;
    }
    if (transcript.trim().length === 0) {
      if (error === "no-speech") {
        setVoiceState("error");
      } else {
        setVoiceState("idle");
      }
      return;
    }
    clearTimers();
    setVoiceState("processing");
    const id = window.setTimeout(() => {
      setVoiceState("response");
    }, VOICE_TIMING.processingMs);
    timers.current.push(id);
  }, [isListening, transcript, error, clearTimers]);

  const startListening = useCallback(() => {
    setVoiceState("listening");
    setSessionId((current) => current + 1);
    startRecognition(langRef.current);
  }, [startRecognition]);

  const stopListening = useCallback(() => {
    stopRecognition();
  }, [stopRecognition]);

  const listen = useCallback(() => {
    if (stateRef.current === "listening") {
      stopRecognition();
    } else {
      startListening();
    }
  }, [startListening, stopRecognition]);

  const reset = useCallback(() => {
    clearTimers();
    stopRecognition();
    resetTranscript();
    setVoiceState("idle");
  }, [clearTimers, stopRecognition, resetTranscript]);

  return {
    voiceState,
    sessionId,
    isSupported,
    transcript,
    interimTranscript,
    error,
    startListening,
    stopListening,
    listen,
    reset,
  };
}