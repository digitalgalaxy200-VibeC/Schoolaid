import { Reveal } from "./Reveal";
import { EyebrowLabel } from "./RecordCard";

export function Position() {
  return (
    <section className="grain-surface bg-primary-dark text-white">
      <div className="max-w-7xl mx-auto px-4 tablet:px-8 py-16 tablet:py-24">
        <Reveal className="max-w-3xl">
          <EyebrowLabel tone="dark">Our Position</EyebrowLabel>
          <h2 className="heading-inverse font-landing-display font-medium mt-4 text-[clamp(1.85rem,3.5vw,2.75rem)] leading-tight">
            SchoolAid is Africa&rsquo;s digital transformation partner for
            schools.
          </h2>
          <div className="mt-6 space-y-4 text-body-lg text-white/85">
            <p>
              We believe digital transformation is not about installing
              software. It is about helping schools redesign the way they
              operate. Every school is different.
            </p>
            <p>
              Instead of forcing schools to adapt to technology, SchoolAid
              works alongside school leaders to understand existing
              processes, identify opportunities for improvement, and
              implement digital systems that make everyday school management
              simpler, faster, and more connected.
            </p>
            <p className="font-semibold text-white">
              Our goal is simple. Help schools spend less time managing
              administration and more time delivering quality education.
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
