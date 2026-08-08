"use client";

import { useState } from "react";
import { Menu, X, GraduationCap } from "lucide-react";
import { Button } from "@/components/ui";

const LINKS = [
  { href: "#transform", label: "Solutions" },
  { href: "#process", label: "Process" },
  { href: "#faq", label: "FAQ" },
];

export function Nav() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 bg-bg/85 backdrop-blur border-b border-border">
      <div className="max-w-7xl mx-auto px-4 tablet:px-8 h-16 flex items-center justify-between">
        <a href="#top" className="flex items-center gap-2 font-landing-display font-medium text-h2 text-text-primary">
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

        <div className="hidden tablet:block">
          <Button
            size="sm"
            variant="primary"
            onClick={() => {
              window.location.href =
                "mailto:partnerships@schoolaid.app?subject=Digital%20Transformation%20Assessment";
            }}
          >
            Start Your Transformation
          </Button>
        </div>

        <button
          type="button"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="tablet:hidden flex items-center justify-center w-10 h-10 rounded-md text-text-primary hover:bg-clay"
        >
          {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
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
          <a
            href="mailto:partnerships@schoolaid.app?subject=Digital%20Transformation%20Assessment"
            className="block"
          >
            <Button variant="primary" fullWidth onClick={() => setOpen(false)}>
              Start Your Transformation
            </Button>
          </a>
        </div>
      )}
    </header>
  );
}
