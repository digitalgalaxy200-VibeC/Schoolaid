import type { PublicSchool, SiteSection } from "@/lib/site/types";

type ContactSection = Extract<SiteSection, { kind: "contact" }>;

/**
 * Classic template — contact.
 *
 * The heading and introduction are the school's content; the phone number,
 * email address and street address are read from the canonical school record,
 * so a change made once in School Settings appears here without a second edit.
 */
export function Contact({ school, section }: { school: PublicSchool; section: ContactSection }) {
  const hasDetails = Boolean(school.phone || school.email || school.address);

  return (
    <section className="border-t border-gray-200 bg-gray-50">
      <div className="mx-auto max-w-4xl px-6 py-14">
        <h2 className="text-2xl font-semibold text-gray-900">{section.heading}</h2>
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
                  <a className="underline hover:no-underline" href={`mailto:${school.email}`}>
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
      </div>
    </section>
  );
}
