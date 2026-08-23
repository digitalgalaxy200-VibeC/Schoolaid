import Image from "next/image";
import { Check } from "lucide-react";
import { Reveal } from "./Reveal";
import { EyebrowLabel } from "./RecordCard";

const TRAITS = [
  "Still rely heavily on paper records.",
  "Use spreadsheets to manage important school information.",
  "Spend significant time preparing reports manually.",
  "Want to improve communication with parents.",
  "Are planning to modernize school operations.",
  "Want a professional school website.",
  "Want to preserve student records securely.",
  "Are looking for a long-term digital transformation partner.",
];

// Photo: via Pexels (pexels.com/photo/positive-black-teacher-working-with-laptop-and-smiling-5905754).
// Pexels License — free for commercial use, no attribution required.
export function WhoShouldApply() {
  return (
    <section className="bg-clay border-y border-border">
      <div className="max-w-7xl mx-auto px-4 tablet:px-8 py-16 tablet:py-24">
        <div className="grid tablet:grid-cols-[0.85fr_1.15fr] gap-10 tablet:gap-16 items-center">
          <Reveal>
            <div className="relative aspect-[4/4.6] rounded-xl overflow-hidden shadow-lg border border-border">
              <Image
                src="/images/who-should-apply.jpg"
                alt="A teacher smiling in front of a classroom whiteboard"
                fill
                sizes="(min-width: 768px) 35vw, 90vw"
                className="object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-primary-dark/30 via-transparent to-transparent" />
            </div>
          </Reveal>

          <div>
            <Reveal className="max-w-xl">
              <EyebrowLabel>Who Should Apply</EyebrowLabel>
              <h2 className="mt-4 font-landing-display font-medium text-text-primary text-[clamp(1.85rem,3.5vw,2.75rem)] leading-tight">
                We&rsquo;re looking for schools that&hellip;
              </h2>
              <p className="mt-4 text-body-lg text-text-secondary">
                This partnership is designed for schools that are ready to
                improve the way they operate. Your school is a great fit if
                you:
              </p>
            </Reveal>

            <Reveal delay={1} className="mt-8 grid gap-3">
              {TRAITS.map((trait) => (
                <div
                  key={trait}
                  className="flex items-start gap-3 bg-surface border border-border rounded-lg p-4"
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
