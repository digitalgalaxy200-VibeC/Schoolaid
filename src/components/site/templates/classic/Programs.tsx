import type { SiteSection } from "@/lib/site/types";

type ProgramsSection = Extract<SiteSection, { kind: "programs" }>;

/**
 * Classic template — programmes.
 *
 * The first repeatable-list section. The contract bounds the list (1–12 items),
 * so the grid can be laid out without defensive code.
 */
export function Programs({ section }: { section: ProgramsSection }) {
  return (
    <section className="border-y border-gray-200 bg-gray-50">
      <div className="mx-auto max-w-4xl px-6 py-14">
        <h2 className="text-2xl font-semibold text-gray-900">{section.heading}</h2>

        <ul className="mt-8 grid gap-6 sm:grid-cols-2">
          {section.items.map((item) => (
            <li
              key={item.name}
              className="rounded border border-gray-200 bg-white p-5 shadow-sm"
            >
              <h3 className="font-semibold text-gray-900">{item.name}</h3>
              <p className="mt-2 text-sm leading-relaxed text-gray-600">{item.description}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
