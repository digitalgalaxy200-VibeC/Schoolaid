/**
 * The school-admin menu, as data.
 *
 * SEVEN DESTINATIONS, NOT TWENTY-FOUR
 * -----------------------------------
 * The old sidebar listed every screen under eight collapsible groups, so
 * "Promote Students", "Graduated" and "Graduate Students" each took a row for
 * what is one year-end job, and five one-time setup screens competed with the
 * daily work. This model has seven top-level sections; the screens inside a
 * section are tabs on the page (see `SECTION_TABS`), not more sidebar rows.
 *
 * Kept outside the layout so tests can import it without React or Next.js. The
 * bottom bar has already been broken once by positional lookup
 * (`navStructure[1].items[0]`), so destinations are resolved BY HREF and pinned
 * by a test.
 */

export type NavTab = {
  label: string;
  href: string;
  /** Shown only when the Website Engine is enabled for this school. */
  requiresWebsite?: boolean;
  /** Shown only when the school has the CBT entitlement. */
  requiresCbt?: boolean;
  /** Shown only while a platform administrator is impersonating this school. */
  requiresImpersonation?: boolean;
};

export type NavSection = {
  key: SectionKey;
  label: string;
  href: string;
  icon: string;
  requiresWebsite?: boolean;
};

export type SectionKey =
  | "home"
  | "people"
  | "academics"
  | "finance"
  | "year-end"
  | "website"
  | "settings";

export type NavVisibility = {
  websiteEnabled: boolean;
  cbtEnabled: boolean;
  impersonated: boolean;
};

const ICONS = {
  home: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1",
  people: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z",
  academics: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
  finance: "M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z",
  "year-end": "M12 14l9-5-9-5-9 5 9 5zm0 0l6-3.333V15c0 1.657-2.686 3-6 3s-6-1.343-6-3v-4.333L12 14z",
  website: "M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  settings: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z",
} as const;

export const NAV_SECTIONS: NavSection[] = [
  { key: "home", label: "Home", href: "/school-admin/dashboard", icon: ICONS.home },
  { key: "people", label: "People", href: "/school-admin/students", icon: ICONS.people },
  { key: "academics", label: "Academics", href: "/school-admin/report-cards", icon: ICONS.academics },
  { key: "finance", label: "Finance", href: "/school-admin/finance", icon: ICONS.finance },
  { key: "year-end", label: "Term", href: "/school-admin/year-end", icon: ICONS["year-end"] },
  { key: "website", label: "Website", href: "/school-admin/website", icon: ICONS.website, requiresWebsite: true },
  { key: "settings", label: "Settings", href: "/school-admin/profile", icon: ICONS.settings },
];

/**
 * What each top-level section contains. Rendered as a tab strip on the section's
 * pages, so the sidebar can stay seven rows long.
 */
export const SECTION_TABS: Record<SectionKey, NavTab[]> = {
  home: [],
  people: [
    { label: "Students", href: "/school-admin/students" },
    { label: "Teachers", href: "/school-admin/teachers" },
    { label: "Classes", href: "/school-admin/classes" },
    { label: "Subjects", href: "/school-admin/subjects" },
    { label: "Teacher Assignments", href: "/school-admin/assignments" },
  ],
  academics: [
    { label: "Report Cards", href: "/school-admin/report-cards" },
    { label: "Score Entry", href: "/school-admin/score-entry" },
    { label: "CBT", href: "/school-admin/cbt", requiresCbt: true },
  ],
  finance: [],
  "year-end": [
    { label: "End of Term", href: "/school-admin/year-end" },
    { label: "Beginning of Term", href: "/school-admin/year-end/beginning-of-term" },
    { label: "Graduated", href: "/school-admin/graduated" },
  ],
  website: [
    { label: "School Website", href: "/school-admin/website" },
    { label: "Content", href: "/school-admin/website/content" },
    { label: "Media", href: "/school-admin/website/media" },
  ],
  settings: [
    { label: "School Profile", href: "/school-admin/profile" },
    { label: "School Setup", href: "/school-admin/setup", requiresImpersonation: true },
    { label: "Sessions & Terms", href: "/school-admin/sessions" },
    { label: "Academic Levels", href: "/school-admin/academic-levels" },
    { label: "Assessment Setup", href: "/school-admin/assessment" },
    { label: "Report Card Templates", href: "/school-admin/templates" },
    { label: "Card Display", href: "/school-admin/report-cards/settings" },
  ],
};

/** The four destinations on the phone bottom bar. Named by href, never index. */
export const BOTTOM_NAV_HREFS = [
  "/school-admin/dashboard",
  "/school-admin/students",
  "/school-admin/report-cards",
  "/school-admin/finance",
] as const;

const PEOPLE_PREFIXES = [
  "/school-admin/students",
  "/school-admin/teachers",
  "/school-admin/classes",
  "/school-admin/subjects",
  "/school-admin/assignments",
];

const YEAR_END_PREFIXES = [
  "/school-admin/year-end",
  "/school-admin/promotion",
  "/school-admin/graduate",
  "/school-admin/graduated",
];

const SETTINGS_PREFIXES = [
  "/school-admin/profile",
  "/school-admin/setup",
  "/school-admin/sessions",
  "/school-admin/academic-levels",
  "/school-admin/assessment",
  "/school-admin/templates",
];

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(prefix + "/");
}

/**
 * Which of the seven sections a URL belongs to.
 *
 * Order matters: `/school-admin/report-cards/settings` is a Settings page but
 * also starts with the Report Cards path, so the more specific rule runs first.
 */
export function sectionForPath(pathname: string): SectionKey | null {
  if (matchesPrefix(pathname, "/school-admin/report-cards/settings")) return "settings";
  if (matchesPrefix(pathname, "/school-admin/report-cards")) return "academics";
  if (matchesPrefix(pathname, "/school-admin/score-entry")) return "academics";
  if (matchesPrefix(pathname, "/school-admin/cbt")) return "academics";
  if (YEAR_END_PREFIXES.some((prefix) => matchesPrefix(pathname, prefix))) return "year-end";
  if (matchesPrefix(pathname, "/school-admin/finance")) return "finance";
  if (matchesPrefix(pathname, "/school-admin/website")) return "website";
  if (matchesPrefix(pathname, "/school-admin/dashboard")) return "home";
  if (PEOPLE_PREFIXES.some((prefix) => matchesPrefix(pathname, prefix))) return "people";
  if (SETTINGS_PREFIXES.some((prefix) => matchesPrefix(pathname, prefix))) return "settings";
  return null;
}

export function visibleNavSections(
  sections: NavSection[],
  options: NavVisibility,
): NavSection[] {
  return sections.filter((section) => !section.requiresWebsite || options.websiteEnabled);
}

export function visibleSectionTabs(
  key: SectionKey,
  options: NavVisibility,
): NavTab[] {
  return SECTION_TABS[key].filter(
    (tab) =>
      (!tab.requiresWebsite || options.websiteEnabled) &&
      (!tab.requiresCbt || options.cbtEnabled) &&
      (!tab.requiresImpersonation || options.impersonated),
  );
}

export function bottomNavItems(sections: NavSection[]): NavSection[] {
  return BOTTOM_NAV_HREFS
    .map((href) => sections.find((section) => section.href === href))
    .filter((section): section is NavSection => Boolean(section));
}
