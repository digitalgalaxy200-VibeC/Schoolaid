"use client";

import { schoolTodayISO, termLabel } from "@/lib/school-admin/term";

/**
 * Finance — the term picker, and the warning that goes with a finished term.
 *
 * WHY A DROPDOWN
 * Term pills worked while a school had two or three terms. With sessions, a
 * school accumulates six or more, the labels carry the session ("First Term
 * 2026/27"), and the row scrolls off the right edge — so the one control that
 * decides what every figure on the page means was the hardest thing to operate.
 * A select shows the whole list, keyboard-navigable, in one line.
 *
 * WHY THE NOTICE
 * A bursar switching back to a closed term is doing something consequential:
 * receipts, balances and reports for that term change, and those are the numbers
 * a parent may already have a copy of. The warning is permanent while a past
 * term is selected — not a toast, not dismissible — because the condition lasts
 * as long as the selection does.
 */

export type FinanceTermOption = {
  id: string;
  name: string;
  start_date?: string | null;
  end_date?: string | null;
  session_name?: string | null;
  is_active?: boolean;
};

type Tone = "ended" | "current" | "upcoming";

export function termTone(term: FinanceTermOption, todayISO = schoolTodayISO()): Tone {
  const end = term.end_date ? String(term.end_date).slice(0, 10) : null;
  if (end && end < todayISO) return "ended";
  const start = term.start_date ? String(term.start_date).slice(0, 10) : null;
  if (start && start > todayISO) return "upcoming";
  return "current";
}

function optionLabel(term: FinanceTermOption, todayISO: string): string {
  const tone = termTone(term, todayISO);
  const suffix = tone === "ended" ? " — ended" : tone === "upcoming" ? " — upcoming" : " — current";
  return `${termLabel(term)}${suffix}`;
}

export function TermSelect({
  terms,
  value,
  onChange,
  label = "Term",
  disabled,
}: {
  terms: FinanceTermOption[];
  value: string;
  onChange: (id: string) => void;
  label?: string;
  disabled?: boolean;
}) {
  const today = schoolTodayISO();

  // Nothing to choose: say which term is in force rather than showing an empty box.
  if (terms.length <= 1) {
    const only = terms[0];
    return (
      <div className="flex items-center gap-2">
        <span className="text-caption font-semibold text-text-secondary uppercase tracking-wider">{label}</span>
        <span className="text-body font-semibold text-text-primary">{only ? termLabel(only) : "No term yet"}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 min-w-0">
      <label
        htmlFor="finance-term-select"
        className="text-caption font-semibold text-text-secondary uppercase tracking-wider whitespace-nowrap"
      >
        {label}
      </label>
      <select
        id="finance-term-select"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-[40px] min-w-0 max-w-full rounded-lg border border-border bg-surface px-3 text-body font-semibold text-text-primary focus:outline-none focus:border-primary"
      >
        {terms.map((t) => (
          <option key={t.id} value={t.id}>
            {optionLabel(t, today)}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * Rendered above the page whenever the selected term has already ended.
 * Deliberately not dismissible: the risk lasts exactly as long as the selection.
 */
export function PastTermNotice({ term }: { term: FinanceTermOption | null | undefined }) {
  if (!term) return null;

  const today = schoolTodayISO();
  if (termTone(term, today) !== "ended") return null;

  const endedOn = term.end_date ? String(term.end_date).slice(0, 10) : null;

  return (
    <div
      role="status"
      className="rounded-xl border border-warning/40 bg-warning-bg px-4 py-3"
    >
      <p className="text-caption font-bold uppercase tracking-wider text-warning">
        Working in a past term
      </p>
      <p className="text-body text-text-primary mt-0.5">
        You are in <b>{termLabel(term)}</b>
        {endedOn ? `, which ended on ${endedOn}` : ", which has ended"}. Payments, waivers, bills and
        corrections you record here change <b>historical financial records</b> — figures a parent may
        already hold a receipt for.
      </p>
      <p className="text-caption text-text-secondary mt-1">
        Switch to the current term above unless you genuinely need to correct the past.
      </p>
    </div>
  );
}
