"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, Badge, Input } from "@/components/ui";
import { money, fetchArray } from "@/components/finance/helpers";

// Finance → History — trace WHY a balance is what it is (Phase 4).
// Read-only timeline over payments, voids, waivers, adjustments (incl. the
// optional-fee add/remove events from FIN-002), credits, credit applications,
// recalculation runs and fee-setup changes. Filters (kind, term, method,
// receipt number, date range) are query-backed; the free-text search narrows
// the loaded rows by student/event text.

type HistoryEvent = {
  id: string;
  at: string;
  kind:
    | "fee_change"
    | "payment"
    | "void"
    | "adjustment"
    | "fee_added"
    | "fee_removed"
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

type Term = { id: string; name: string; is_active: boolean };

const KIND_FILTERS: { value: string; label: string }[] = [
  { value: "", label: "All activity" },
  { value: "payment", label: "Payments" },
  { value: "void", label: "Voids" },
  { value: "fee_added", label: "Fees added" },
  { value: "fee_removed", label: "Fees removed" },
  { value: "adjustment", label: "Adjustments" },
  { value: "waiver", label: "Waivers" },
  { value: "credit", label: "Credits" },
  { value: "credit_applied", label: "Credit applied" },
  { value: "recalc", label: "Recalcs" },
  { value: "fee_change", label: "Fee setup" },
];

const METHODS = ["", "Transfer", "Cash", "POS", "Cheque", "Online", "Other"];

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
    case "fee_removed":
      return "warning";
    case "fee_added":
    case "recalc":
      return "info";
    default:
      return "default";
  }
};

export default function FinanceHistoryPage() {
  const [events, setEvents] = useState<HistoryEvent[]>([]);
  const [terms, setTerms] = useState<Term[]>([]);
  const [kind, setKind] = useState("");
  const [termId, setTermId] = useState("");
  const [method, setMethod] = useState("");
  const [receiptNo, setReceiptNo] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchArray<Term>("/api/school-admin/terms").then(setTerms);
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (kind) params.set("kind", kind);
    if (termId) params.set("term_id", termId);
    if (method) params.set("method", method);
    if (receiptNo.trim()) params.set("receipt_number", receiptNo.trim());
    if (dateFrom) params.set("date_from", dateFrom);
    if (dateTo) params.set("date_to", `${dateTo}T23:59:59.999`);
    params.set("limit", "500");
    const q = params.toString();
    fetchArray<HistoryEvent>(`/api/school-admin/finance/history${q ? `?${q}` : ""}`).then((rows) => {
      setEvents(rows);
      setLoading(false);
    });
  }, [kind, termId, method, receiptNo, dateFrom, dateTo]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const hasFilters = kind !== "" || termId !== "" || method !== "" || receiptNo !== "" || dateFrom !== "" || dateTo !== "";

  const filtered = events.filter((e) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (e.student_name || "").toLowerCase().includes(q) ||
      (e.title || "").toLowerCase().includes(q) ||
      (e.detail || "").toLowerCase().includes(q)
    );
  });

  const selectCls =
    "rounded-md border border-border bg-surface px-2 py-1.5 text-caption text-text-primary focus:outline-none focus:ring-2 focus:ring-primary";

  return (
    <div className="space-y-4">
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

      {/* Query-backed filters */}
      <Card padding="md" className="space-y-3">
        <div className="grid grid-cols-2 tablet:grid-cols-4 gap-3">
          <div>
            <label className="text-caption text-text-secondary block mb-1">Term</label>
            <select value={termId} onChange={(e) => setTermId(e.target.value)} className={`${selectCls} w-full`}>
              <option value="">All terms</option>
              {terms.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-caption text-text-secondary block mb-1">Payment method</label>
            <select value={method} onChange={(e) => setMethod(e.target.value)} className={`${selectCls} w-full`}>
              {METHODS.map((m) => (
                <option key={m || "all"} value={m}>
                  {m || "All methods"}
                </option>
              ))}
            </select>
          </div>
          <div className="col-span-2">
            <label className="text-caption text-text-secondary block mb-1">Receipt number</label>
            <Input value={receiptNo} onChange={(e) => setReceiptNo(e.target.value)} placeholder="e.g. RCP-0002" />
          </div>
          <div>
            <label className="text-caption text-text-secondary block mb-1">From</label>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div>
            <label className="text-caption text-text-secondary block mb-1">To</label>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
          <div className="col-span-2 flex items-end justify-end">
            {hasFilters && (
              <button
                onClick={() => {
                  setKind("");
                  setTermId("");
                  setMethod("");
                  setReceiptNo("");
                  setDateFrom("");
                  setDateTo("");
                }}
                className="text-caption font-semibold text-error underline"
              >
                Clear filters
              </button>
            )}
          </div>
        </div>
        <div className="w-full tablet:w-72">
          <label className="text-caption text-text-secondary block mb-1">Search loaded entries</label>
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Student or event text…" />
        </div>
      </Card>

      {loading && events.length === 0 ? (
        <p className="text-caption text-text-secondary py-10 text-center">Loading…</p>
      ) : filtered.length === 0 ? (
        <Card padding="md" className="text-center">
          <p className="text-caption text-text-secondary">
            No history entries match{hasFilters ? " these filters" : " yet"} — payments, fee changes, optional-fee adds/removes,
            waivers, recalcs and credits appear here as they happen.
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((e) => (
            <div key={e.id} className="rounded-lg bg-surface border border-border px-4 py-3">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={badgeFor(e.kind)}>
                      {e.kind === "fee_added" ? "fee added" : e.kind === "fee_removed" ? "fee removed" : e.kind.replace("_", " ")}
                    </Badge>
                    <p className="font-semibold text-text-primary text-small">{e.title}</p>
                  </div>
                  {e.detail && <p className="text-caption text-text-secondary mt-1">{e.detail}</p>}
                  <p className="text-caption text-text-disabled mt-1">
                    {new Date(e.at).toLocaleString()}
                    {e.student_name ? ` · ${e.student_name}` : ""}
                    {e.actor ? ` · by ${e.actor}` : ""}
                  </p>
                </div>
                {e.amount !== null && e.amount !== 0 && (
                  <p className="font-bold text-text-primary shrink-0">
                    {e.amount < 0 ? "−" : ""}
                    {money(Math.abs(e.amount))}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
