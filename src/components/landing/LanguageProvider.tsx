"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { dictionaries, type Dictionary, type Locale } from "@/lib/i18n/dictionary";

const COOKIE_NAME = "schoolaid-lang";

interface LanguageContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: Dictionary;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within LanguageProvider");
  return ctx;
}

export function LanguageProvider({
  initialLocale,
  children,
}: {
  initialLocale: Locale;
  children: ReactNode;
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  const setLocale = (next: Locale) => {
    setLocaleState(next);
    document.cookie = `${COOKIE_NAME}=${next}; path=/; max-age=31536000; samesite=lax`;
  };

  useEffect(() => {
    // First-ever visit (no cookie yet) — default to the visitor's browser language.
    const hasCookie = document.cookie.split("; ").some((c) => c.startsWith(`${COOKIE_NAME}=`));
    if (!hasCookie && navigator.language.toLowerCase().startsWith("fr")) {
      setLocale("fr");
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  return (
    <LanguageContext.Provider value={{ locale, setLocale, t: dictionaries[locale] }}>
      {children}
    </LanguageContext.Provider>
  );
}
