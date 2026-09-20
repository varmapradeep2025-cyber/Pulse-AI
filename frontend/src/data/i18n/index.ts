import type { SupportedLanguage } from "../../types/domain";
import { en, type Dictionary, type TranslationKey } from "./en";
import { hi } from "./hi";
import { mr } from "./mr";
import { bn } from "./bn";
import { ta } from "./ta";
import { te } from "./te";
import { gu } from "./gu";
import { kn } from "./kn";
import { ml } from "./ml";
import { pa } from "./pa";

export type { TranslationKey, Dictionary };

export const translations: Record<SupportedLanguage, Dictionary> = {
  en,
  hi,
  mr,
  bn,
  ta,
  te,
  gu,
  kn,
  ml,
  pa,
};

export const SUPPORTED_LANGUAGES: SupportedLanguage[] = [
  "en",
  "hi",
  "mr",
  "bn",
  "ta",
  "te",
  "gu",
  "kn",
  "ml",
  "pa",
];

export interface MissingTranslation {
  language: SupportedLanguage;
  missing: TranslationKey[];
}

export function checkTranslations(): MissingTranslation[] {
  const allKeys = Object.keys(en) as TranslationKey[];
  const problems: MissingTranslation[] = [];

  for (const language of SUPPORTED_LANGUAGES) {
    const dict = translations[language];
    const missing = allKeys.filter((key) => {
      const value = dict[key];
      return typeof value !== "string" || value.trim().length === 0;
    });
    if (missing.length > 0) {
      problems.push({ language, missing });
    }
  }

  return problems;
}