import Image from "next/image";
import { ArrowRight, Calendar } from "lucide-react";
import { Button } from "@/components/ui";
import { Reveal } from "./Reveal";

// Photo: via Pexels (pexels.com/photo/confident-black-woman-in-a-modern-library-holding-a-book-and-smartphone-6684599).
// Pexels License — free for commercial use, no attribution required.
export function FinalCTA() {
  return (
    <section className="relative overflow-hidden">
      <Image
        src="/images/final-cta.jpg"
        alt="A student smiling, holding a book and a phone"
        fill
        sizes="100vw"
        className="object-cover object-[75%_center] grayscale-[30%] contrast-[1.05]"
      />
      <div className="absolute inset-0 bg-primary mix-blend-multiply opacity-80" />
      <div className="absolute inset-0 bg-gradient-to-t from-primary-dark/80 via-primary-dark/55 to-primary-dark/70" />

      <div className="relative max-w-7xl mx-auto px-4 tablet:px-8 py-16 tablet:py-24 text-center">
        <Reveal className="max-w-2xl mx-auto">
          <h2 className="heading-inverse font-landing-display font-medium text-[clamp(2rem,4vw,3.25rem)] leading-tight">
            Ready to begin your school&rsquo;s digital transformation?
          </h2>
          <p className="mt-5 text-body-lg text-white/85">
            Join a growing community of schools committed to building smarter
            operations, stronger communication, better educational
            experiences, and a future where every student&rsquo;s educational
            journey is securely preserved.
          </p>

          <div className="mt-8 flex flex-col tablet:flex-row gap-3 justify-center">
            <a href="mailto:partnerships@schoolaid.app?subject=Digital%20Transformation%20Assessment">
              <Button
                variant="accent"
                size="lg"
                icon={<ArrowRight className="w-4 h-4" />}
                fullWidth
              >
                Start Your School&rsquo;s Digital Transformation
              </Button>
            </a>
            <a href="mailto:partnerships@schoolaid.app?subject=Discovery%20Call%20Request">
              <Button
                variant="ghost"
                size="lg"
                icon={<Calendar className="w-4 h-4" />}
                fullWidth
                className="!text-white border-2 border-white/40 hover:!bg-white/10 hover:no-underline"
              >
                Book a Discovery Call
              </Button>
            </a>
          </div>

          <p className="mt-5 font-mono text-caption uppercase tracking-wide text-white/60">
            Assessment takes 10&ndash;15 minutes &middot; no obligation
          </p>
        </Reveal>
      </div>
    </section>
  );
}
