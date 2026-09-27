import type { SiteSection } from "@/lib/site/types";

type AboutSection = Extract<SiteSection, { kind: "about" }>;

/** Classic template — about. Platform-owned. */
export function About({ section }: { section: AboutSection }) {
  return (
    <section className="mx-auto max-w-4xl px-6 py-14">
      <h2 className="text-2xl font-semibold text-gray-900">{section.heading}</h2>
      <p className="mt-4 leading-relaxed text-gray-700">{section.body}</p>
    </section>
  );
}
