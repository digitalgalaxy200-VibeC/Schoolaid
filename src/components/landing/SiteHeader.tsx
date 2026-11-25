"use client";

import { useEffect, useRef, useState } from "react";
import { SchoolAidLogoMark, WhatsAppIcon, ArrowRightIcon } from "./icons";
import type { LandingLanguage } from "@/lib/landing/translations";

export function SiteHeader({
  applyHref,
  whatsappHref,
  lang = "en",
  onLanguageChange,
  labels,
}: {
  applyHref: string;
  whatsappHref: string | null;
  lang?: LandingLanguage;
  onLanguageChange?: (next: LandingLanguage) => void;
  labels?: {
    howItWorks: string;
    digitise: string;
    revenue: string;
    pricing: string;
    vision: string;
    faq: string;
    contact: string;
    login: string;
    apply: string;
  };
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    sheetRef.current?.querySelector<HTMLElement>("a,button")?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const links: [string, string][] = [
    [labels?.howItWorks || "How it works", "#how-it-works"],
    [labels?.digitise || "What we digitise", "#digitise"],
    [labels?.revenue || "Revenue", "#revenue"],
    [labels?.pricing || "Pricing", "#pricing"],
    [labels?.vision || "Vision", "#vision"],
    [labels?.faq || "FAQ", "#faq"],
    [labels?.contact || "Contact", "#contact"],
  ];

  return (
    <>
      <a href="#main" className="sa-skip">
        Skip to content
      </a>

      <header className="sticky top-0 z-50 border-b border-[#e6dfd3] bg-[#fbf8f2]/90 backdrop-blur-md transition-shadow duration-200">
        <div className="sa-container flex h-16 items-center justify-between gap-2 sm:gap-4">
          <a href="#top" className="flex items-center gap-2 transition-transform hover:scale-[1.02] shrink-0">
            <SchoolAidLogoMark className="h-7 w-auto sm:h-9" />
            <span className="sa-serif text-[19px] sm:text-[21px] font-bold tracking-tight text-[#0f1f3d]">
              SchoolAid
            </span>
          </a>

          {/* Desktop inline nav links */}
          <nav aria-label="Main Navigation" className="hidden lg:flex items-center gap-7">
            {links.map(([label, href]) => (
              <a
                key={href}
                href={href}
                className="text-[14px] font-semibold text-[#4a586e] hover:text-[#2a4b8d] transition-colors"
              >
                {label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-2 sm:gap-3">
            {/* Compact Language Switcher on mobile, full pill on sm+ */}
            {onLanguageChange && (
              <>
                <button
                  type="button"
                  onClick={() => onLanguageChange(lang === "en" ? "fr" : "en")}
                  className="sm:hidden inline-flex h-8 items-center justify-center rounded-lg border border-[#d5c9b5] bg-white px-2.5 text-[11px] font-bold text-[#0f1f3d] shadow-xs active:scale-95"
                  aria-label={lang === "en" ? "Passer en français" : "Switch to English"}
                >
                  {lang === "en" ? "FR" : "EN"}
                </button>
                <div className="hidden sm:inline-flex items-center rounded-lg border border-[#d5c9b5] bg-white p-0.5 shadow-xs">
                  <button
                    type="button"
                    onClick={() => onLanguageChange("en")}
                    className={`rounded-md px-2 py-1 text-[12px] font-bold transition-all ${
                      lang === "en"
                        ? "bg-[#2a4b8d] text-white shadow-xs"
                        : "text-[#4a586e] hover:text-[#0f1f3d]"
                    }`}
                    aria-label="Switch to English"
                  >
                    EN
                  </button>
                  <button
                    type="button"
                    onClick={() => onLanguageChange("fr")}
                    className={`rounded-md px-2 py-1 text-[12px] font-bold transition-all ${
                      lang === "fr"
                        ? "bg-[#2a4b8d] text-white shadow-xs"
                        : "text-[#4a586e] hover:text-[#0f1f3d]"
                    }`}
                    aria-label="Passer en français"
                  >
                    FR
                  </button>
                </div>
              </>
            )}

            <a
              href="/login"
              className="hidden sm:inline-flex text-[14px] font-semibold text-[#2a4b8d] hover:text-[#0f1f3d] transition-colors px-1.5"
            >
              {labels?.login || "Log in"}
            </a>

            <a
              href={applyHref}
              className="inline-flex items-center justify-center rounded-lg sm:rounded-[12px] bg-[#f5a524] hover:bg-[#e5940f] text-[#1a2740] font-bold h-8 sm:h-10 px-3 sm:px-5 text-[12px] sm:text-[14px] shadow-xs whitespace-nowrap transition-colors"
            >
              {labels?.apply || "Apply now"}
            </a>

            <button
              ref={triggerRef}
              type="button"
              aria-expanded={open}
              aria-controls="site-menu"
              aria-label={open ? "Close menu" : "Open menu"}
              onClick={() => setOpen((value) => !value)}
              className="inline-flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center rounded-lg sm:rounded-[12px] border border-[#e6dfd3] bg-white text-[#0f1f3d] hover:bg-[#f4eee4] transition-colors lg:hidden"
            >
              {open ? (
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
                  <path d="M4 7h16M4 12h16M4 17h16" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </header>

      {open ? (
        <div
          id="site-menu"
          ref={sheetRef}
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
          className="fixed inset-0 z-[70] flex flex-col bg-[#fbf8f2] lg:hidden"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <div className="flex h-16 items-center justify-between border-b border-[#e6dfd3] px-5">
            <span className="sa-serif text-[20px] font-semibold text-[#0f1f3d]">SchoolAid</span>
            <div className="flex items-center gap-3">
              {onLanguageChange && (
                <div className="inline-flex items-center rounded-lg border border-[#d5c9b5] bg-white p-0.5">
                  <button
                    type="button"
                    onClick={() => onLanguageChange("en")}
                    className={`rounded px-2.5 py-1 text-[12px] font-bold ${
                      lang === "en" ? "bg-[#2a4b8d] text-white" : "text-[#4a586e]"
                    }`}
                  >
                    EN
                  </button>
                  <button
                    type="button"
                    onClick={() => onLanguageChange("fr")}
                    className={`rounded px-2.5 py-1 text-[12px] font-bold ${
                      lang === "fr" ? "bg-[#2a4b8d] text-white" : "text-[#4a586e]"
                    }`}
                  >
                    FR
                  </button>
                </div>
              )}
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  triggerRef.current?.focus();
                }}
                aria-label="Close menu"
                className="inline-flex h-10 w-10 items-center justify-center rounded-[12px] border border-[#e6dfd3]"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            </div>
          </div>

          <nav aria-label="Sections" className="flex-1 overflow-y-auto px-5 py-4">
            <ul className="divide-y divide-[#e6dfd3]">
              {links.map(([label, href]) => (
                <li key={href}>
                  <a
                    href={href}
                    onClick={() => setOpen(false)}
                    className="flex min-h-[56px] items-center justify-between text-[17px] font-semibold text-[#0f1f3d]"
                  >
                    {label}
                    <ArrowRightIcon className="h-4 w-4 text-[#2a4b8d]" />
                  </a>
                </li>
              ))}
            </ul>

            <div className="mt-6 space-y-3">
              <a
                href={applyHref}
                onClick={() => setOpen(false)}
                className="sa-btn sa-btn-primary w-full"
              >
                {labels?.apply || "Apply for school partnership"}
              </a>
              {whatsappHref ? (
                <a
                  href={whatsappHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="sa-btn sa-btn-ghost w-full"
                >
                  <WhatsAppIcon className="h-5 w-5 text-[#1f7a5a]" />
                  Chat on WhatsApp
                </a>
              ) : null}
              <a href="/login" className="sa-btn sa-btn-ghost w-full">
                {labels?.login || "School log in"}
              </a>
            </div>
          </nav>
        </div>
      ) : null}
    </>
  );
}
