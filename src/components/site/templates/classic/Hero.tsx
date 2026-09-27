import type { PublicSchool, SiteSection } from "@/lib/site/types";

type HeroSection = Extract<SiteSection, { kind: "hero" }>;

/**
 * Classic template — hero.
 *
 * Platform-owned design: a school supplies the words and its identity, never
 * markup. The school's name, logo and motto come from the canonical record
 * (`schools`), not from the document, so they cannot drift between screens.
 */
export function Hero({ school, section }: { school: PublicSchool; section: HeroSection }) {
  return (
    <header className="border-b border-gray-200 bg-gray-50">
      <div className="mx-auto max-w-4xl px-6 py-16">
        <div className="flex items-center gap-4">
          {school.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={school.logoUrl}
              alt=""
              className="h-16 w-16 rounded object-cover"
            />
          ) : null}
          <h1 className="text-4xl font-bold tracking-tight text-gray-900">{school.name}</h1>
        </div>

        <p className="mt-8 text-2xl text-gray-800">{section.headline}</p>
        <p className="mt-2 text-lg text-gray-600">{section.subheadline}</p>

        {school.motto ? (
          <p className="mt-8 border-l-4 border-gray-300 pl-4 text-sm italic text-gray-500">
            {school.motto}
          </p>
        ) : null}
      </div>
    </header>
  );
}
