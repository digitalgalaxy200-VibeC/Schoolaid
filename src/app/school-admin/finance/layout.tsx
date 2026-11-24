"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { setFinanceCurrency } from "@/components/finance/helpers";
import { useFinanceRole } from "@/components/finance/useFinanceRole";

// Finance section shell — sticky header + mobile-friendly scrollable tabs.
//
// FIVE TABS, NOT NINE. The bursar's jobs are: see the position (Overview), take
// money (Collect), set up what is owed (Bills & Fees), report (Reports), and
// configure the school (Settings). Fee setup, credits, the setup guide, bank
// accounts and history are still their own screens with their own URLs — they
// are just reached from the tab that owns them instead of being tabs. Nine pills
// pushed two off-screen behind a hidden scrollbar, so nobody found them anyway.

type FinanceTab = {
  key: string;
  href: string;
  label: string;
  /** Sub-screens that belong to this tab (keeps the tab lit while you are in them). */
  also?: string[];
  exact?: boolean;
};

const TABS: FinanceTab[] = [
  { key: "overview", href: "/school-admin/finance", label: "Overview", exact: true },
  { key: "collect", href: "/school-admin/finance/payments", label: "Collect" },
  {
    key: "bills",
    href: "/school-admin/finance/billing",
    label: "Bills & Fees",
    also: ["/school-admin/finance/fees", "/school-admin/finance/credits"],
  },
  {
    key: "reports",
    href: "/school-admin/finance/reports",
    label: "Reports",
    also: ["/school-admin/finance/history"],
  },
  {
    key: "settings",
    href: "/school-admin/finance/settings",
    label: "Settings",
    also: ["/school-admin/finance/accounts", "/school-admin/finance/setup"],
  },
];

export default function FinanceLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  // A bursar's job is the counter, not the position report. Sending them to
  // Collect on arrival saves a click every time they open Finance. They can
  // still reach Overview from the tab.
  const { role } = useFinanceRole();
  // Setup-guide progress chip (per school, resumable). Hidden once the school
  // finishes the guide or dismisses it; the Settings tab stays available.
  const [setup, setSetup] = useState<{ done_count: number; total: number } | null>(null);

  // Load the school's currency code once; every money() call in Finance
  // renders with the right symbol (defaults to NGN until this resolves).
  useEffect(() => {
    fetch("/api/school-admin/finance/currency")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.code) setFinanceCurrency(d.code);
      })
      .catch(() => {});

    fetch("/api/school-admin/finance/setup")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && !d.dismissed && d.done_count < d.total) setSetup({ done_count: d.done_count, total: d.total });
      })
      .catch(() => {});
  }, []);

  // A bursar opens Finance at the counter, not the report.
  useEffect(() => {
    if (role === "bursar" && pathname === "/school-admin/finance") {
      router.replace("/school-admin/finance/payments");
    }
  }, [role, pathname, router]);

  const isActive = (t: FinanceTab) => {
    const under = (href: string) => pathname === href || pathname.startsWith(href + "/");
    if (t.exact) return pathname === t.href;
    if (under(t.href)) return true;
    return (t.also || []).some(under);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-h1 font-bold text-text-primary">Finance</h1>
          <p className="text-caption text-text-secondary mt-1">
            What the school expects, what has been collected, and what is still owed.
          </p>
        </div>
        {setup && pathname !== "/school-admin/finance/setup" && pathname !== "/school-admin/finance/settings" && (
          <Link
            href="/school-admin/finance/setup"
            className="inline-flex items-center gap-1.5 rounded-full bg-primary-light text-primary px-3 py-1.5 text-caption font-semibold whitespace-nowrap"
          >
            Setup checklist · {setup.done_count}/{setup.total}
          </Link>
        )}
      </div>

      {/* Tabs — wrapped, never scrolled behind an invisible edge. */}
      <nav aria-label="Finance sections" className="sticky top-0 z-20 -mx-1 px-1 pt-2 pb-1 bg-bg">
        <div className="flex flex-wrap gap-2">
          {TABS.map((t) => {
            const active = isActive(t);
            return (
              <Link
                key={t.key}
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={`px-4 py-2 rounded-full text-caption font-semibold whitespace-nowrap transition-colors ${
                  active
                    ? "bg-primary text-text-inverse shadow-sm"
                    : "bg-surface text-text-secondary border border-border hover:bg-primary-light hover:text-primary"
                }`}
              >
                {t.label}
              </Link>
            );
          })}
        </div>
      </nav>

      <div>{children}</div>
    </div>
  );
}
