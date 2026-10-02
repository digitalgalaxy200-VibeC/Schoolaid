import type { SiteSection } from "@/lib/site/types";

type HighlightsSection = Extract<SiteSection, { kind: "highlights" }>;

export function Highlights({ section }: { section: HighlightsSection }) {
  return (
    <section id="highlights" className="scroll-mt-16 py-16 sm:py-20 bg-white">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <span className="text-xs font-bold uppercase tracking-widest text-[var(--site-accent)]">
            Why Choose Us
          </span>
          <h2 className="mt-1 text-2xl font-extrabold tracking-tight text-[var(--site-primary-dark)] sm:text-3xl">
            {section.heading}
          </h2>
          {section.subheading ? (
            <p className="mt-3 text-sm sm:text-base text-gray-600 leading-relaxed">
              {section.subheading}
            </p>
          ) : null}
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {section.items.map((item, index) => (
            <div
              key={index}
              className="rounded-2xl border border-gray-100 bg-[var(--site-tint)]/30 p-6 transition-all hover:bg-[var(--site-tint)]/60 hover:shadow-md"
            >
              <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-white text-2xl shadow-sm ring-1 ring-gray-100">
                {item.icon || "✨"}
              </div>
              <h3 className="text-base font-bold text-gray-900">{item.title}</h3>
              <p className="mt-2 text-xs sm:text-sm leading-relaxed text-gray-600">
                {item.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
