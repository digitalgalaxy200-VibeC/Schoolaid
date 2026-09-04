"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, Badge, Input, Button } from "@/components/ui";
import { money, fetchArray } from "@/components/finance/helpers";

// Finance → Credits — the school's credit ledger (Phase 3).
// Remaining credit is derived from applications. Applying credit happens on a
// student's bill (Billing → open bill → Available credits) — always explicit.

type CreditRow = {
  id: string;
  student_id: string;
  student_name: string;
  amount: number;
  applied_amount: number;
  remaining: number;
  status: string;
  reason: string | null;
  source: string;
  source_fee_name: string | null;
  created_at: string;
};

const STATUSES = [
  { value: "", label: "All" },
  { value: "open", label: "Open" },
  { value: "closed", label: "Closed" },
];

const sourceLabel = (s: string): string => {
  if (s === "fee_removed") return "Fee removed after payment";
  if (s === "overpayment") return "Overpayment";
  return "Fee reduced after payment";
};

export default function FinanceCreditsPage() {
  const [rows, setRows] = useState<CreditRow[]>([]);
  const [status, setStatus] = useState("open");
  const [search, setSearch] = useState("");

  const load = useCallback(() => {
    const q = status ? `?status=${encodeURIComponent(status)}` : "";
    fetchArray<CreditRow>(`/api/school-admin/finance/credits${q}`).then(setRows);
  }, [status]);
  useEffect(() => load(), [load]);

  const filtered = rows.filter((r) => !search || r.student_name.toLowerCase().includes(search.toLowerCase()));
  const totalRemaining = filtered.filter((r) => r.status === "open").reduce((s, r) => s + r.remaining, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-col tablet:flex-row gap-3 tablet:items-end justify-between">
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          {STATUSES.map((s) => (
            <button
              key={s.value}
              onClick={() => setStatus(s.value)}
              className={`px-3 py-1.5 rounded-full text-caption font-semibold whitespace-nowrap border transition-colors ${
                status === s.value ? "bg-primary text-text-inverse border-primary" : "bg-surface text-text-secondary border-border"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <a href={`/api/school-admin/finance/reports/export?type=credits${status ? `&status=${encodeURIComponent(status)}` : ""}`} target="_blank">
            <Button size="sm">⬇️ Export Excel</Button>
          </a>
          <div className="w-full tablet:w-64">
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search student…" />
          </div>
        </div>
      </div>

      <p className="text-caption text-text-secondary">
        {filtered.length} credit record{filtered.length === 1 ? "" : "s"}
        {status === "open" ? <> · <b className="text-success">{money(totalRemaining)}</b> available to apply</> : null}
      </p>

      <div className="space-y-2">
        {filtered.map((c) => (
          <div key={c.id} className="rounded-lg bg-surface border border-border px-4 py-3">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <p className="font-semibold text-text-primary truncate">{c.student_name}</p>
                <p className="text-caption text-text-secondary">
                  {sourceLabel(c.source)}
                  {c.source_fee_name ? ` · ${c.source_fee_name}` : ""} · {new Date(c.created_at).toLocaleDateString()}
                </p>
                {c.reason && <p className="text-caption text-text-disabled mt-0.5">{c.reason}</p>}
              </div>
              <div className="text-right shrink-0 space-y-0.5">
                <p className="font-bold text-text-primary">{money(c.remaining)}</p>
                <p className="text-caption text-text-secondary">
                  of {money(c.amount)} {c.applied_amount > 0 ? `· ${money(c.applied_amount)} applied` : ""}
                </p>
                <Badge variant={c.status === "open" ? "success" : "default"}>{c.status === "open" ? "Open" : "Applied"}</Badge>
              </div>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <Card padding="md" className="text-center">
            <p className="text-caption text-text-secondary">
              No credit records{status ? ` with status “${status}”` : ""} — credits are created automatically when a fee change
              leaves a student with more paid than owed.
            </p>
          </Card>
        )}
      </div>

      <p className="text-caption text-text-disabled">
        To apply credit to a bill, open the student’s bill under <b>Billing</b> → <b>Available credits</b> and choose the amount.
      </p>
    </div>
  );
}
