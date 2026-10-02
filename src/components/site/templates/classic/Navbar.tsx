"use client";

import { useState } from "react";
import type { PublicSchool } from "@/lib/site/types";

export function Navbar({ school }: { school: PublicSchool }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const navLinks = [
    { label: "About", href: "#about" },
    { label: "Academics", href: "#programs" },
    { label: "Principal's Welcome", href: "#principal" },
    { label: "Highlights", href: "#highlights" },
    { label: "Gallery", href: "#gallery" },
    { label: "Contact", href: "#contact" },
  ];

  return (
    <header className="sticky top-0 z-50 border-b border-gray-100 bg-white/95 backdrop-blur-md transition-all">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3.5 sm:px-6">
        {/* Brand */}
        <a href="#" className="flex items-center gap-3 group">
          {school.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={school.logoUrl}
              alt={school.name}
              className="h-10 w-10 rounded-lg object-contain shadow-sm ring-1 ring-gray-200"
            />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--site-primary)] text-sm font-black text-[var(--site-on-primary)] shadow-sm">
              {school.name.slice(0, 2).toUpperCase()}
            </div>
          )}
          <div className="flex flex-col">
            <span className="font-extrabold tracking-tight text-gray-900 group-hover:text-[var(--site-primary)] transition-colors line-clamp-1 text-base sm:text-lg">
              {school.name}
            </span>
            {school.motto ? (
              <span className="text-[11px] font-medium text-gray-500 line-clamp-1">
                {school.motto}
              </span>
            ) : null}
          </div>
        </a>

        {/* Desktop Nav */}
        <nav className="hidden items-center gap-6 lg:flex">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-gray-600 transition-colors hover:text-[var(--site-primary)]"
            >
              {link.label}
            </a>
          ))}
        </nav>

        {/* Desktop Actions */}
        <div className="hidden items-center gap-3 sm:flex">
          <a
            href="/login"
            className="inline-flex items-center justify-center rounded-lg bg-[var(--site-primary)] px-4 py-2 text-xs font-semibold uppercase tracking-wider text-[var(--site-on-primary)] shadow-sm transition-all hover:opacity-90 active:scale-[0.98]"
          >
            Portal Login
          </a>
        </div>

        {/* Mobile menu button */}
        <div className="flex items-center gap-2 lg:hidden">
          <a
            href="/login"
            className="inline-flex items-center justify-center rounded-lg bg-[var(--site-primary)] px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-[var(--site-on-primary)] shadow-sm"
          >
            Portal
          </a>
          <button
            type="button"
            onClick={() => setMobileOpen(!mobileOpen)}
            className="inline-flex items-center justify-center rounded-lg p-2 text-gray-700 hover:bg-gray-100 focus:outline-none"
            aria-expanded={mobileOpen}
            aria-label="Toggle navigation"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              {mobileOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="border-b border-gray-200 bg-white px-4 py-4 lg:hidden animate-in fade-in slide-in-from-top-2">
          <nav className="flex flex-col space-y-3">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className="rounded-md px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 hover:text-[var(--site-primary)]"
              >
                {link.label}
              </a>
            ))}
            <div className="pt-2">
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
