import { ArrowRight, Calendar } from "lucide-react";
import { Button } from "@/components/ui";
import { RecordStack, EyebrowLabel } from "./RecordCard";

export function Hero() {
  return (
    <section id="top" className="relative overflow-hidden">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(60%_50%_at_80%_0%,var(--color-primary-light)_0%,transparent_60%)]" />

      <div className="max-w-7xl mx-auto px-4 tablet:px-8 pt-14 pb-16 tablet:pt-20 tablet:pb-24 grid tablet:grid-cols-[1.1fr_0.9fr] gap-12 tablet:gap-8 items-center">
        <div>
          <EyebrowLabel>Digital Transformation Partner</EyebrowLabel>

          <h1 className="mt-5 font-landing-display font-medium text-text-primary leading-[1.05] text-[clamp(2.5rem,5.5vw,4rem)]">
            Digital transformation
            <br />
            for African schools.
          </h1>

          <p className="mt-5 font-landing-display italic text-h2 text-primary max-w-xl">
            Helping African schools build smarter, more connected operations.
          </p>

          <p className="mt-4 text-body text-text-secondary max-w-xl">
            From admissions to graduation, SchoolAid replaces paper-based
            administration, disconnected spreadsheets, and manual processes
            with connected digital operations that improve efficiency,
            strengthen communication, and preserve every student&rsquo;s
            educational journey.
          </p>

          <p className="mt-4 text-body font-semibold text-text-primary max-w-xl">
            SchoolAid is not just another school management system. We
            partner with schools to understand how they operate, redesign
            critical workflows, implement practical digital solutions, and
            support them throughout their digital transformation journey.
          </p>

          <div className="mt-8 flex flex-col tablet:flex-row gap-3">
            <a href="mailto:partnerships@schoolaid.app?subject=Digital%20Transformation%20Assessment">
              <Button variant="primary" size="lg" icon={<ArrowRight className="w-4 h-4" />} fullWidth>
                Start Your School&rsquo;s Digital Transformation
              </Button>
            </a>
            <a href="mailto:partnerships@schoolaid.app?subject=Discovery%20Call%20Request">
              <Button variant="secondary" size="lg" icon={<Calendar className="w-4 h-4" />} fullWidth>
                Book a Discovery Call
              </Button>
            </a>
          </div>

          <p className="mt-6 font-mono text-caption uppercase tracking-wide text-text-disabled">
            Trusted by schools committed to building the future of education.
          </p>
        </div>

        <RecordStack className="tablet:mt-0" />
      </div>
    </section>
  );
}
