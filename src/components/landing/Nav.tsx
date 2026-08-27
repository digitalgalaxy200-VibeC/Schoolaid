"use client";

import { useState } from "react";
import { Menu, X, GraduationCap } from "lucide-react";
import { Button } from "@/components/ui";
import { useWaitlistModal } from "./WaitlistModalProvider";
import { useLanguage } from "./LanguageProvider";
import { LanguageSwitcher } from "./LanguageSwitcher";

export function Nav() {
  const [open, setOpen] = useState(false);
  const { open: openWaitlist } = useWaitlistModal();
  const { t } = useLanguage();

  const LINKS = [
    { href: "#transform", label: t.nav.solutions },
    { href: "#process", label: t.nav.process },
    { href: "#faq", label: t.nav.faq },
  ];

  return (
    <header className="sticky top-0 z-50 bg-bg/85 backdrop-blur border-b border-border">
      <div className="max-w-7xl mx-auto px-4 tablet:px-8 h-16 flex items-center justify-between gap-4">
        <a href="#top" className="flex items-center gap-2 font-landing-display font-medium text-h2 text-text-primary shrink-0">
          <span className="flex items-center justify-center w-8 h-8 rounded-md bg-primary text-white">
            <GraduationCap className="w-5 h-5" strokeWidth={2.5} />
          </span>
          SchoolAid
        </a>

        <nav className="hidden tablet:flex items-center gap-8">
          {LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="group relative text-body text-text-secondary hover:text-primary transition-colors"
            >
              {link.label}
              <span className="absolute left-0 -bottom-1 h-px w-0 bg-primary transition-all duration-200 group-hover:w-full" />
            </a>
          ))}
        </nav>

        <div className="hidden tablet:flex items-center gap-3">
          <LanguageSwitcher />
          <Button size="sm" variant="primary" onClick={() => openWaitlist("nav")}>
            {t.nav.cta}
          </Button>
        </div>

        <div className="flex items-center gap-2 tablet:hidden">
          <LanguageSwitcher />
          <button
            type="button"
            aria-label={open ? t.nav.closeMenu : t.nav.openMenu}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="flex items-center justify-center w-10 h-10 rounded-md text-text-primary hover:bg-clay"
          >
            {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {open && (
        <div className="tablet:hidden border-t border-border bg-surface px-4 py-4 space-y-4">
          {LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="block text-body-lg text-text-primary"
            >
              {link.label}
            </a>
          ))}
          <Button
            variant="primary"
            fullWidth
            onClick={() => {
              setOpen(false);
              openWaitlist("nav_mobile");
            }}
          >
            {t.nav.cta}
          </Button>
        </div>
      )}
    </header>
  );
}
