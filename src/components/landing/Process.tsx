"use client";

import { Reveal } from "./Reveal";
import { EyebrowLabel } from "./RecordCard";
import { useLanguage } from "./LanguageProvider";

export function Process() {
  const { t } = useLanguage();
  const steps = t.process.steps;

  return (
    <section id="process" className="max-w-7xl mx-auto px-4 tablet:px-8 py-16 tablet:py-24">
      <Reveal className="max-w-2xl">
        <EyebrowLabel>{t.process.eyebrow}</EyebrowLabel>
        <h2 className="mt-4 font-landing-display font-medium text-text-primary text-[clamp(1.85rem,3.5vw,2.75rem)] leading-tight">
          {t.process.heading}
        </h2>
      </Reveal>

      <ol className="ledger-texture mt-12 max-w-2xl">
        {steps.map((step, i) => (
          <Reveal key={i} delay={(Math.min(i, 3) as 0 | 1 | 2 | 3)}>
            <li className="group relative pl-16 pb-10 last:pb-0">
              {i !== steps.length - 1 && (
                <span className="absolute left-[19px] top-10 bottom-0 w-px bg-border-strong" />
              )}
              <span className="absolute left-0 top-0 flex items-center justify-center w-10 h-10 rounded-full bg-primary-light text-primary font-mono font-bold text-body transition-colors duration-300 group-hover:bg-primary group-hover:text-white">
                {String(i + 1).padStart(2, "0")}
              </span>
              <h3 className="font-display font-bold text-h2 text-text-primary">{step.title}</h3>
              <p className="mt-1 text-body text-text-secondary max-w-md">{step.description}</p>
            </li>
          </Reveal>
        ))}
      </ol>
    </section>
  );
}
