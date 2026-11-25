import Link from "next/link";

/**
 * Finance → Settings.
 *
 * A hub, not a form. These are the things a bursar changes rarely and should not
 * have to hunt for among the daily screens. Each card links to the screen that
 * owns the setting, so there is still exactly one place to edit a bank account,
 * one place to change the currency, and one checklist.
 */

const CARDS = [
  {
    href: "/school-admin/finance/accounts",
    title: "Bank accounts",
    body: "Where parents pay in. Printed on every receipt, and selectable when you record a transfer or POS payment.",
    action: "Manage accounts",
  },
  {
    href: "/school-admin/profile",
    title: "Currency",
    body: "Naira by default. Changing it changes the symbol on fees, bills, payments, receipts and reports — nothing is hardcoded.",
    action: "Open school profile",
  },
  {
    href: "/school-admin/finance/setup",
    title: "Setup checklist",
    body: "The eight configuration steps, checked against your real records. Reading steps are marked Read and do not count.",
    action: "Open checklist",
  },
  {
    href: "/school-admin/finance/fees",
    title: "Fee setup",
    body: "Fee heads and the amount each class pays this term. Day to day it lives under Bills & Fees; listed here for completeness.",
    action: "Open fee setup",
  },
];

export default function FinanceSettingsPage() {
  return (
    <div className="space-y-4">
      <p className="text-caption text-text-secondary">
        Configuration for Finance. Nothing here changes today&apos;s figures — it changes what tomorrow expects.
      </p>

      <div className="grid grid-cols-1 tablet:grid-cols-2 gap-3">
        {CARDS.map((c) => (
          <div key={c.href} className="rounded-lg bg-surface border border-border p-4 flex flex-col gap-2">
            <p className="font-semibold text-text-primary">{c.title}</p>
            <p className="text-caption text-text-secondary leading-relaxed flex-1">{c.body}</p>
            <Link href={c.href} className="text-caption font-semibold text-primary underline self-start">
              {c.action} →
            </Link>
          </div>
        ))}
      </div>

      <p className="text-caption text-text-disabled">
        The audit trail lives in{" "}
        <Link href="/school-admin/finance/history" className="underline">
          Reports → History
        </Link>{" "}
        — who recorded, voided, waived or recalculated, and when.
      </p>
    </div>
  );
}
