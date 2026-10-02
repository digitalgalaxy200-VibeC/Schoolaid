import type { PublicSchool, SiteSection } from "@/lib/site/types";

type HeroSection = Extract<SiteSection, { kind: "hero" }>;

export function Hero({ school, section }: { school: PublicSchool; section: HeroSection }) {
  const ctaLabel = section.ctaText || "Apply Now";
  const ctaHref = section.ctaLink || "#contact";
  const secondaryLabel = section.secondaryCtaText || "Explore Academics";
  const secondaryHref = section.secondaryCtaLink || "#programs";

  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-[var(--site-tint)]/40 via-white to-white py-12 md:py-20">
      {/* Decorative top accent line */}
      <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-[var(--site-primary)] via-[var(--site-accent)] to-[var(--site-primary)]" />

      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="grid items-center gap-12 lg:grid-cols-12">
          {/* Text Content */}
          <div className={`space-y-6 ${section.imageUrl ? "lg:col-span-7" : "lg:col-span-10 lg:mx-auto text-center"}`}>
            {section.badgeText ? (
              <span className="inline-flex items-center gap-2 rounded-full border border-[var(--site-accent)]/30 bg-[var(--site-tint)] px-3.5 py-1 text-xs font-bold uppercase tracking-wider text-[var(--site-primary-dark)] shadow-sm">
                <span className="h-2 w-2 rounded-full bg-[var(--site-accent)] animate-pulse" />
                {section.badgeText}
              </span>
            ) : (
              <span className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3.5 py-1 text-xs font-semibold text-gray-700 shadow-sm">
                🎓 Welcome to {school.name}
              </span>
            )}

            <h1 className="text-3xl font-extrabold tracking-tight text-[var(--site-primary-dark)] sm:text-4xl md:text-5xl lg:leading-[1.15]">
              {section.headline}
            </h1>

            <p className="text-base text-gray-600 sm:text-lg sm:leading-relaxed max-w-2xl">
              {section.subheadline}
            </p>

            {school.motto ? (
              <p className="border-l-4 border-[var(--site-accent)] pl-4 text-sm italic font-medium text-gray-700">
                &ldquo;{school.motto}&rdquo;
              </p>
            ) : null}

            {/* Action Buttons */}
            <div className={`flex flex-wrap items-center gap-4 pt-2 ${section.imageUrl ? "" : "justify-center"}`}>
              <a
                href={ctaHref}
                className="inline-flex items-center justify-center rounded-xl bg-[var(--site-primary)] px-6 py-3.5 text-sm font-bold text-[var(--site-on-primary)] shadow-md transition-all hover:opacity-95 hover:shadow-lg active:scale-95"
              >
                {ctaLabel}
              </a>
              <a
                href={secondaryHref}
                className="inline-flex items-center justify-center rounded-xl border-2 border-gray-300 bg-white px-6 py-3.5 text-sm font-bold text-gray-800 shadow-sm transition-all hover:border-[var(--site-primary)] hover:text-[var(--site-primary)] hover:bg-gray-50 active:scale-95"
              >
                {secondaryLabel}
              </a>
            </div>
          </div>

          {/* Featured Hero Visual */}
          {section.imageUrl ? (
            <div className="lg:col-span-5">
              <div className="relative mx-auto max-w-md lg:max-w-none">
                <div className="overflow-hidden rounded-2xl border-4 border-white shadow-2xl ring-1 ring-black/10">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={section.imageUrl}
                    alt={section.headline}
                    className="h-80 w-full object-cover sm:h-96"
                  />
                </div>
                {/* Floating school crest badge */}
                {school.logoUrl ? (
                  <div className="absolute -bottom-5 -left-5 hidden sm:flex items-center gap-3 rounded-xl border border-gray-100 bg-white p-3 shadow-xl ring-1 ring-black/5">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={school.logoUrl} alt="" className="h-10 w-10 rounded-lg object-contain" />
                    <div>
                      <p className="text-xs font-bold text-gray-900 line-clamp-1">{school.name}</p>
                      <p className="text-[10px] text-gray-500 font-medium">Official Campus</p>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>

        {/* Stats Row */}
        {section.stats && section.stats.length > 0 ? (
          <div className="mt-14 grid grid-cols-2 gap-4 border-t border-gray-200/80 pt-10 sm:grid-cols-4">
            {section.stats.map((stat, i) => (
              <div
                key={i}
                className="rounded-xl border border-gray-100 bg-white p-4 text-center shadow-sm"
              >
                <div className="text-2xl font-black tracking-tight text-[var(--site-primary)] sm:text-3xl">
                  {stat.value}
                </div>
                <div className="mt-1 text-xs font-semibold uppercase tracking-wider text-gray-500">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
