import { Reveal } from "./Reveal";
import { EyebrowLabel } from "./RecordCard";

export function WhyPartner() {
  return (
    <section className="max-w-7xl mx-auto px-4 tablet:px-8 py-16 tablet:py-24">
      <Reveal className="max-w-3xl">
        <EyebrowLabel>Why Partner With SchoolAid</EyebrowLabel>
        <h2 className="mt-4 font-landing-display font-medium text-text-primary text-[clamp(1.85rem,3.5vw,2.75rem)] leading-tight">
          More than software. A long-term digital transformation partner.
        </h2>
        <div className="mt-6 space-y-4 text-body-lg text-text-secondary">
          <p>
            Schools don&rsquo;t need another software vendor. They need a
            trusted partner that understands education, improves operational
            processes, supports technology adoption, and helps build
            sustainable systems for long-term growth.
          </p>
          <p>
            SchoolAid combines technology, implementation, training, and
            ongoing support to help schools successfully embrace digital
            transformation.
          </p>
        </div>
      </Reveal>
    </section>
  );
}
