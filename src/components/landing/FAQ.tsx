"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Reveal } from "./Reveal";
import { EyebrowLabel } from "./RecordCard";
import { useLanguage } from "./LanguageProvider";

export function FAQ() {
  const [open, setOpen] = useState<number | null>(0);
  const { t } = useLanguage();

  return (
    <section id="faq" className="max-w-7xl mx-auto px-4 tablet:px-8 py-16 tablet:py-24">
      <Reveal className="max-w-2xl">
        <EyebrowLabel>{t.faq.eyebrow}</EyebrowLabel>
        <h2 className="mt-4 font-landing-display font-medium text-text-primary text-[clamp(1.85rem,3.5vw,2.75rem)] leading-tight">
          {t.faq.heading}
        </h2>
      </Reveal>

      <Reveal delay={1} className="mt-10 max-w-3xl divide-y divide-border border-t border-b border-border">
        {t.faq.items.map((item, i) => {
          const isOpen = open === i;
          return (
            <div key={i}>
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : i)}
                aria-expanded={isOpen}
                className="group w-full flex items-center justify-between gap-4 py-5 text-left"
              >
                <span className="font-display font-semibold text-h2 text-text-primary transition-colors group-hover:text-primary">
                  {item.q}
                </span>
                <ChevronDown
                  className={`w-5 h-5 shrink-0 text-text-secondary transition-transform duration-200 group-hover:text-primary ${
                    isOpen ? "rotate-180" : ""
                  }`}
                />
              </button>
              <div
                className={`grid transition-all duration-200 ease-out ${
                  isOpen ? "grid-rows-[1fr] pb-5" : "grid-rows-[0fr]"
                }`}
              >
                <div className="overflow-hidden">
                  <p className="text-body-lg text-text-secondary max-w-xl">{item.a}</p>
                </div>
              </div>
            </div>
          );
        })}
      </Reveal>
    </section>
  );
}
