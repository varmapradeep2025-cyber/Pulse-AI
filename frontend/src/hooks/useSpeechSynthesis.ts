import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SpeechSynthesisErrorKind } from "../types/speech";

export interface SpeechSynthesisControls {
  isSupported: boolean;
  isSpeaking: boolean;
  error: SpeechSynthesisErrorKind | null;
  speak: (text: string, lang: string) => void;
  stop: () => void;
}

/**
 * Wrapper around the browser window.speechSynthesis API.
 * Voices load asynchronously in some browsers, so this hook subscribes to
 * `voiceschanged` and only picks a matching voice when one exists.
 */
export function useSpeechSynthesis(): SpeechSynthesisControls {
  const isSupported = useMemo(
    () => typeof window !== "undefined" && "speechSynthesis" in window,
    [],
  );
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState<SpeechSynthesisErrorKind | null>(null);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (!isSupported) {
      return;
    }
    const synth = window.speechSynthesis;
    const loadVoices = () => {
      setVoices(synth.getVoices());
    };
    loadVoices();
    synth.addEventListener("voiceschanged", loadVoices);
    return () => {
      synth.removeEventListener("voiceschanged", loadVoices);
      synth.cancel();
    };
  }, [isSupported]);

  const findMatchingVoice = useCallback(
    (locale: string): SpeechSynthesisVoice | null => {
      const target = locale.toLowerCase();
      const primaryTag = target.split("-")[0];
      return (
        voices.find((voice) => voice.lang.toLowerCase() === target) ??
        voices.find(
          (voice) =>
            voice.lang.toLowerCase().split("-")[0] === primaryTag,
        ) ??
        null
      );
    },
    [voices],
  );

  const stop = useCallback(() => {
    if (!isSupported) {
      return;
    }
    cancelledRef.current = true;
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  }, [isSupported]);

  const speak = useCallback(
    (text: string, lang: string) => {
      if (!isSupported) {
        setError("unavailable");
        setIsSpeaking(false);
        return;
      }
      const synth = window.speechSynthesis;
      cancelledRef.current = true;
      synth.cancel();

      const matchingVoice = findMatchingVoice(lang);
      const utterance = new SpeechSynthesisUtterance(text);
      if (matchingVoice) {
        utterance.voice = matchingVoice;
        utterance.lang = matchingVoice.lang;
      } else {
        utterance.lang = lang;
      }

      cancelledRef.current = false;
      utterance.onstart = () => {
        cancelledRef.current = false;
        setIsSpeaking(true);
        setError(null);
      };
      utterance.onend = () => {
        setIsSpeaking(false);
      };
      utterance.onerror = () => {
        setIsSpeaking(false);
        if (cancelledRef.current) {
          return;
        }
        setError(matchingVoice ? "synthesis" : "no-voice");
      };

      setError(null);
      try {
        synth.speak(utterance);
      } catch {
        setError("unavailable");
      }
    },
    [findMatchingVoice, isSupported],
  );

  return { isSupported, isSpeaking, error, speak, stop };
}