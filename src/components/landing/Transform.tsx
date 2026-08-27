"use client";

import {
  UsersRound,
  ClipboardCheck,
  Layers,
  Banknote,
  HeartHandshake,
  Globe,
  type LucideIcon,
} from "lucide-react";
import { Reveal } from "./Reveal";
import { EyebrowLabel } from "./RecordCard";
import { useLanguage } from "./LanguageProvider";

const ICONS: LucideIcon[] = [UsersRound, ClipboardCheck, Layers, Banknote, HeartHandshake, Globe];

export function Transform() {
  const { t } = useLanguage();
  const areas = t.transform.areas.map((area, i) => ({ ...area, icon: ICONS[i] }));

  return (
    <section id="transform" className="max-w-7xl mx-auto px-4 tablet:px-8 py-16 tablet:py-24">
      <Reveal className="max-w-2xl">
        <EyebrowLabel>{t.transform.eyebrow}</EyebrowLabel>
        <h2 className="mt-4 font-landing-display font-medium text-text-primary text-[clamp(1.85rem,3.5vw,2.75rem)] leading-tight">
          {t.transform.heading}
        </h2>
      </Reveal>

      <div className="mt-10 grid tablet:grid-cols-2 desktop:grid-cols-3 gap-5">
        {areas.map(({ icon: Icon, title, description }, i) => (
          <Reveal key={i} delay={((i % 3) as 0 | 1 | 2)}>
            <div className="group h-full transition-transform duration-300 ease-out hover:-translate-y-1">
              <div className="flex items-center justify-center w-11 h-9 rounded-t-md bg-primary text-white ml-5 transition-colors duration-300 group-hover:bg-accent">
                <Icon className="w-4 h-4" strokeWidth={2.25} />
              </div>
              <div className="h-full bg-surface border border-border rounded-lg rounded-tl-none p-6 shadow-sm transition-shadow duration-300 group-hover:shadow-md">
                <h3 className="font-display font-bold text-h2 text-text-primary">{title}</h3>
                <p className="mt-2 text-body text-text-secondary">{description}</p>
              </div>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
