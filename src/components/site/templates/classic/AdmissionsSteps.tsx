import type { SiteSection } from "@/lib/site/types";

type AdmissionsStepsSection = Extract<SiteSection, { kind: "admissions_steps" }>;

export function AdmissionsSteps({ section }: { section: AdmissionsStepsSection }) {
  return (
    <section id="admissions" className="scroll-mt-16 bg-white py-16 sm:py-20 border-t border-gray-100">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <span className="text-xs font-bold uppercase tracking-widest text-[var(--site-accent)]">
            How to Join Us
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

        {/* Steps Horizontal Grid */}
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {section.items.map((item, index) => (
            <div
              key={index}
              className="relative flex flex-col rounded-3xl border border-gray-200/80 bg-[var(--site-tint)]/20 p-6 transition-all hover:bg-[var(--site-tint)]/50"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--site-primary)] text-sm font-black text-white shadow-sm mb-4">
                {item.stepNumber || index + 1}
              </div>
              <h3 className="text-base font-bold text-gray-900">{item.title}</h3>
              <p className="mt-2 text-xs sm:text-sm leading-relaxed text-gray-600 flex-1">
                {item.description}
              </p>
            </div>
          ))}
        </div>

        {/* Prospectus or Action Banner */}
        <div className="mt-12 rounded-3xl bg-gradient-to-r from-[var(--site-primary)] to-[var(--site-primary-dark)] p-6 sm:p-8 text-white shadow-xl flex flex-col items-center justify-between gap-6 sm:flex-row">
          <div className="text-center sm:text-left w-full sm:w-auto">
            <h3 className="text-lg sm:text-xl font-extrabold">Have questions about admissions?</h3>
            <p className="text-xs sm:text-sm text-white/80 mt-1">
              Download our complete academic prospectus or contact our admissions desk.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto shrink-0">
            {section.prospectusUrl && (
              <a
                href={section.prospectusUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-xs font-bold text-gray-900 shadow-md transition-transform hover:scale-105"
              >
                📄 Download Prospectus
              </a>
            )}
            <a
              href="#contact"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--site-accent)] px-5 py-3 text-xs font-bold text-white shadow-md transition-transform hover:scale-105"
            >
              Contact Admissions
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
