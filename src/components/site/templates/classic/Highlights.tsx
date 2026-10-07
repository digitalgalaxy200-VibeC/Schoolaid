import type { SiteSection } from "@/lib/site/types";

type HighlightsSection = Extract<SiteSection, { kind: "highlights" }>;

const DEFAULT_ICONS = ["🏆", "📚", "🔬", "🎭", "⚽", "🎨", "💡", "🌱"];

export function Highlights({ section }: { section: HighlightsSection }) {
  if (!section.items || section.items.length === 0) return null;

  return (
    <section id="highlights" className="scroll-mt-16 py-14 sm:py-20 bg-white">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        {/* Header */}
        <div className="text-center max-w-2xl mx-auto mb-10 sm:mb-14">
          <span className="text-xs font-bold uppercase tracking-widest text-[var(--site-accent)]">
            Why Choose Us
          </span>
          <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-[var(--site-primary-dark)] sm:text-3xl">
            {section.heading}
          </h2>
          {section.subheading ? (
            <p className="mt-3 text-base text-gray-600 leading-relaxed">
              {section.subheading}
            </p>
          ) : null}
        </div>

        {/* Grid: 1 col → 2 col (tablet) → 3 col (desktop) */}
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {section.items.map((item, index) => (
            <div
              key={index}
              className="flex gap-4 rounded-2xl border border-gray-100 bg-[var(--site-tint)]/25 p-5 transition-all hover:bg-[var(--site-tint)]/60 hover:shadow-md hover:border-[var(--site-accent)]/30"
            >
              {/* Icon */}
              <div className="shrink-0 flex h-12 w-12 items-center justify-center rounded-xl bg-white text-2xl shadow-sm ring-1 ring-gray-100 self-start">
                {item.icon || DEFAULT_ICONS[index % DEFAULT_ICONS.length]}
              </div>
              {/* Text */}
              <div className="min-w-0">
                <h3 className="text-lg font-semibold text-gray-900 leading-snug">{item.title}</h3>
                <p className="mt-1.5 text-base leading-relaxed text-gray-600">
                  {item.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
