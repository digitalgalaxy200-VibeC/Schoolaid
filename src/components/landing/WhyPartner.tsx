import Image from "next/image";
import { Reveal } from "./Reveal";
import { EyebrowLabel } from "./RecordCard";

// Photo: via Pexels (pexels.com/photo/casual-office-meeting-in-lagos-nigeria-30688593).
// Pexels License — free for commercial use, no attribution required.
export function WhyPartner() {
  return (
    <section className="max-w-7xl mx-auto px-4 tablet:px-8 py-16 tablet:py-24">
      <div className="grid tablet:grid-cols-[1.05fr_0.95fr] gap-10 tablet:gap-16 items-center">
        <Reveal className="max-w-xl">
          <EyebrowLabel>Why Partner With SchoolAid</EyebrowLabel>
          <h2 className="mt-4 font-landing-display font-medium text-text-primary text-[clamp(1.85rem,3.5vw,2.75rem)] leading-tight">
            More than software. A long-term digital transformation partner.
          </h2>
          <div className="mt-6 space-y-4 text-body-lg text-text-secondary">
            <p>
              Schools don&rsquo;t need another software vendor. They need a
              trusted partner that understands education, improves
              operational processes, supports technology adoption, and helps
              build sustainable systems for long-term growth.
            </p>
            <p>
              SchoolAid combines technology, implementation, training, and
              ongoing support to help schools successfully embrace digital
              transformation.
            </p>
          </div>
        </Reveal>

        <Reveal delay={1}>
          <div className="relative aspect-[4/3.1] rounded-xl overflow-hidden shadow-lg border border-border">
            <Image
              src="/images/why-partner.jpg"
              alt="SchoolAid team members meeting with a school partner"
              fill
              sizes="(min-width: 768px) 40vw, 90vw"
              className="object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-primary-dark/35 via-transparent to-transparent" />
          </div>
        </Reveal>
      </div>
    </section>
  );
}
