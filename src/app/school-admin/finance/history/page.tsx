"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, Badge, Input } from "@/components/ui";
import { money, fetchArray } from "@/components/finance/helpers";

// Finance → History — trace WHY a balance is what it is (Phase 4).
// Read-only timeline over payments, voids, waivers, adjustments, credits,
// credit applications, recalculation runs and fee-setup changes.

type HistoryEvent = {
  id: string;
  at: string;
  kind:
    | "fee_change"
    | "payment"
    | "void"
    | "adjustment"
    | "waiver"
    | "credit"
    | "credit_applied"
    | "recalc";
  title: string;
  detail: string | null;
  amount: number | null;
  student_name: string | null;
  actor: string | null;
};

const KIND_FILTERS: { value: string; label: string }[] = [
  { value: "", label: "All activity" },
  { value: "payment", label: "Payments" },
  { value: "void", label: "Voids" },
  { value: "waiver", label: "Waivers" },
  { value: "adjustment", label: "Adjustments" },
  { value: "credit", label: "Credits" },
  { value: "credit_applied", label: "Credit applied" },
  { value: "recalc", label: "Recalcs" },
  { value: "fee_change", label: "Fee setup" },
];

const badgeFor = (k: HistoryEvent["kind"]): "success" | "error" | "warning" | "info" | "default" => {
  switch (k) {
    case "payment":
    case "credit":
    case "credit_applied":
      return "success";
    case "void":
      return "error";
    case "waiver":
    case "adjustment":
      return "warning";
    case "recalc":
      return "info";
    default:
      return "default";
  }
};

export default function FinanceHistoryPage() {
  const [events, setEvents] = useState<HistoryEvent[]>([]);
  const [kind, setKind] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    const q = kind ? `?kind=${encodeURIComponent(kind)}` : "";
    fetchArray<HistoryEvent>(`/api/school-admin/finance/history${q}`).then((rows) => {
      setEvents(rows);
      setLoading(false);
    });
  }, [kind]);
  useEffect(() => load(), [load]);

  const filtered = events.filter((e) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (e.student_name || "").toLowerCase().includes(q) || (e.title || "").toLowerCase().includes(q) || (e.detail || "").toLowerCase().includes(q);
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col tablet:flex-row gap-3 tablet:items-end justify-between">
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          {KIND_FILTERS.map((k) => (
            <button
              key={k.value}
              onClick={() => setKind(k.value)}
              className={`px-3 py-1.5 rounded-full text-caption font-semibold whitespace-nowrap border transition-colors ${
                kind === k.value ? "bg-primary text-text-inverse border-primary" : "bg-surface text-text-secondary border-border"
              }`}
            >
              {k.label}
            </button>
          ))}
        </div>
        <div className="w-full tablet:w-64">
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search student or event…" />
        </div>
      </div>

      {loading ? (
        <p className="text-caption text-text-secondary py-10 text-center">Loading…</p>
      ) : filtered.length === 0 ? (
        <Card padding="md" className="text-center">
          <p className="text-caption text-text-secondary">
            No history entries yet. Financial actions — payments, fee changes, waivers, recalcs, credits — will appear here as they happen.
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((e) => (
            <div key={e.id} className="rounded-lg bg-surface border border-border px-4 py-3">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={badgeFor(e.kind)}>{e.kind.replace("_", " ")}</Badge>
                    <p className="font-semibold text-text-primary text-small">{e.title}</p>
                  </div>
                  {e.detail && <p className="text-caption text-text-secondary mt-1">{e.detail}</p>}
                  <p className="text-caption text-text-disabled mt-1">
                    {new Date(e.at).toLocaleString()}
                    {e.student_name ? ` · ${e.student_name}` : ""}
                    {e.actor ? ` · by ${e.actor}` : ""}
                  </p>
                </div>
                {e.amount !== null && <p className="font-bold text-text-primary shrink-0">{money(e.amount)}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
