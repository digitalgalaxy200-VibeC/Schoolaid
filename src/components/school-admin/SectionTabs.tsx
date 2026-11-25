/**
 * The tabs inside one top-level section.
 *
 * People, Academics, Year-End, Website and Settings each own several screens.
 * They used to repeat every screen in the sidebar; the tab strip keeps the
 * sidebar at seven rows while making the section's full surface visible.
 */

"use client";

import Link from "next/link";
import type { NavTab } from "@/lib/school-admin/navigation";

type SectionTabsProps = {
  label: string;
  tabs: NavTab[];
  pathname: string;
};

function baseHref(href: string): string {
  return href.split("?")[0];
}

/**
 * The LONGEST matching tab wins.
 *
 * `/school-admin/year-end` is a prefix of `/school-admin/year-end/beginning-of-term`,
 * so a naive prefix check lights up both. The most specific destination is the
 * one the user is actually on.
 */
function activeTabHref(pathname: string, tabs: NavTab[]): string | null {
  const matches = tabs
    .map((tab) => baseHref(tab.href))
    .filter((base) => pathname === base || pathname.startsWith(base + "/"))
    .sort((a, b) => b.length - a.length);
  return matches[0] ?? null;
}

export function SectionTabs({ label, tabs, pathname }: SectionTabsProps) {
  if (tabs.length === 0) return null;

  const activeHref = activeTabHref(pathname, tabs);

  return (
    <nav
      aria-label={`${label} sections`}
      className="flex gap-1 overflow-x-auto border-b border-border -mx-1 px-1 mb-5"
    >
      {tabs.map((tab) => {
        const active = baseHref(tab.href) === activeHref;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            prefetch={true}
            aria-current={active ? "page" : undefined}
            className={`shrink-0 px-3 py-2 text-small font-semibold border-b-2 -mb-px transition-colors ${
              active
                ? "border-primary text-primary"
                : "border-transparent text-text-muted hover:text-text-primary"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
