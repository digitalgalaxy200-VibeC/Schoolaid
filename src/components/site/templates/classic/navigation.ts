import type { SiteSection } from "@/lib/site/types";

/**
 * What the template's menu and footer link to — and, just as importantly,
 * what they do NOT.
 *
 * The first websites carried a fixed menu — About, Academics, Highlights,
 * Gallery, Blog, Events, Contact — whether or not the school had switched
 * those blocks on. A school that had never enabled its gallery still offered
 * a "Gallery" link, which jumped to nothing: the menu pointed at sections the
 * dashboard had hidden.
 *
 * The resolver only ever puts sections a school has published AND switched on
 * into `site.sections` (`loadStoredDocument` enforces `is_visible` before
 * anything is validated), so deriving the menu from that list is the whole
 * fix: a hidden block has no link, and a block the school switches on again
 * gets its link back without anyone touching code.
 *
 * The ORDER here is the template's editorial order, not the document's. A
 * menu is read at a glance, and it must not reshuffle because a school moved
 * a block further down its own page.
 */

type NavEntry = { kind: SiteSection["kind"]; anchor: string; label: string };

/** The header menu, in template order. */
const HEADER_LINKS: NavEntry[] = [
  { kind: "about", anchor: "about", label: "About" },
  { kind: "programs", anchor: "programs", label: "Academics" },
  { kind: "highlights", anchor: "highlights", label: "Highlights" },
  { kind: "gallery", anchor: "gallery", label: "Gallery" },
  { kind: "blog", anchor: "blog", label: "Blog" },
  { kind: "events", anchor: "events", label: "Events" },
  { kind: "contact", anchor: "contact", label: "Contact" },
];

/**
 * The footer's quick links. Different vocabulary, same rule — and the anchor
 * is stated rather than assumed, because a section's DOM id and its kind are
 * not always the same word (`principal_message` renders as `#principal`).
 */
const FOOTER_LINKS: NavEntry[] = [
  { kind: "about", anchor: "about", label: "About the School" },
  { kind: "programs", anchor: "programs", label: "Academic Programmes" },
  { kind: "principal_message", anchor: "principal", label: "Principal's Message" },
  { kind: "gallery", anchor: "gallery", label: "Campus Gallery" },
  { kind: "contact", anchor: "contact", label: "Contact & Location" },
];

export type SiteNavItem = { label: string; href: string };

function linksFor(entries: NavEntry[], sections: SiteSection[]): SiteNavItem[] {
  return entries
    .filter((entry) => sections.some((section) => section.kind === entry.kind))
    .map((entry) => ({ label: entry.label, href: `#${entry.anchor}` }));
}

/** The header menu for a school that has exactly these sections switched on. */
export function headerNavItems(sections: SiteSection[]): SiteNavItem[] {
  return linksFor(HEADER_LINKS, sections);
}

/** The footer's quick links, by the same rule. */
export function footerNavItems(sections: SiteSection[]): SiteNavItem[] {
  return linksFor(FOOTER_LINKS, sections);
}

/** Whether one kind of block is switched on — used for the drawer's CTA. */
export function hasSection(sections: SiteSection[], kind: SiteSection["kind"]): boolean {
  return sections.some((section) => section.kind === kind);
}
