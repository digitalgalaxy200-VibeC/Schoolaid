import type { CSSProperties } from "react";
import type { SiteViewModel } from "@/lib/site/types";
import { About } from "./templates/classic/About";
import { Contact } from "./templates/classic/Contact";
import { Hero } from "./templates/classic/Hero";
import { PrincipalMessage } from "./templates/classic/PrincipalMessage";
import { Programs } from "./templates/classic/Programs";

/**
 * Maps a validated site model onto the template's section components, and
 * applies the school's palette.
 *
 * HOW THEMING WORKS HERE
 * ----------------------
 * The palette is published as CSS custom properties on this wrapper, and every
 * template component reads them (`bg-[var(--site-tint)]`). That is deliberate:
 * the app's own tokens live in a Tailwind `@theme inline` block, whose values
 * are inlined at build time and therefore cannot vary per school. Custom
 * properties have no such problem — one page, one wrapper, and only that
 * subtree is affected. SchoolAid's own screens are untouched by construction.
 *
 * WHY THE SWITCH IS EXHAUSTIVE AND HAS NO `default`
 * ------------------------------------------------
 * Every section kind the contract allows must render *something*; a missing
 * case should fail the build, not silently publish a blank space on a school's
 * website. Adding a kind to the union therefore forces a decision here.
 */
export function SiteRenderer({ site }: { site: SiteViewModel }) {
  const { colors } = site.theme;

  const theme = {
    "--site-primary": colors.primary,
    "--site-primary-dark": colors.primaryDark,
    "--site-accent": colors.accent,
    "--site-tint": colors.tint,
    "--site-on-primary": colors.onPrimary,
  } as CSSProperties;

  return (
    <article style={theme} className="text-gray-900">
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
            return <Contact key={key} school={site.school} section={section} contact={site.contact} />;
        }
      })}
    </article>
  );
}
