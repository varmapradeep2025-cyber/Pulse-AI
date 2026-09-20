import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useLanguage } from "./LanguageContext";
import type { TranslationKey } from "../data/translations";

interface SimpleModeContextValue {
  simpleMode: boolean;
  toggleSimpleMode: () => void;
  tx: (normalKey: TranslationKey, simpleKey: TranslationKey) => string;
}

const SimpleModeContext = createContext<SimpleModeContextValue | null>(null);

export function SimpleModeProvider({ children }: { children: ReactNode }) {
  const [simpleMode, setSimpleMode] = useState(false);
  const { t } = useLanguage();

  useEffect(() => {
    document.documentElement.classList.toggle("simple-mode", simpleMode);
    return () => document.documentElement.classList.remove("simple-mode");
  }, [simpleMode]);

  const value = useMemo<SimpleModeContextValue>(() => {
    const tx = (normalKey: TranslationKey, simpleKey: TranslationKey) =>
      simpleMode ? t(simpleKey) : t(normalKey);
    return {
      simpleMode,
      toggleSimpleMode: () => setSimpleMode((current) => !current),
      tx,
    };
  }, [simpleMode, t]);

  return (
    <SimpleModeContext.Provider value={value}>
      {children}
    </SimpleModeContext.Provider>
  );
}

export function useSimpleMode(): SimpleModeContextValue {
  const ctx = useContext(SimpleModeContext);
  if (!ctx) {
    throw new Error("useSimpleMode must be used within a SimpleModeProvider");
  }
  return ctx;
}