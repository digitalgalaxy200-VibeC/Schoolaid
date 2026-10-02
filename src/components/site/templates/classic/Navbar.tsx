"use client";

import { useState } from "react";
import type { PublicSchool } from "@/lib/site/types";

export function Navbar({ school }: { school: PublicSchool }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const navLinks = [
    { label: "About", href: "#about" },
    { label: "Academics", href: "#programs" },
    { label: "Highlights", href: "#highlights" },
    { label: "Gallery", href: "#gallery" },
    { label: "Blog", href: "#blog" },
    { label: "Events", href: "#events" },
    { label: "Contact", href: "#contact" },
  ];

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
              <span className="text-[10px] sm:text-[11px] font-medium text-gray-500 truncate hidden xs:block">
                {school.motto}
              </span>
            ) : null}
          </div>
        </a>

        {/* Desktop Nav — only visible on large screens */}
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

        {/* Right side actions */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Portal button — always visible */}
          <a
            href="/login"
            className="inline-flex items-center justify-center rounded-lg bg-[var(--site-primary)] px-3 py-1.5 sm:px-4 sm:py-2 text-xs font-semibold uppercase tracking-wider text-[var(--site-on-primary)] shadow-sm transition-all hover:opacity-90 active:scale-[0.98] whitespace-nowrap"
          >
            <span className="hidden sm:inline">Portal Login</span>
            <span className="sm:hidden">Portal</span>
          </a>

          {/* Hamburger — visible below xl */}
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
        </div>
      </div>

      {/* Mobile / Tablet Drawer */}
      {mobileOpen && (
        <div className="border-b border-gray-200 bg-white px-4 pb-4 xl:hidden">
          <nav className="flex flex-col space-y-1 pt-1">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className="rounded-lg px-3 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 hover:text-[var(--site-primary)] transition-colors"
              >
                {link.label}
              </a>
            ))}
            <div className="pt-2 border-t border-gray-100 mt-1">
              <a
                href="#contact"
                onClick={() => setMobileOpen(false)}
                className="block w-full text-center rounded-lg bg-[var(--site-accent)] px-4 py-2.5 text-sm font-semibold text-white shadow-sm"
              >
                Contact Admissions
              </a>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
