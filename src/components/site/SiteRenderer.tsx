import type { SiteViewModel } from "@/lib/site/types";
import { About } from "./templates/classic/About";
import { Contact } from "./templates/classic/Contact";
import { Hero } from "./templates/classic/Hero";
import { PrincipalMessage } from "./templates/classic/PrincipalMessage";
import { Programs } from "./templates/classic/Programs";

/**
 * Maps a validated site model onto the template's section components.
 *
 * WHY THE SWITCH IS EXHAUSTIVE AND HAS NO `default`
 * ------------------------------------------------
 * Every section kind the contract allows must render *something*; a missing
 * case should fail the build, not silently publish a blank space on a school's
 * website. Adding a kind to the union therefore forces a decision here, which
 * is the point.
 *
 * The renderer never receives a database row and never queries: it is handed
 * the resolver's frozen view-model and nothing else.
 */
export function SiteRenderer({ site }: { site: SiteViewModel }) {
  return (
    <article className="text-gray-900">
      {site.sections.map((section, index) => {
        const key = `${section.kind}-${index}`;

        switch (section.kind) {
          case "hero":
            return <Hero key={key} school={site.school} section={section} />;
          case "about":
            return <About key={key} section={section} />;
          case "programs":
            return <Programs key={key} section={section} />;
          case "principal_message":
            return <PrincipalMessage key={key} section={section} />;
          case "contact":
            return <Contact key={key} school={site.school} section={section} />;
        }
      })}
    </article>
  );
}
