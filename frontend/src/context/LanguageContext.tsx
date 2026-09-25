import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { defaultLanguageCode, languages } from "../data/languages";
import { translations, type TranslationKey } from "../data/translations";
import type { LanguageOption } from "../types/domain";

interface LanguageContextValue {
  language: LanguageOption;
  setLanguage: (code: LanguageOption["code"]) => void;
  t: (key: TranslationKey) => string;
  format: (
    key: TranslationKey,
    params?: Record<string, string | number>,
  ) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

const STORAGE_KEY = "pulse-ai-language";

function readStoredLanguage(): LanguageOption["code"] {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored && languages.some((option) => option.code === stored)) {
      return stored as LanguageOption["code"];
    }
  } catch {
    // localStorage is not available; fall back to the default language.
  }
  return defaultLanguageCode;
}

/*
 * Substitute {placeholders} in a translated template. Factual values
 * (hospital names, numbers, risk levels, etc.) are injected verbatim and
 * never translated by the template itself.
 */
function interpolate(
  template: string,
  params?: Record<string, string | number>,
): string {
  if (!params) {
    return template;
  }
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [code, setCode] = useState<LanguageOption["code"]>(readStoredLanguage);

  const setLanguage = (nextCode: LanguageOption["code"]) => {
    setCode(nextCode);
    try {
      window.localStorage.setItem(STORAGE_KEY, nextCode);
    } catch {
      // Ignore persistence failures; the in-memory language still applies.
    }
  };

  const value = useMemo<LanguageContextValue>(() => {
    const language =
      languages.find((option) => option.code === code) ?? languages[0];
    const t = (key: TranslationKey) =>
      translations[language.code]?.[key] ??
      translations["en"]?.[key] ??
      key;
    const format = (
      key: TranslationKey,
      params?: Record<string, string | number>,
    ) => interpolate(t(key), params);

    return { language, setLanguage, t, format };
  }, [code]);

  return (
    <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return ctx;
}