import type { SupportedLanguage } from "../types/domain";

/**
 * Maps Pulse AI languages to the speech locale used by both
 * SpeechRecognition (`lang`) and SpeechSynthesis (`utterance.lang`).
 */
export const SPEECH_LOCALES: Record<SupportedLanguage, string> = {
  en: "en-IN",
  hi: "hi-IN",
  mr: "mr-IN",
  bn: "bn-IN",
  ta: "ta-IN",
  te: "te-IN",
  gu: "gu-IN",
  kn: "kn-IN",
  ml: "ml-IN",
  pa: "pa-IN",
};

export function getSpeechLocale(code: SupportedLanguage): string {
  return SPEECH_LOCALES[code];
}