import type { SiteSection } from "@/lib/site/types";

type EventsSection = Extract<SiteSection, { kind: "events" }>;

export function Events({ section }: { section: EventsSection }) {
  return (
    <section id="events" className="scroll-mt-16 py-16 sm:py-20 bg-gray-50/60">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <span className="text-xs font-bold uppercase tracking-widest text-[var(--site-accent)]">
            School Calendar
          </span>
          <h2 className="mt-1 text-2xl font-extrabold tracking-tight text-[var(--site-primary-dark)] sm:text-3xl">
            {section.heading}
          </h2>
          {section.subheading && (
            <p className="mt-3 text-base text-gray-600 leading-relaxed">
              {section.subheading}
            </p>
          )}
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {section.items.map((item, index) => (
            <div
              key={index}
              className="flex flex-col rounded-3xl border border-gray-200/80 bg-white p-6 shadow-sm transition-all hover:shadow-lg"
            >
              <div className="flex items-center justify-between gap-2 mb-3">
                <span className="rounded-full bg-[var(--site-tint)] px-3 py-1 text-xs font-semibold text-[var(--site-primary-dark)]">
                  📅 {item.date}
                </span>
                {item.category && (
                  <span className="text-xs font-bold uppercase tracking-wider text-[var(--site-accent)]">
                    {item.category}
                  </span>
                )}
              </div>

              <h3 className="text-lg font-semibold text-gray-900 line-clamp-2">{item.title}</h3>

              <div className="mt-4 pt-4 border-t border-gray-100 text-sm text-gray-500 space-y-1.5 flex-1">
                {item.time && (
                  <div className="flex items-center gap-2">
                    <span>⏰</span>
                    <span>{item.time}</span>
                  </div>
                )}
                {item.location && (
                  <div className="flex items-center gap-2">
                    <span>📍</span>
                    <span>{item.location}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
