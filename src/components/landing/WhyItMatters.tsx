import { Reveal } from "./Reveal";
import { EyebrowLabel } from "./RecordCard";

const OUTCOMES = [
  "Teachers spend more time teaching.",
  "Parents stay informed.",
  "Students receive a better educational experience.",
  "School leaders make better decisions using accurate information.",
];

export function WhyItMatters() {
  return (
    <section className="max-w-7xl mx-auto px-4 tablet:px-8 py-16 tablet:py-24 grid tablet:grid-cols-2 gap-10 tablet:gap-16 items-center">
      <Reveal>
        <EyebrowLabel>Why It Matters</EyebrowLabel>
        <h2 className="mt-4 font-landing-display font-medium text-text-primary text-[clamp(1.85rem,3.5vw,2.75rem)] leading-tight">
          Better systems. Better decisions. Better schools.
        </h2>
        <p className="mt-5 text-body-lg text-text-secondary">
          Digital transformation allows schools to operate with greater
          confidence. Instead of spending valuable time searching for
          information, preparing reports manually, or managing disconnected
          records, school leaders gain better visibility into daily
          operations.
        </p>
      </Reveal>

      <Reveal delay={1} className="grid grid-cols-1 tablet:grid-cols-2 gap-4">
        {OUTCOMES.map((line) => (
          <div key={line} className="bg-clay border border-border rounded-lg p-5">
            <p className="text-body font-semibold text-text-primary">{line}</p>
          </div>
        ))}
      </Reveal>
    </section>
  );
}
