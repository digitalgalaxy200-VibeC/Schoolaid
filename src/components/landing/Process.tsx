import { Reveal } from "./Reveal";
import { EyebrowLabel } from "./RecordCard";

const STEPS = [
  {
    title: "Digital Transformation Assessment",
    description:
      "We learn about your school, your current operations, your challenges, and your goals.",
  },
  {
    title: "Discovery Session",
    description:
      "We review your assessment and identify opportunities to improve your school's operations.",
  },
  {
    title: "Digital Transformation Roadmap",
    description:
      "We recommend a practical implementation plan tailored specifically to your school.",
  },
  {
    title: "Implementation",
    description: "We deploy the right digital solutions based on your school's needs.",
  },
  {
    title: "Training & Adoption",
    description:
      "We train your administrators, teachers, and staff to ensure successful adoption.",
  },
  {
    title: "Continuous Partnership",
    description:
      "As your school grows, SchoolAid continues supporting your digital transformation journey.",
  },
];

export function Process() {
  return (
    <section id="process" className="max-w-7xl mx-auto px-4 tablet:px-8 py-16 tablet:py-24">
      <Reveal className="max-w-2xl">
        <EyebrowLabel>Our Digital Transformation Process</EyebrowLabel>
        <h2 className="mt-4 font-landing-display font-medium text-text-primary text-[clamp(1.85rem,3.5vw,2.75rem)] leading-tight">
          Every partnership begins with understanding your school.
        </h2>
      </Reveal>

      <ol className="ledger-texture mt-12 max-w-2xl">
        {STEPS.map((step, i) => (
          <Reveal key={step.title} delay={(Math.min(i, 3) as 0 | 1 | 2 | 3)}>
            <li className="relative pl-16 pb-10 last:pb-0">
              {i !== STEPS.length - 1 && (
                <span className="absolute left-[19px] top-10 bottom-0 w-px bg-border-strong" />
              )}
              <span className="absolute left-0 top-0 flex items-center justify-center w-10 h-10 rounded-full bg-primary-light text-primary font-mono font-bold text-body">
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
