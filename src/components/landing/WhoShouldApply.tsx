"use client";

import Image from "next/image";
import { Check } from "lucide-react";
import { Reveal } from "./Reveal";
import { EyebrowLabel } from "./RecordCard";
import { useLanguage } from "./LanguageProvider";

// Photo: via Pexels (pexels.com/photo/positive-black-teacher-working-with-laptop-and-smiling-5905754).
// Pexels License — free for commercial use, no attribution required.
export function WhoShouldApply() {
  const { t } = useLanguage();
  return (
    <section className="bg-clay border-y border-border">
      <div className="max-w-7xl mx-auto px-4 tablet:px-8 py-16 tablet:py-24">
        <div className="grid tablet:grid-cols-[0.85fr_1.15fr] gap-10 tablet:gap-16 items-center">
          <Reveal>
            <div className="group relative aspect-[4/4.6] rounded-xl overflow-hidden shadow-lg border border-border">
              <Image
                src="/images/who-should-apply.jpg"
                alt={t.whoShouldApply.imageAlt}
                fill
                sizes="(min-width: 768px) 35vw, 90vw"
                className="object-cover transition-transform duration-500 ease-out group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-primary-dark/30 via-transparent to-transparent" />
            </div>
          </Reveal>

          <div>
            <Reveal className="max-w-xl">
              <EyebrowLabel>{t.whoShouldApply.eyebrow}</EyebrowLabel>
              <h2 className="mt-4 font-landing-display font-medium text-text-primary text-[clamp(1.85rem,3.5vw,2.75rem)] leading-tight">
                {t.whoShouldApply.heading}
              </h2>
              <p className="mt-4 text-body-lg text-text-secondary">{t.whoShouldApply.intro}</p>
            </Reveal>

            <Reveal delay={1} className="mt-8 grid gap-3">
              {t.whoShouldApply.traits.map((trait, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 bg-surface border border-border rounded-lg p-4 transition-shadow hover:shadow-sm"
                >
                  <span className="shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-success-bg text-success mt-0.5">
                    <Check className="w-3.5 h-3.5" strokeWidth={3} />
                  </span>
                  <span className="text-body text-text-primary">{trait}</span>
                </div>
              ))}
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  );
}
