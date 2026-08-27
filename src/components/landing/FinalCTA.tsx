"use client";

import Image from "next/image";
import { ArrowRight, Calendar } from "lucide-react";
import { Button } from "@/components/ui";
import { Reveal } from "./Reveal";
import { useWaitlistModal } from "./WaitlistModalProvider";
import { useLanguage } from "./LanguageProvider";

// Photo: via Pexels (pexels.com/photo/confident-black-woman-in-a-modern-library-holding-a-book-and-smartphone-6684599).
// Pexels License — free for commercial use, no attribution required.
export function FinalCTA() {
  const { open } = useWaitlistModal();
  const { t } = useLanguage();
  return (
    <section className="relative overflow-hidden">
      <Image
        src="/images/final-cta.jpg"
        alt={t.finalCta.imageAlt}
        fill
        sizes="100vw"
        className="object-cover object-[75%_center] grayscale-[30%] contrast-[1.05]"
      />
      <div className="absolute inset-0 bg-primary mix-blend-multiply opacity-80" />
      <div className="absolute inset-0 bg-gradient-to-t from-primary-dark/80 via-primary-dark/55 to-primary-dark/70" />

      <div className="relative max-w-7xl mx-auto px-4 tablet:px-8 py-16 tablet:py-24 text-center">
        <Reveal className="max-w-2xl mx-auto">
          <h2 className="heading-inverse font-landing-display font-medium text-[clamp(2rem,4vw,3.25rem)] leading-tight">
            {t.finalCta.heading}
          </h2>
          <p className="mt-5 text-body-lg text-white/85">{t.finalCta.paragraph}</p>

          <div className="mt-8 flex flex-col tablet:flex-row gap-3 justify-center">
            <Button
              variant="accent"
              size="lg"
              icon={<ArrowRight className="w-4 h-4" />}
              fullWidth
              onClick={() => open("final_cta_primary")}
            >
              {t.finalCta.ctaPrimary}
            </Button>
            <Button
              variant="ghost"
              size="lg"
              icon={<Calendar className="w-4 h-4" />}
              fullWidth
              className="!text-white border-2 border-white/40 hover:!bg-white/10 hover:no-underline"
              onClick={() => open("final_cta_discovery_call")}
            >
              {t.finalCta.ctaSecondary}
            </Button>
          </div>

          <p className="mt-5 font-mono text-caption uppercase tracking-wide text-white/60">
            {t.finalCta.footnote}
          </p>
        </Reveal>
      </div>
    </section>
  );
}
