import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { defaultLanguageCode, languages } from "../data/languages";
import { translations, type TranslationKey } from "../data/translations";
import type { LanguageOption } from "../types/domain";

interface LanguageContextValue {
  language: LanguageOption;
  setLanguage: (code: LanguageOption["code"]) => void;
  t: (key: TranslationKey) => string;
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

    return { language, setLanguage, t };
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