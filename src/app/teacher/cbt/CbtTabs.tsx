"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * The two halves of CBT, as tabs on the page they belong to.
 *
 * The sidebar used to carry "CBT Assessments" and "Question Bank" as two menu
 * entries — one job split into two places, and one more row in a menu that is
 * read on a phone as a bottom bar. The Question Bank is where the questions for
 * those assessments live, so it is a tab here instead.
 *
 * Only the two list pages show the strip: the editor and the marking screen are
 * a drill-down from one of these tabs, and repeating it there is noise.
 */

const TABS = [
  { label: "Assessments", href: "/teacher/cbt/assessments" },
  { label: "Question Bank", href: "/teacher/cbt/questions" },
] as const;

export function CbtTabs() {
  const pathname = usePathname();
  if (!TABS.some((tab) => tab.href === pathname)) return null;

  return (
    <div className="mb-6 border-b border-border">
      <nav className="-mb-px flex gap-1" aria-label="CBT sections">
        {TABS.map((tab) => {
          const active = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={`border-b-2 px-4 py-3 text-small font-semibold transition-colors ${
                active
                  ? "border-primary text-primary"
                  : "border-transparent text-text-secondary hover:text-text-primary"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
