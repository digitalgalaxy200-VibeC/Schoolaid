"use client";

import { LOCALES } from "@/lib/i18n/dictionary";
import { useLanguage } from "./LanguageProvider";

const LABELS: Record<string, string> = { en: "English", fr: "Français" };

export function LanguageSwitcher({ className = "" }: { className?: string }) {
  const { locale, setLocale } = useLanguage();

  return (
    <div
      role="group"
      aria-label="Language"
      className={`inline-flex items-center rounded-full border border-border bg-surface p-0.5 ${className}`}
    >
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => setLocale(l)}
          aria-pressed={locale === l}
          aria-label={LABELS[l]}
          lang={l}
          className={`px-3 py-1.5 rounded-full font-mono text-caption font-semibold uppercase tracking-wide transition-colors ${
            locale === l
              ? "bg-primary text-white"
              : "text-text-secondary hover:text-primary"
          }`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
