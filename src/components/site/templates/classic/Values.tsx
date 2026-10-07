import type { SiteSection } from "@/lib/site/types";

type ValuesSection = Extract<SiteSection, { kind: "values" }>;

export function Values({ section }: { section: ValuesSection }) {
  return (
    <section id="values" className="scroll-mt-16 bg-[var(--site-tint)]/30 py-16 sm:py-20 border-y border-gray-100">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <span className="text-xs font-bold uppercase tracking-widest text-[var(--site-accent)]">
            Our Foundation
          </span>
          <h2 className="mt-1 text-2xl font-extrabold tracking-tight text-[var(--site-primary-dark)] sm:text-3xl">
            {section.heading}
          </h2>
        </div>

        {/* Mission & Vision Dual Cards */}
        {(section.mission || section.vision) && (
          <div className="mb-12 grid gap-6 md:grid-cols-2">
            {section.mission && (
              <div className="rounded-3xl border border-gray-200/80 bg-white p-8 shadow-sm transition-all hover:shadow-md">
                <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--site-tint)] text-2xl text-[var(--site-primary)]">
                  🎯
                </div>
                <h3 className="text-lg font-bold text-gray-900">Our Mission</h3>
                <p className="mt-2 text-base leading-relaxed text-gray-600">
                  {section.mission}
                </p>
              </div>
            )}
            {section.vision && (
              <div className="rounded-3xl border border-gray-200/80 bg-white p-8 shadow-sm transition-all hover:shadow-md">
                <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--site-tint)] text-2xl text-[var(--site-primary)]">
                  🔭
                </div>
                <h3 className="text-lg font-bold text-gray-900">Our Vision</h3>
                <p className="mt-2 text-base leading-relaxed text-gray-600">
                  {section.vision}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Core Values Grid */}
        {section.items && section.items.length > 0 && (
          <div>
            <h3 className="text-center text-xs font-bold uppercase tracking-wider text-gray-500 mb-6">
              Our Core Values
            </h3>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {section.items.map((item, index) => (
                <div
                  key={index}
                  className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm transition-transform hover:-translate-y-1"
                >
                  <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--site-tint)] text-xl">
                    {item.icon || "💎"}
                  </div>
                  <h4 className="text-lg font-semibold text-gray-900">{item.title}</h4>
                  <p className="mt-2 text-base leading-relaxed text-gray-600">
                    {item.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
