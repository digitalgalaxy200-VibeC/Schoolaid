import type { CSSProperties } from "react";
import type { SiteViewModel } from "@/lib/site/types";
import { About } from "./templates/classic/About";
import { Contact } from "./templates/classic/Contact";
import { Footer } from "./templates/classic/Footer";
import { Gallery } from "./templates/classic/Gallery";
import { Hero } from "./templates/classic/Hero";
import { Highlights } from "./templates/classic/Highlights";
import { Navbar } from "./templates/classic/Navbar";
import { PrincipalMessage } from "./templates/classic/PrincipalMessage";
import { Programs } from "./templates/classic/Programs";

/**
 * Maps a validated site model onto the template's section components, and
 * applies the school's palette.
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
    <article style={theme} className="min-h-screen bg-white text-gray-900 font-sans antialiased selection:bg-[var(--site-tint)] selection:text-[var(--site-primary-dark)]">
      {/* Sticky Header Navbar */}
      <Navbar school={site.school} />

      {/* Render Sections in configured sort order */}
      <main>
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
            case "highlights":
              return <Highlights key={key} section={section} />;
            case "gallery":
              return <Gallery key={key} section={section} />;
            case "contact":
              return <Contact key={key} school={site.school} section={section} contact={site.contact} />;
          }
        })}
      </main>

      {/* Full Footer */}
      <Footer school={site.school} />
    </article>
  );
}
