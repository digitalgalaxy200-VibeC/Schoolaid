"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Finance section shell — sticky header + mobile-friendly scrollable pill tabs.
// Pure navigation; term/session filtering lives inside each page.

const TABS = [
  { key: "overview", href: "/school-admin/finance", label: "📊 Overview", exact: true },
  { key: "fees", href: "/school-admin/finance/fees", label: "🏷️ Fee Setup", exact: false },
  { key: "billing", href: "/school-admin/finance/billing", label: "🧾 Billing", exact: false },
  { key: "payments", href: "/school-admin/finance/payments", label: "💳 Payments", exact: false },
  { key: "credits", href: "/school-admin/finance/credits", label: "💰 Credits", exact: false },
  { key: "history", href: "/school-admin/finance/history", label: "📜 History", exact: false },
  { key: "reports", href: "/school-admin/finance/reports", label: "📈 Reports", exact: false },
];

export default function FinanceLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const isActive = (t: (typeof TABS)[number]) =>
    t.exact ? pathname === t.href : pathname.startsWith(t.href + "/") || pathname === t.href;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-h1 font-bold text-text-primary">Finance</h1>
        <p className="text-caption text-text-secondary mt-1">
          What the school expects, what has been collected, and what is still owed.
        </p>
      </div>

      {/* Pill tabs — scrollable on mobile */}
      <nav className="sticky top-0 z-20 -mx-1 px-1 pt-2 pb-1 bg-bg">
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={t.href}
              className={`px-4 py-2 rounded-full text-caption font-semibold whitespace-nowrap transition-colors ${
                isActive(t)
                  ? "bg-primary text-text-inverse shadow-sm"
                  : "bg-surface text-text-secondary border border-border hover:bg-primary-light hover:text-primary"
              }`}
            >
              {t.label}
            </Link>
          ))}
        </div>
      </nav>

      <div>{children}</div>
    </div>
  );
}
