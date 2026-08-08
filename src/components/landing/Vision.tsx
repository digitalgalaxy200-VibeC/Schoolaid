import { ArrowRight, ShieldCheck } from "lucide-react";
import { Reveal } from "./Reveal";
import { EyebrowLabel, IndexCard } from "./RecordCard";

const RECORD_LINES = [
  "Their report cards.",
  "Their academic achievements.",
  "Their progress.",
  "Their learning history.",
  "Their educational story.",
];

export function Vision() {
  return (
    <section className="grain-surface bg-primary-dark text-white overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 tablet:px-8 py-16 tablet:py-28">
        <div className="grid tablet:grid-cols-[1fr_auto] gap-12 tablet:gap-16 items-center">
          <div>
            <Reveal>
              <EyebrowLabel tone="dark">Our Vision</EyebrowLabel>
              <h2 className="heading-inverse font-landing-display font-medium mt-4 text-[clamp(2rem,4vw,3.25rem)] leading-tight">
                Preserving every student&rsquo;s educational journey.
              </h2>
              <p className="mt-5 text-body-lg text-white/80 max-w-xl">
                A student&rsquo;s educational journey should never disappear
                after graduation. SchoolAid is building a future where every
                student&rsquo;s academic history remains securely preserved
                and accessible throughout their lifetime.
              </p>
              <p className="mt-4 text-body text-white/70 max-w-xl">
                Instead of losing report cards or searching through old
                filing cabinets, students will always have access to:
              </p>
            </Reveal>

            <ul className="mt-5 space-y-2">
              {RECORD_LINES.map((line, i) => (
                <Reveal key={line} delay={(Math.min(i, 3) as 0 | 1 | 2 | 3)}>
                  <li className="flex items-center gap-3 text-h2 font-landing-display italic font-medium text-white/95">
                    <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
                    {line}
                  </li>
                </Reveal>
              ))}
            </ul>

            <Reveal delay={3}>
              <p className="mt-6 text-body text-white/70 max-w-xl">
                In the future, these verified academic records can support
                school transfers, university admissions, scholarship
                applications, employment verification, and lifelong learning
                opportunities.
              </p>
              <p className="mt-4 text-h2 font-landing-display italic font-medium text-white max-w-xl">
                Because education is a lifelong journey. Their records should
                be too.
              </p>
            </Reveal>
          </div>

          <Reveal delay={2} className="hidden tablet:flex items-center gap-2 shrink-0">
            <div className="flex items-center -space-x-8">
              <IndexCard tone="ghost" rotate={-8} lines={2} className="w-24 opacity-30 scale-90" />
              <IndexCard tone="ghost" rotate={4} lines={2} className="w-28 opacity-50 scale-95" />
              <IndexCard tone="ghost" rotate={-3} lines={3} className="w-32 opacity-75" />
            </div>
            <ArrowRight className="w-6 h-6 text-white/40 mx-2 shrink-0" />
            <div className="relative">
              <IndexCard tone="dark" rotate={0} lines={3} label="Preserved" className="w-40" />
              <span className="absolute -right-3 -bottom-3 flex items-center justify-center w-9 h-9 rounded-full bg-success text-white shadow-md">
                <ShieldCheck className="w-5 h-5" strokeWidth={2.5} />
              </span>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
