import type { CSSProperties } from "react";
import type { SiteViewModel } from "@/lib/site/types";
import { About } from "./templates/classic/About";
import { AdmissionsSteps } from "./templates/classic/AdmissionsSteps";
import { AnnouncementBar } from "./templates/classic/AnnouncementBar";
import { Blog } from "./templates/classic/Blog";
import { Contact } from "./templates/classic/Contact";
import { Events } from "./templates/classic/Events";
import { Facilities } from "./templates/classic/Facilities";
import { Faq } from "./templates/classic/Faq";
import { Footer } from "./templates/classic/Footer";
import { Gallery } from "./templates/classic/Gallery";
import { Hero } from "./templates/classic/Hero";
import { Highlights } from "./templates/classic/Highlights";
import { Navbar } from "./templates/classic/Navbar";
import { PrincipalMessage } from "./templates/classic/PrincipalMessage";
import { Programs } from "./templates/classic/Programs";
import { Testimonials } from "./templates/classic/Testimonials";
import { Values } from "./templates/classic/Values";

/**
 * Maps a validated site model onto the template's section components, and
 * applies the school's palette via CSS custom properties.
 *
 * The outer article sets overflow-x: hidden so no section can produce
 * horizontal scrollbars on mobile, even with negative-margin decorations.
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

  // Check if there's an active top notice section
  const noticeSection = site.sections.find((s) => s.kind === "notice");

  return (
    <article
      style={theme}
      className="min-h-screen overflow-x-hidden bg-white text-gray-900 font-sans antialiased selection:bg-[var(--site-tint)] selection:text-[var(--site-primary-dark)]"
    >
      {/* Optional Top Announcement Bar */}
      {noticeSection && <AnnouncementBar section={noticeSection} />}

      {/* Sticky Header Navbar */}
      <Navbar school={site.school} />

      {/* Render Sections in configured sort order */}
      <main>
        {site.sections.map((section, index) => {
          const key = `${section.kind}-${index}`;

          switch (section.kind) {
            case "notice":
              return null; // Rendered at the very top above navbar
            case "hero":
              return <Hero key={key} school={site.school} section={section} />;
            case "values":
              return <Values key={key} section={section} />;
            case "about":
              return <About key={key} section={section} />;
            case "programs":
              return <Programs key={key} section={section} />;
            case "facilities":
              return <Facilities key={key} section={section} />;
            case "principal_message":
              return <PrincipalMessage key={key} section={section} />;
            case "highlights":
              return <Highlights key={key} section={section} />;
            case "testimonials":
              return <Testimonials key={key} section={section} />;
            case "admissions_steps":
              return <AdmissionsSteps key={key} section={section} />;
            case "events":
              return <Events key={key} section={section} />;
            case "faq":
              return <Faq key={key} section={section} />;
            case "gallery":
              return <Gallery key={key} section={section} />;
            case "blog":
              return <Blog key={key} section={section} />;
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
