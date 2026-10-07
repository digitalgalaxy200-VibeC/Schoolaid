import type { SiteSection } from "@/lib/site/types";

type ProgramsSection = Extract<SiteSection, { kind: "programs" }>;

export function Programs({ section }: { section: ProgramsSection }) {
  return (
    <section id="programs" className="scroll-mt-16 py-16 sm:py-20 bg-gray-50/50">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <span className="text-xs font-bold uppercase tracking-widest text-[var(--site-accent)]">
            Curriculum & Levels
          </span>
          <h2 className="mt-1 text-2xl font-extrabold tracking-tight text-[var(--site-primary-dark)] sm:text-3xl">
            {section.heading}
          </h2>
          {section.intro ? (
            <p className="mt-3 text-base text-gray-600 leading-relaxed">
              {section.intro}
            </p>
          ) : null}
        </div>

        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {section.items.map((item, index) => (
            <div
              key={index}
              className="group relative flex flex-col overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-xl hover:border-[var(--site-primary)]/40"
            >
              {/* Optional Item Image */}
              {item.imageUrl ? (
                <div className="h-44 w-full overflow-hidden bg-gray-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.imageUrl}
                    alt={item.name}
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                </div>
              ) : (
                <div className="h-3 bg-gradient-to-r from-[var(--site-primary)] to-[var(--site-accent)]" />
              )}

              <div className="flex flex-1 flex-col p-6">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-lg font-bold text-gray-900 group-hover:text-[var(--site-primary)] transition-colors">
                    {item.name}
                  </h3>
                  {item.badge ? (
                    <span className="rounded-full bg-[var(--site-tint)] px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider text-[var(--site-primary-dark)]">
                      {item.badge}
                    </span>
                  ) : null}
                </div>

                <p className="mt-3 text-base leading-relaxed text-gray-600 flex-1">
                  {item.description}
                </p>

                <div className="mt-6 pt-4 border-t border-gray-100 flex items-center justify-between">
                  <a
                    href="#contact"
                    className="text-sm font-semibold text-[var(--site-primary)] group-hover:underline inline-flex items-center gap-1"
                  >
                    Inquire for admission →
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
