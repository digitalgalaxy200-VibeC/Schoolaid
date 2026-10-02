import type { SiteSection } from "@/lib/site/types";

type FacilitiesSection = Extract<SiteSection, { kind: "facilities" }>;

export function Facilities({ section }: { section: FacilitiesSection }) {
  return (
    <section id="facilities" className="scroll-mt-16 py-16 sm:py-20 bg-white">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <span className="text-xs font-bold uppercase tracking-widest text-[var(--site-accent)]">
            World-Class Infrastructure
          </span>
          <h2 className="mt-1 text-2xl font-extrabold tracking-tight text-[var(--site-primary-dark)] sm:text-3xl">
            {section.heading}
          </h2>
          {section.subheading && (
            <p className="mt-3 text-sm sm:text-base text-gray-600 leading-relaxed">
              {section.subheading}
            </p>
          )}
        </div>

        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {section.items.map((item, index) => (
            <div
              key={index}
              className="group overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-sm transition-all hover:shadow-xl hover:border-[var(--site-primary)]/50"
            >
              {item.imageUrl ? (
                <div className="h-48 w-full overflow-hidden bg-gray-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.imageUrl}
                    alt={item.title}
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                </div>
              ) : (
                <div className="h-3 bg-gradient-to-r from-[var(--site-primary)] to-[var(--site-accent)]" />
              )}
              <div className="p-6">
                <h3 className="text-base font-bold text-gray-900 group-hover:text-[var(--site-primary)] transition-colors">
                  {item.title}
                </h3>
                <p className="mt-2 text-xs sm:text-sm leading-relaxed text-gray-600">
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
