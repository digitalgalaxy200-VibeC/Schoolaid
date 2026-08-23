import Image from "next/image";
import { ArrowRight, Calendar } from "lucide-react";
import { Button } from "@/components/ui";
import { EyebrowLabel } from "./RecordCard";

// Photo: Şeyhmus Kino, via Pexels (pexels.com/photo/smiling-children-in-african-classroom-setting-28593055).
// Pexels License — free for commercial use, no attribution required.
export function Hero() {
  return (
    <section id="top" className="relative overflow-hidden min-h-[640px] tablet:min-h-[760px] flex items-center">
      <Image
        src="/images/hero-classroom.jpg"
        alt="Students writing at their desks in a classroom"
        fill
        priority
        sizes="100vw"
        className="object-cover object-[65%_center] grayscale-[35%] contrast-[1.05]"
      />
      {/* Duotone wash: brand cobalt over shadows, amber warmth over highlights */}
      <div className="absolute inset-0 bg-primary-dark mix-blend-multiply opacity-70" />
      <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-transparent to-accent/25 mix-blend-soft-light" />
      {/* Legibility gradient: strong on the left where the copy sits */}
      <div className="absolute inset-0 bg-gradient-to-r from-[#0F1E42]/92 via-[#0F1E42]/70 tablet:via-30% to-transparent" />

      <div className="relative max-w-7xl mx-auto px-4 tablet:px-8 py-16 tablet:py-24 w-full">
        <div className="max-w-2xl">
          <EyebrowLabel tone="dark">Digital Transformation Partner</EyebrowLabel>

          <h1 className="heading-inverse mt-5 font-landing-display font-medium leading-[1.05] text-[clamp(2.5rem,5.5vw,4rem)]">
            Digital transformation
            <br />
            for African schools.
          </h1>

          <p className="mt-5 font-landing-display italic text-h2 text-white">
            Helping African schools build smarter, more connected operations.
          </p>

          <p className="mt-4 text-body text-white/80 max-w-xl">
            From admissions to graduation, SchoolAid replaces paper-based
            administration, disconnected spreadsheets, and manual processes
            with connected digital operations that improve efficiency,
            strengthen communication, and preserve every student&rsquo;s
            educational journey.
          </p>

          <p className="mt-4 text-body font-semibold text-white max-w-xl">
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
              <Button
                variant="ghost"
                size="lg"
                icon={<Calendar className="w-4 h-4" />}
                fullWidth
                className="!text-white border-2 border-white/50 hover:!bg-white/10 hover:no-underline"
              >
                Book a Discovery Call
              </Button>
            </a>
          </div>

          <p className="mt-6 font-mono text-caption uppercase tracking-wide text-white/60">
            Trusted by schools committed to building the future of education.
          </p>
        </div>
      </div>
    </section>
  );
}
