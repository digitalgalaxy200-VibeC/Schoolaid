import type { SiteContact } from "@/lib/site/config";
import type { PublicSchool, SiteSection } from "@/lib/site/types";

type ContactSection = Extract<SiteSection, { kind: "contact" }>;

/** The channels a school may publish, in the order they appear on the page. */
const SOCIALS: { key: keyof SiteContact; label: string }[] = [
  { key: "whatsapp", label: "WhatsApp" },
  { key: "facebook", label: "Facebook" },
  { key: "instagram", label: "Instagram" },
  { key: "x", label: "X" },
  { key: "youtube", label: "YouTube" },
];

/**
 * Classic template — contact.
 *
 * Three sources, deliberately kept apart:
 *   heading and introduction — the school's content, from the document;
 *   phone, email and address — the canonical school record, so an edit made
 *     once in School Settings appears here without a second one;
 *   social links — the school's website configuration, because `schools` has
 *     no social columns and widening a core table for a marketing surface is
 *     the wrong trade.
 *
 * Links only: inbound forms are a separate feature with their own privacy and
 * spam work, and were explicitly deferred.
 */
export function Contact({
  school,
  section,
  contact,
}: {
  school: PublicSchool;
  section: ContactSection;
  contact: SiteContact;
}) {
  const hasDetails = Boolean(school.phone || school.email || school.address);
  const socials = SOCIALS.filter((social) => contact[social.key]);

  return (
    <section className="border-t border-gray-200 bg-[var(--site-tint)]">
      <div className="mx-auto max-w-4xl px-6 py-14">
        <h2 className="text-2xl font-semibold text-[var(--site-primary-dark)]">
          {section.heading}
        </h2>
        <p className="mt-4 text-gray-700">{section.intro}</p>

        {hasDetails ? (
          <dl className="mt-8 space-y-2 text-gray-700">
            {school.phone ? (
              <div className="flex gap-3">
                <dt className="w-20 font-medium text-gray-900">Phone</dt>
                <dd>
                  <a className="underline hover:no-underline" href={`tel:${school.phone}`}>
                    {school.phone}
                  </a>
                </dd>
              </div>
            ) : null}
            {school.email ? (
              <div className="flex gap-3">
                <dt className="w-20 font-medium text-gray-900">Email</dt>
                <dd>
                  <a
                    className="underline hover:no-underline"
                    href={`mailto:${school.email}`}
                  >
                    {school.email}
                  </a>
                </dd>
              </div>
            ) : null}
            {school.address ? (
              <div className="flex gap-3">
                <dt className="w-20 font-medium text-gray-900">Address</dt>
                <dd>{school.address}</dd>
              </div>
            ) : null}
          </dl>
        ) : null}

        {socials.length > 0 ? (
          <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2">
            {socials.map((social) => (
              <li key={social.key}>
                <a
                  className="font-medium text-[var(--site-primary)] underline hover:no-underline"
                  href={contact[social.key] as string}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  {social.label}
                </a>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
}
