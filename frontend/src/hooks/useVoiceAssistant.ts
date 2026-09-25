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

  /*
   * The UI state is driven purely off the real recognition events so the
   * machine can never leave the UI in a state the browser does not back up.
   *
   *   idle → listening (recognition.onstart)
   *   listening → processing (session ended with a transcript)
   *   processing → response (demo delay only)
   *   any → error (recognition.onerror other than "aborted")
   *   listening → idle (session ended with nothing useful)
   */
  useEffect(() => {
    // Unrecoverable failures (permission denied, service blocked, network,
    // no audio, ...) always win, so the user sees why nothing was captured.
    // "aborted" is expected when the user deliberately stops and is ignored.
    if (error !== null && error !== "aborted") {
      clearTimers();
      stopRecognition();
      setVoiceState("error");
      return;
    }

    // Recognition is actually running (onstart fired).
    if (isListening) {
      clearTimers();
      setVoiceState("listening");
      return;
    }

    // A session we started has ended: finalize a real transcript into the
    // "response" state (picked up by the page and placed into the input),
    // or return to idle when there was nothing useful.
    if (stateRef.current === "listening") {
      if (transcript.trim().length === 0) {
        setVoiceState("idle");
        return;
      }
      clearTimers();
      setVoiceState("processing");
      const id = window.setTimeout(() => {
        setVoiceState("response");
      }, VOICE_TIMING.processingMs);
      timers.current.push(id);
    }
  }, [isListening, transcript, error, clearTimers, stopRecognition]);

  const startListening = useCallback(() => {
    clearTimers();
    setSessionId((current) => current + 1);
    startRecognition(langRef.current);
  }, [clearTimers, startRecognition]);

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