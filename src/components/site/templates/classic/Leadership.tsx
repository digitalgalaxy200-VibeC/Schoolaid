import type { SiteSection } from "@/lib/site/types";

type LeadershipSection = Extract<SiteSection, { kind: "leadership" }>;

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0].charAt(0);
  const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : "";
  return `${first}${last}`.toUpperCase();
}

/**
 * The school's leadership team.
 *
 * A school that has not added anyone has nothing to render, so the block is
 * hidden entirely — the contract also refuses a visible block with no members.
 * Photos are optional; the placeholder is deterministic initials, not a generic
 * silhouette, so a school with no photography still looks deliberate.
 */
export function Leadership({ section }: { section: LeadershipSection }) {
  if (!section.members || section.members.length === 0) return null;

  return (
    <section id="leadership" className="scroll-mt-16 bg-[var(--site-tint)]/30 py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <span className="text-xs font-bold uppercase tracking-widest text-[var(--site-accent)]">
            Our Leadership
          </span>
          <h2 className="mt-1 text-2xl font-extrabold tracking-tight text-[var(--site-primary-dark)] sm:text-3xl">
            {section.heading}
          </h2>
          {section.subheading ? (
            <p className="mt-3 text-base text-gray-600 leading-relaxed">{section.subheading}</p>
          ) : null}
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {section.members.map((member, index) => (
            <article
              key={`${member.name}-${index}`}
              className="flex flex-col items-center rounded-2xl border border-gray-200/80 bg-white p-6 text-center shadow-sm transition-shadow hover:shadow-lg"
            >
              {member.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={member.photoUrl}
                  alt={member.name}
                  loading="lazy"
                  className="h-24 w-24 rounded-full object-cover ring-4 ring-[var(--site-tint)]"
                />
              ) : (
                <div
                  className="flex h-24 w-24 items-center justify-center rounded-full bg-[var(--site-tint)] text-2xl font-black text-[var(--site-primary-dark)] ring-4 ring-white"
                  aria-hidden="true"
                >
                  {initials(member.name)}
                </div>
              )}
              <h3 className="mt-4 text-lg font-semibold text-gray-900">{member.name}</h3>
              <p className="mt-1 text-sm font-medium uppercase tracking-wide text-[var(--site-accent)]">
                {member.title}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
