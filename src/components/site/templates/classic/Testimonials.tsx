import type { SiteSection } from "@/lib/site/types";

type TestimonialsSection = Extract<SiteSection, { kind: "testimonials" }>;

export function Testimonials({ section }: { section: TestimonialsSection }) {
  if (!section.items || section.items.length === 0) return null;

  return (
    <section id="testimonials" className="scroll-mt-16 bg-gray-50/70 py-14 sm:py-20 border-t border-gray-100">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="text-center max-w-2xl mx-auto mb-10 sm:mb-14">
          <span className="text-xs font-bold uppercase tracking-widest text-[var(--site-accent)]">
            Community Voices
          </span>
          <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-[var(--site-primary-dark)] sm:text-3xl">
            {section.heading}
          </h2>
          {section.subheading && (
            <p className="mt-3 text-sm sm:text-base text-gray-600 leading-relaxed">
              {section.subheading}
            </p>
          )}
        </div>

        {/* Grid: 1 col → 2 col (tablet) → 3 col (desktop) */}
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {section.items.map((item, index) => (
            <div
              key={index}
              className="flex flex-col justify-between rounded-2xl sm:rounded-3xl border border-gray-200/70 bg-white p-5 sm:p-6 shadow-sm transition-all hover:shadow-lg"
            >
              <div className="space-y-3">
                <div className="text-xl text-amber-400">★★★★★</div>
                <blockquote className="text-sm leading-relaxed text-gray-700">
                  &ldquo;{item.quote}&rdquo;
                </blockquote>
              </div>

              <div className="mt-5 flex items-center gap-3 border-t border-gray-100 pt-4">
                {item.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.avatarUrl}
                    alt={item.authorName}
                    className="h-10 w-10 rounded-full object-cover ring-2 ring-[var(--site-tint)] shrink-0"
                  />
                ) : (
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--site-tint)] text-xs font-bold text-[var(--site-primary-dark)]">
                    {item.authorName.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <h4 className="text-xs font-bold text-gray-900 truncate">{item.authorName}</h4>
                  <p className="text-[11px] font-medium text-gray-500 truncate">{item.role}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
