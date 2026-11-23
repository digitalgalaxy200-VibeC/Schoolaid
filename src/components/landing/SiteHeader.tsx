"use client";

import { useEffect, useRef, useState } from "react";
import { GraduationIcon, WhatsAppIcon, ArrowRightIcon } from "./icons";

/**
 * The site header.
 *
 * On a phone this is three things: the mark, the one action that matters, and a
 * way into the rest. The menu is a full-screen sheet rather than a dropdown —
 * a dropdown on a 360px screen either covers the page in a cramped box or scrolls
 * independently of it, and neither reads as deliberate.
 *
 * Behaviour that is easy to get wrong, handled here:
 *   - the trigger reports `aria-expanded` and controls the sheet;
 *   - Escape closes it, and focus returns to the trigger;
 *   - the page behind is locked while it is open, so scrolling does not drift;
 *   - every link in the sheet is a 48px target.
 */
export function SiteHeader({
  applyHref,
  whatsappHref,
}: {
  applyHref: string;
  whatsappHref: string | null;
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
    ["How it works", "#how-it-works"],
    ["What we digitise", "#digitise"],
    ["Revenue", "#revenue"],
    ["Pricing", "#pricing"],
    ["Vision", "#vision"],
    ["FAQ", "#faq"],
    ["Contact", "#contact"],
  ];

  return (
    <>
      <a href="#main" className="sa-skip">
        Skip to content
      </a>

      <header className="sticky top-0 z-50 border-b border-[#e6dfd3] bg-[#fbf8f2]/90 backdrop-blur-md transition-shadow duration-200">
        <div className="sa-container flex h-16 items-center justify-between gap-4">
          <a href="#top" className="flex items-center gap-2.5 transition-transform hover:scale-[1.02]">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-[12px] bg-[#2a4b8d] text-white shadow-sm shadow-[#2a4b8d]/25">
              <GraduationIcon className="h-5 w-5" />
            </span>
            <span className="sa-serif text-[21px] font-bold tracking-tight text-[#0f1f3d]">
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

          <div className="flex items-center gap-3">
            <a
              href="/login"
              className="hidden sm:inline-flex text-[14px] font-semibold text-[#2a4b8d] hover:text-[#0f1f3d] transition-colors px-2"
            >
              Log in
            </a>

            <a
              href={applyHref}
              className="sa-btn sa-btn-primary min-h-[40px] px-5 text-[14px] shadow-sm"
            >
              Apply now
            </a>

            <button
              ref={triggerRef}
              type="button"
              aria-expanded={open}
              aria-controls="site-menu"
              aria-label={open ? "Close menu" : "Open menu"}
              onClick={() => setOpen((value) => !value)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-[12px] border border-[#e6dfd3] bg-white text-[#0f1f3d] hover:bg-[#f4eee4] transition-colors lg:hidden"
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
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                triggerRef.current?.focus();
              }}
              aria-label="Close menu"
              className="inline-flex h-11 w-11 items-center justify-center rounded-[12px] border border-[#e6dfd3]"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
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
                Apply for school partnership
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
                School log in
              </a>
            </div>
          </nav>
        </div>
      ) : null}
    </>
  );
}
