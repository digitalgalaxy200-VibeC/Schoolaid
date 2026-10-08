"use client";

import { useState } from "react";
import type { PublicSchool, SiteSection } from "@/lib/site/types";
import { hasSection, headerNavItems } from "./navigation";

export function Navbar({ school, sections }: { school: PublicSchool; sections: SiteSection[] }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  // Only the blocks this school actually has switched on. A section the
  // dashboard has hidden is not in `sections` at all, so the menu never sends
  // a visitor to an anchor that does not exist (see `navigation.ts`).
  const navLinks = headerNavItems(sections);

  return (
    <header className="sticky top-0 z-50 border-b border-gray-100 bg-white/95 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
        {/* Brand */}
        <a href="#" className="flex items-center gap-2.5 group min-w-0 mr-2">
          {school.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={school.logoUrl}
              alt={school.name}
              className="h-9 w-9 shrink-0 rounded-lg object-contain shadow-sm ring-1 ring-gray-200"
            />
          ) : (
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--site-primary)] text-xs font-black text-[var(--site-on-primary)] shadow-sm">
              {school.name.slice(0, 2).toUpperCase()}
            </div>
          )}
          <div className="flex flex-col min-w-0">
            <span className="font-extrabold tracking-tight text-gray-900 group-hover:text-[var(--site-primary)] transition-colors truncate text-sm sm:text-base">
              {school.name}
            </span>
            {school.motto ? (
              <span className="text-xs font-medium text-gray-500 truncate hidden xs:block">
                {school.motto}
              </span>
            ) : null}
          </div>
        </a>

        {/* Desktop Nav — only visible on large screens, and only when this
            school has sections to navigate to */}
        {navLinks.length > 0 && (
          <nav className="hidden items-center gap-5 xl:flex">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="text-sm font-medium text-gray-600 transition-colors hover:text-[var(--site-primary)] whitespace-nowrap"
              >
                {link.label}
              </a>
            ))}
          </nav>
        )}

        {/* Right side actions */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Portal button — always visible. It leads to THIS school's login
              (/school/<slug>/login), which shows the school's logo and colours,
              rather than the platform's generic sign-in. */}
          <a
            href={`/school/${school.slug}/login`}
            className="inline-flex items-center justify-center rounded-lg bg-[var(--site-primary)] px-3 py-1.5 sm:px-4 sm:py-2 text-sm font-semibold uppercase tracking-wider text-[var(--site-on-primary)] shadow-sm transition-all hover:opacity-90 active:scale-[0.98] whitespace-nowrap"
          >
            <span className="hidden sm:inline">Portal Login</span>
            <span className="sm:hidden">Portal</span>
          </a>

          {/* Hamburger — visible below xl, and only when the drawer it opens
              would actually contain links */}
          {navLinks.length > 0 && (
            <button
              type="button"
              onClick={() => setMobileOpen(!mobileOpen)}
              className="xl:hidden inline-flex items-center justify-center rounded-lg p-2 text-gray-700 hover:bg-gray-100 focus:outline-none"
              aria-expanded={mobileOpen}
              aria-label="Toggle navigation"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                {mobileOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Mobile / Tablet Drawer */}
      {mobileOpen && navLinks.length > 0 && (
        <div className="border-b border-gray-200 bg-white px-4 pb-4 xl:hidden">
          <nav className="flex flex-col space-y-1 pt-1">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className="rounded-lg px-3 py-2.5 text-base font-medium text-gray-700 hover:bg-gray-50 hover:text-[var(--site-primary)] transition-colors"
              >
                {link.label}
              </a>
            ))}
            {hasSection(sections, "contact") && (
              <div className="pt-2 border-t border-gray-100 mt-1">
                <a
                  href="#contact"
                  onClick={() => setMobileOpen(false)}
                  className="block w-full text-center rounded-lg bg-[var(--site-accent)] px-4 py-2.5 text-sm font-semibold text-white shadow-sm"
                >
                  Contact Admissions
                </a>
              </div>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
