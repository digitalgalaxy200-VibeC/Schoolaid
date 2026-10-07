import type { SiteSection } from "@/lib/site/types";

type AboutSection = Extract<SiteSection, { kind: "about" }>;

export function About({ section }: { section: AboutSection }) {
  return (
    <section id="about" className="scroll-mt-16 py-16 sm:py-20 bg-white">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="grid items-center gap-10 lg:grid-cols-12">
          {/* Main Info */}
          <div className={section.imageUrl ? "lg:col-span-7" : "lg:col-span-10 lg:mx-auto"}>
            <div className="space-y-4">
              <span className="text-xs font-bold uppercase tracking-widest text-[var(--site-accent)]">
                About Our School
              </span>
              <h2 className="text-2xl font-extrabold tracking-tight text-[var(--site-primary-dark)] sm:text-3xl">
                {section.heading}
              </h2>
              <div className="mt-4 text-base leading-relaxed text-gray-700 space-y-4 whitespace-pre-line">
                {section.body}
              </div>
            </div>

            {/* Highlights List if available */}
            {section.highlights && section.highlights.length > 0 ? (
              <div className="mt-8 grid gap-3 sm:grid-cols-2">
                {section.highlights.map((h, i) => (
                  <div key={i} className="flex items-start gap-3 rounded-lg bg-[var(--site-tint)]/50 p-3">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--site-primary)] text-xs text-white">
                      ✓
                    </span>
                    <span className="text-sm font-medium text-gray-800">{h}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          {/* About Image */}
          {section.imageUrl ? (
            <div className="lg:col-span-5">
              <div className="overflow-hidden rounded-2xl border-2 border-gray-100 shadow-xl">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={section.imageUrl}
                  alt={section.heading}
                  className="h-80 w-full object-cover sm:h-96"
                />
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
