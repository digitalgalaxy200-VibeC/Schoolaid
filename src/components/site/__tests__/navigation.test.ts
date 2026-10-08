import { describe, it, expect } from "vitest";
import { footerNavItems, headerNavItems, hasSection } from "@/components/site/templates/classic/navigation";
import type { SiteSection } from "@/lib/site/types";

/**
 * The menu rule: a link exists only when its block does.
 *
 * The flag that matters here is upstream — the resolver never puts a hidden
 * section (`is_visible: false`) into `site.sections` — so these tests speak
 * the only language the template has: sections that are present get links,
 * sections that are absent get nothing. The complaint this answers was found
 * on staging: the menu offered Gallery, Blog and Events on a website where
 * none of the three had been switched on.
 */

const section = (kind: SiteSection["kind"]): SiteSection => ({ kind }) as SiteSection;
const sections = (...kinds: SiteSection["kind"][]): SiteSection[] => kinds.map(section);

describe("headerNavItems", () => {
  it("offers no link for a block the school has not switched on", () => {
    // About and Contact only — no Gallery, Blog or Events anywhere.
    const links = headerNavItems(sections("about", "contact"));

    expect(links).toEqual([
      { label: "About", href: "#about" },
      { label: "Contact", href: "#contact" },
    ]);
  });

  it("returns nothing at all when nothing is switched on", () => {
    expect(headerNavItems([])).toEqual([]);
  });

  it("keeps the template's own order, not the document's", () => {
    // Document order is the reverse of the menu's; the menu must not reshuffle.
    const links = headerNavItems(sections("contact", "events", "blog", "gallery", "about"));

    expect(links.map((l) => l.label)).toEqual(["About", "Gallery", "Blog", "Events", "Contact"]);
  });

  it("links every kind it offers, to the anchor that kind renders", () => {
    const links = headerNavItems(
      sections("about", "programs", "highlights", "gallery", "blog", "events", "contact"),
    );

    expect(links).toEqual([
      { label: "About", href: "#about" },
      { label: "Academics", href: "#programs" },
      { label: "Highlights", href: "#highlights" },
      { label: "Gallery", href: "#gallery" },
      { label: "Blog", href: "#blog" },
      { label: "Events", href: "#events" },
      { label: "Contact", href: "#contact" },
    ]);
  });

  it("never offers a kind the template does not link to", () => {
    // values/facilities/faq/testimonials/admissions_steps exist as sections,
    // but have never been menu items — presence must not invent one.
    const links = headerNavItems(sections("values", "facilities", "faq", "testimonials", "admissions_steps"));

    expect(links).toEqual([]);
  });
});

describe("footerNavItems", () => {
  it("applies the same rule with the footer's own vocabulary", () => {
    const links = footerNavItems(sections("about", "principal_message"));

    expect(links).toEqual([
      { label: "About the School", href: "#about" },
      { label: "Principal's Message", href: "#principal" },
    ]);
  });

  it("returns nothing when nothing is switched on", () => {
    expect(footerNavItems([])).toEqual([]);
  });

  it("maps each label to the anchor its section actually renders", () => {
    const links = footerNavItems(sections("about", "programs", "principal_message", "gallery", "contact"));

    expect(links).toEqual([
      { label: "About the School", href: "#about" },
      { label: "Academic Programmes", href: "#programs" },
      { label: "Principal's Message", href: "#principal" },
      { label: "Campus Gallery", href: "#gallery" },
      { label: "Contact & Location", href: "#contact" },
    ]);
  });
});

describe("hasSection", () => {
  it("answers from the sections actually present", () => {
    expect(hasSection(sections("about", "contact"), "contact")).toBe(true);
    expect(hasSection(sections("about"), "contact")).toBe(false);
    expect(hasSection([], "notice")).toBe(false);
  });
});
