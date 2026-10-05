"use client";

import { useState } from "react";
import type { SiteSection } from "@/lib/site/types";

type FaqSection = Extract<SiteSection, { kind: "faq" }>;

export function Faq({ section }: { section: FaqSection }) {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const toggle = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <section id="faq" className="scroll-mt-16 bg-white py-16 sm:py-20 border-t border-gray-100">
      <div className="mx-auto max-w-4xl px-4 sm:px-6">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <span className="text-xs font-bold uppercase tracking-widest text-[var(--site-accent)]">
            Questions & Answers
          </span>
          <h2 className="mt-1 text-2xl font-extrabold tracking-tight text-[var(--site-primary-dark)] sm:text-3xl">
            {section.heading}
          </h2>
          {section.subheading && (
            <p className="mt-3 text-sm sm:text-base text-gray-600 leading-relaxed">
              {section.subheading}
            </p>
          )}
        </div>

        <div className="space-y-4">
          {section.items.map((item, index) => {
            const isOpen = openIndex === index;
            return (
              <div
                key={index}
                className="overflow-hidden rounded-2xl border border-gray-200/80 bg-white transition-all shadow-sm"
              >
                <button
                  type="button"
                  onClick={() => toggle(index)}
                  className="flex w-full items-center justify-between p-5 text-left text-sm sm:text-base font-bold text-gray-900 hover:bg-gray-50/80 focus:outline-none"
                >
                  <span className="pr-4">{item.question}</span>
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--site-tint)] text-xs font-bold text-[var(--site-primary)]">
                    {isOpen ? "−" : "+"}
                  </span>
                </button>
                {isOpen && (
                  <div className="border-t border-gray-100 px-5 pb-5 pt-3 text-xs sm:text-sm leading-relaxed text-gray-600 bg-gray-50/40">
                    {item.answer}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
