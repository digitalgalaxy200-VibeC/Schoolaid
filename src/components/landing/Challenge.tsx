"use client";

import {
  FileStack,
  FolderOpen,
  Clock,
  CreditCard,
  MessageCircleWarning,
  Archive,
  type LucideIcon,
} from "lucide-react";
import { Reveal } from "./Reveal";
import { EyebrowLabel } from "./RecordCard";
import { useLanguage } from "./LanguageProvider";

const ICONS: LucideIcon[] = [FileStack, FolderOpen, Clock, CreditCard, MessageCircleWarning, Archive];

export function Challenge() {
  const { t } = useLanguage();
  const pains = t.challenge.pains.map((text, i) => ({ icon: ICONS[i], text }));

  return (
    <section className="max-w-7xl mx-auto px-4 tablet:px-8 py-16 tablet:py-24 grid tablet:grid-cols-2 gap-10 tablet:gap-16 items-start">
      <Reveal>
        <EyebrowLabel>{t.challenge.eyebrow}</EyebrowLabel>
        <h2 className="mt-4 font-landing-display font-medium text-text-primary text-[clamp(1.85rem,3.5vw,2.75rem)] leading-tight">
          {t.challenge.heading}
        </h2>
        <p className="mt-5 text-body-lg text-text-secondary">{t.challenge.intro}</p>
        <p className="mt-4 text-body text-text-secondary">{t.challenge.outro}</p>
      </Reveal>

      <Reveal delay={1}>
        <ul className="bg-clay border border-border rounded-lg p-2 tablet:p-3">
          {pains.map(({ icon: Icon, text }, i) => (
            <li
              key={i}
              className={`flex items-center gap-4 px-4 py-4 ${
                i !== pains.length - 1 ? "border-b border-dashed border-border-strong" : ""
              }`}
            >
              <span className="shrink-0 flex items-center justify-center w-9 h-9 rounded-full bg-surface border border-border text-warning">
                <Icon className="w-4 h-4" strokeWidth={2.25} />
              </span>
              <span className="text-body text-text-primary">{text}</span>
            </li>
          ))}
        </ul>
      </Reveal>
    </section>
  );
}
