"use client";

import { Reveal } from "./Reveal";
import { EyebrowLabel } from "./RecordCard";
import { useLanguage } from "./LanguageProvider";

export function Position() {
  const { t } = useLanguage();
  return (
    <section className="grain-surface bg-primary-dark text-white">
      <div className="max-w-7xl mx-auto px-4 tablet:px-8 py-16 tablet:py-24">
        <Reveal className="max-w-3xl">
          <EyebrowLabel tone="dark">{t.position.eyebrow}</EyebrowLabel>
          <h2 className="heading-inverse font-landing-display font-medium mt-4 text-[clamp(1.85rem,3.5vw,2.75rem)] leading-tight">
            {t.position.heading}
          </h2>
          <div className="mt-6 space-y-4 text-body-lg text-white/85">
            <p>{t.position.paragraph1}</p>
            <p>{t.position.paragraph2}</p>
            <p className="font-semibold text-white">{t.position.paragraph3}</p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
