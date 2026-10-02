import type { SiteSection } from "@/lib/site/types";

type PrincipalMessageSection = Extract<SiteSection, { kind: "principal_message" }>;

export function PrincipalMessage({ section }: { section: PrincipalMessageSection }) {
  const authorName = section.authorName || "The School Leadership";
  const authorTitle = section.authorTitle || "Principal";

  return (
    <section id="principal" className="scroll-mt-16 bg-[var(--site-tint)]/40 py-16 sm:py-20 border-y border-gray-100">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="overflow-hidden rounded-3xl bg-white p-8 sm:p-12 shadow-xl ring-1 ring-black/5">
          <div className="grid items-center gap-8 md:grid-cols-12">
            {/* Principal Photo */}
            <div className="md:col-span-4 text-center">
              <div className="relative mx-auto inline-block">
                {section.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={section.imageUrl}
                    alt={authorName}
                    className="h-44 w-44 rounded-2xl object-cover shadow-md ring-4 ring-[var(--site-tint)] mx-auto"
                  />
                ) : (
                  <div className="flex h-44 w-44 items-center justify-center rounded-2xl bg-[var(--site-tint)] text-5xl font-black text-[var(--site-primary)] shadow-inner mx-auto ring-4 ring-white">
                    🎓
                  </div>
                )}
                <div className="mt-4">
                  <h3 className="text-base font-bold text-gray-900">{authorName}</h3>
                  <p className="text-xs font-medium text-[var(--site-accent)]">{authorTitle}</p>
                </div>
              </div>
            </div>

            {/* Message Body */}
            <div className="md:col-span-8 space-y-4">
              <span className="text-xs font-bold uppercase tracking-widest text-[var(--site-accent)]">
                Welcome Message
              </span>
              <h2 className="text-2xl font-extrabold tracking-tight text-[var(--site-primary-dark)] sm:text-3xl">
                {section.heading}
              </h2>
              <blockquote className="relative text-gray-700 leading-relaxed italic border-l-4 border-[var(--site-accent)] pl-5 space-y-2">
                <p className="text-base sm:text-lg">&ldquo;{section.message}&rdquo;</p>
              </blockquote>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
