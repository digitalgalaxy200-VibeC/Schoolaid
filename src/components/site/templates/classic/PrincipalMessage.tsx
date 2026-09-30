import type { SiteSection } from "@/lib/site/types";

type PrincipalMessageSection = Extract<SiteSection, { kind: "principal_message" }>;

/**
 * Classic template — the principal's message.
 *
 * Deliberately unattributed: a person's name, title and photograph belong to
 * the staff listing, which the website will reference once it exists. Writing a
 * name into this section now would create a second record of a person that goes
 * stale the moment the staff list changes.
 */
export function PrincipalMessage({ section }: { section: PrincipalMessageSection }) {
  return (
    <section className="mx-auto max-w-4xl px-6 py-14">
      <h2 className="text-2xl font-semibold text-[var(--site-primary-dark)]">{section.heading}</h2>
      <blockquote className="mt-5 border-l-4 border-[var(--site-accent)] pl-5 italic leading-relaxed text-gray-700">
        {section.message}
      </blockquote>
    </section>
  );
}
