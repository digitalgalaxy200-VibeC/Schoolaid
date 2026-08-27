"use client";

import { Reveal } from "./Reveal";
import { EyebrowLabel } from "./RecordCard";
import { useLanguage } from "./LanguageProvider";

export function WhyItMatters() {
  const { t } = useLanguage();
  return (
    <section className="max-w-7xl mx-auto px-4 tablet:px-8 py-16 tablet:py-24 grid tablet:grid-cols-2 gap-10 tablet:gap-16 items-center">
      <Reveal>
        <EyebrowLabel>{t.whyItMatters.eyebrow}</EyebrowLabel>
        <h2 className="mt-4 font-landing-display font-medium text-text-primary text-[clamp(1.85rem,3.5vw,2.75rem)] leading-tight">
          {t.whyItMatters.heading}
        </h2>
        <p className="mt-5 text-body-lg text-text-secondary">{t.whyItMatters.paragraph}</p>
      </Reveal>

      <Reveal delay={1} className="grid grid-cols-1 tablet:grid-cols-2 gap-4">
        {t.whyItMatters.outcomes.map((line, i) => (
          <div key={i} className="bg-clay border border-border rounded-lg p-5">
            <p className="text-body font-semibold text-text-primary">{line}</p>
          </div>
        ))}
      </Reveal>
    </section>
  );
}
