"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, Button, Badge, Input } from "@/components/ui";
import { money, moneyShort, billStatusLabel, paymentStatusLabel, fetchArray } from "@/components/finance/helpers";

// Finance → Reports
// Tabs: Outstanding · By Class · By Fee · Payments · Reconciliation
// Every figure comes from the reports/payments/reconciliation APIs (school-scoped).
// Exports hit /finance/reports/export with the same filters currently applied.

type Term = { id: string; name: string; is_active: boolean };
type Section = { id: string | null; name: string; classes: { id: string; name: string }[] };

type TabKey = "outstanding" | "classes" | "fees" | "payments" | "recon";

const TABS: { key: TabKey; label: string }[] = [
  { key: "outstanding", label: "😟 Outstanding" },
  { key: "classes", label: "🏫 By Class" },
  { key: "fees", label: "🏷️ By Fee" },
  { key: "payments", label: "💳 Payment register" },
  { key: "recon", label: "🛡️ Reconciliation" },
];

const OUT_STATUSES = [
  { value: "", label: "All" },
  { value: "unpaid", label: "Unpaid" },
  { value: "partial", label: "Partial" },
];

const PAY_STATUSES = [
  { value: "", label: "All statuses" },
  { value: "active", label: "Valid" },
  { value: "voided", label: "Voided" },
];

const METHODS = ["", "Transfer", "Cash", "POS", "Cheque", "Online", "Other"];

type StudentCounts = { total: number; paid: number; partial: number; unpaid: number };
type OutstandingRow = {
  bill_id: string;
  student_id: string;
  student_name: string;
  class_name: string | null;
  expected: number;
  paid: number;
  outstanding: number;
  status: string;
};
type ClassRow = {
  id: string;
  name: string;
  section_id: string | null;
  expected: number;
  collected: number;
  outstanding: number;
  rate: number;
  student_counts: StudentCounts;
};
type FeeRow = { fee_head_id: string; fee_name: string; expected: number; collected: number; outstanding: number };
type PaymentRow = {
  id: string;
  student_name: string;
  amount: number;
  method: string | null;
  reference: string | null;
  receipt_number: string | null;
  receipt_id: string | null;
  paid_at: string;
  status: string;
};
type Recon = {
  unallocated_payments: { payment_id: string; amount: number; allocated: number; difference: number }[];
  over_allocated_payments: { payment_id: string; amount: number; allocated: number }[];
  over_allocated_lines: { bill_line_id: string; amount: number; allocated: number }[];
  payments_without_receipts: { payment_id: string; amount: number }[];
  duplicate_references: { reference: string; amount: number; count: number; payment_ids: string[] }[];
  totals: { posted_payments: number; posted_allocations: number; issues: number };
};

const shortId = (id: string) => `…${id.slice(-8)}`;

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-caption font-semibold whitespace-nowrap border transition-colors ${
        active
          ? "bg-primary text-text-inverse border-primary"
          : "bg-surface text-text-secondary border-border hover:bg-primary-light hover:text-primary"
      }`}
    >
      {children}
    </button>
  );
}

export default function FinanceReportsPage() {
  const [tab, setTab] = useState<TabKey>("outstanding");

  // Shared filters
  const [terms, setTerms] = useState<Term[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [loadedMeta, setLoadedMeta] = useState(false);
  const [termId, setTermId] = useState("");
  const [sectionId, setSectionId] = useState<string | null>(null);
  const [classId, setClassId] = useState<string | null>(null);
  const [outStatus, setOutStatus] = useState("");

  // Payment-register filters
  const [payStatus, setPayStatus] = useState("");
  const [payMethod, setPayMethod] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Results
  const [outRows, setOutRows] = useState<OutstandingRow[]>([]);
  const [clsRows, setClsRows] = useState<ClassRow[]>([]);
  const [feeRows, setFeeRows] = useState<FeeRow[]>([]);
  const [payRows, setPayRows] = useState<PaymentRow[]>([]);
  const [recon, setRecon] = useState<Recon | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  // ── Meta: terms + section/class tree ──
  useEffect(() => {
    Promise.all([
      fetchArray<Term>("/api/school-admin/terms"),
      fetchArray<Section>("/api/school-admin/finance/sections"),
    ]).then(([t, s]) => {
      setTerms(t);
      setSections(s);
      const active = t.find((x) => x.is_active) || t[0];
      if (active) setTermId(active.id);
      setLoadedMeta(true);
    });
  }, []);

  const q = (extra: Record<string, string>) => {
    const p = new URLSearchParams();
    if (termId) p.set("term_id", termId);
    if (sectionId) p.set("section_id", sectionId);
    if (classId) p.set("class_id", classId);
    for (const [k, v] of Object.entries(extra)) {
      if (v) p.set(k, v);
    }
    const s = p.toString();
    return s ? `?${s}` : "";
  };

  // ── Data loader ──
  const load = useCallback(() => {
    if (!loadedMeta) return;
    if (tab !== "recon" && !termId) {
      setLoading(false); // no terms yet → empty state, not an eternal spinner
      return;
    }
    setLoading(true);
    setErr("");

    if (tab === "outstanding") {
      fetch(`/api/school-admin/finance/reports${q({ type: "outstanding", status: outStatus })}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d: OutstandingRow[] | null) => setOutRows(d || []))
        .catch(() => setErr("Failed to load outstanding report"))
        .finally(() => setLoading(false));
    } else if (tab === "classes") {
      fetch(`/api/school-admin/finance/reports${q({ type: "classes" })}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d: ClassRow[] | null) => setClsRows(d || []))
        .catch(() => setErr("Failed to load class report"))
        .finally(() => setLoading(false));
    } else if (tab === "fees") {
      fetch(`/api/school-admin/finance/reports${q({ type: "fees" })}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d: FeeRow[] | null) => setFeeRows(d || []))
        .catch(() => setErr("Failed to load fee report"))
        .finally(() => setLoading(false));
    } else if (tab === "payments") {
      const p = new URLSearchParams();
      if (termId) p.set("term_id", termId);
      if (payStatus) p.set("status", payStatus);
      if (payMethod) p.set("method", payMethod);
      if (dateFrom) p.set("date_from", dateFrom);
      if (dateTo) p.set("date_to", dateTo);
      const s = p.toString();
      fetch(`/api/school-admin/finance/payments${s ? `?${s}` : ""}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d: PaymentRow[] | null) => setPayRows(d || []))
        .catch(() => setErr("Failed to load payments"))
        .finally(() => setLoading(false));
    } else {
      fetch("/api/school-admin/finance/reconciliation")
        .then((r) => (r.ok ? r.json() : null))
        .then((d: Recon | null) => {
          setRecon(d);
          if (!d) setErr("Failed to load reconciliation — no issues can be shown");
        })
        .catch(() => setErr("Failed to load reconciliation"))
        .finally(() => setLoading(false));
    }
  }, [loadedMeta, tab, termId, sectionId, classId, outStatus, payStatus, payMethod, dateFrom, dateTo]);

  useEffect(() => {
    load();
  }, [load]);

  // When switching section, drop the class selection (classes are section-scoped).
  const pickSection = (id: string | null) => {
    setSectionId(id);
    setClassId(null);
  };

  const sectionClasses = sections.find((s) => s.id === sectionId)?.classes || [];
  const needsSectionFilter = tab === "outstanding" || tab === "classes" || tab === "fees";
  const exportable = tab === "outstanding" || tab === "classes" || tab === "fees" || tab === "payments";

  const exportUrl = () => {
    const p = new URLSearchParams();
    const exportType: Record<TabKey, string> = {
      outstanding: "outstanding",
      classes: "classes",
      fees: "fees",
      payments: "payments",
      recon: "outstanding",
    };
    p.set("type", exportType[tab]);
    if (termId) p.set("term_id", termId);
    if (sectionId) p.set("section_id", sectionId);
    if (classId) p.set("class_id", classId);
    if (tab === "outstanding" && outStatus) p.set("status", outStatus);
    if (tab === "payments") {
      if (payStatus) p.set("status", payStatus);
      if (payMethod) p.set("method", payMethod);
      if (dateFrom) p.set("date_from", dateFrom);
      if (dateTo) p.set("date_to", dateTo);
    }
    return `/api/school-admin/finance/reports/export?${p.toString()}`;
  };

  // ── Per-tab totals ──
  const totals = {
    outstanding: { count: outRows.length, value: outRows.reduce((s, r) => s + r.outstanding, 0) },
    classes: {
      expected: clsRows.reduce((s, r) => s + r.expected, 0),
      collected: clsRows.reduce((s, r) => s + r.collected, 0),
      outstanding: clsRows.reduce((s, r) => s + r.outstanding, 0),
      students: clsRows.reduce((s, r) => s + r.student_counts.total, 0),
    },
    fees: {
      expected: feeRows.reduce((s, r) => s + r.expected, 0),
      collected: feeRows.reduce((s, r) => s + r.collected, 0),
      outstanding: feeRows.reduce((s, r) => s + r.outstanding, 0),
    },
    payments: {
      posted: payRows.filter((p) => p.status === "active").reduce((s, p) => s + p.amount, 0),
      count: payRows.length,
    },
  };

  const renderBody = () => {
    if (loading) return <p className="text-caption text-text-secondary py-10 text-center">Loading…</p>;
    if (err) return <p className="text-caption text-error py-10 text-center">{err}</p>;

    if (tab === "outstanding") {
      return outRows.length === 0 ? (
        <Card padding="md" className="text-center">
          <p className="text-caption text-text-secondary">🎉 No outstanding balances match these filters.</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {outRows.map((r) => {
            const st = billStatusLabel(r.status);
            return (
              <div key={r.bill_id} className="rounded-lg bg-surface border border-border px-4 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-text-primary truncate">{r.student_name}</p>
                  <p className="text-caption text-text-secondary">{r.class_name || "—"}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-bold text-warning">{money(r.outstanding)}</p>
                  <p className="text-caption text-text-secondary">of {money(r.expected)}</p>
                </div>
                <Badge variant={st.badge}>{st.label}</Badge>
              </div>
            );
          })}
        </div>
      );
    }

    if (tab === "classes") {
      return clsRows.length === 0 ? (
        <Card padding="md" className="text-center">
          <p className="text-caption text-text-secondary">No class collections found for this period.</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {clsRows.map((r) => (
            <div key={r.id} className="rounded-lg bg-surface border border-border px-4 py-3">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-text-primary">{r.name}</p>
                <Badge variant={r.rate >= 90 ? "success" : r.rate >= 50 ? "warning" : "error"}>{r.rate}%</Badge>
              </div>
              <div className="h-2 mt-2 rounded-full bg-clay overflow-hidden">
                <div className="h-full bg-success rounded-full" style={{ width: `${Math.min(100, r.rate)}%` }} />
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-caption text-text-secondary">
                <span>{r.student_counts.total} students</span>
                <span>Expected <b className="text-text-primary">{moneyShort(r.expected)}</b></span>
                <span>Collected <b className="text-success">{moneyShort(r.collected)}</b></span>
                <span>Outstanding <b className="text-warning">{moneyShort(r.outstanding)}</b></span>
              </div>
            </div>
          ))}
        </div>
      );
    }

    if (tab === "fees") {
      return feeRows.length === 0 ? (
        <Card padding="md" className="text-center">
          <p className="text-caption text-text-secondary">No fee breakdown for this period.</p>
        </Card>
      ) : (
        <>
          <Card padding="none">
            <div className="divide-y divide-border">
              {feeRows.map((r) => (
                <div key={r.fee_head_id} className="px-4 py-3 flex items-center justify-between gap-3">
                  <p className="font-semibold text-text-primary">{r.fee_name}</p>
                  <div className="text-right text-caption text-text-secondary">
                    <p>
                      Expected <b className="text-text-primary">{moneyShort(r.expected)}</b> · Collected{" "}
                      <b className="text-success">{moneyShort(r.collected)}</b>
                    </p>
                    <p className="text-warning">Outstanding {moneyShort(r.outstanding)}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
          <p className="text-caption text-text-disabled">
            Fee columns reflect actual cash payments only — credit applied to a bill is not attributed to an individual fee.
          </p>
        </>
      );
    }

    if (tab === "payments") {
      return payRows.length === 0 ? (
        <Card padding="md" className="text-center">
          <p className="text-caption text-text-secondary">No payments match these filters.</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {payRows.map((p) => {
            const st = paymentStatusLabel(p.status);
            return (
              <div key={p.id} className="rounded-lg bg-surface border border-border px-4 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-text-primary truncate">{p.student_name}</p>
                  <p className="text-caption text-text-secondary">
                    {new Date(p.paid_at).toLocaleDateString()} · {p.method || "—"}
                    {p.reference ? ` · ${p.reference}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="text-right">
                    <p className={`font-bold ${p.status === "active" ? "text-text-primary" : "text-text-disabled line-through"}`}>
                      {money(p.amount)}
                    </p>
                    <p className="text-caption text-text-secondary">{p.receipt_number || "no receipt"}</p>
                  </div>
                  <Badge variant={st.badge}>{st.label}</Badge>
                  {p.receipt_id && (
                    <a
                      href={`/api/school-admin/finance/receipts/${p.receipt_id}/pdf`}
                      target="_blank"
                      className="text-caption font-semibold text-primary underline whitespace-nowrap"
                    >
                      Receipt
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      );
    }

    // Reconciliation
    if (!recon) return <p className="text-caption text-text-secondary py-10 text-center">Loading…</p>;
    const t = recon.totals;
    if (t.issues === 0) {
      return (
        <Card padding="md" className="text-center">
          <p className="text-h2">🛡️</p>
          <p className="text-body font-semibold text-success mt-1">No reconciliation issues</p>
          <p className="text-caption text-text-secondary mt-1">
            {t.posted_payments} posted payments · {t.posted_allocations} allocations — all accounted for.
          </p>
        </Card>
      );
    }
    return (
      <div className="space-y-3">
        <p className="text-caption text-text-secondary">
          {t.issues} issue{t.issues === 1 ? "" : "s"} flagged for investigation. Nothing has been changed — open the relevant records to review.
        </p>
        {[
          {
            title: "Payments with unallocated amounts",
            items: recon.unallocated_payments.map((x) => ({
              id: x.payment_id,
              left: `Payment ${shortId(x.payment_id)}`,
              right: `${money(x.allocated)} of ${money(x.amount)} allocated`,
              note: `${money(x.difference)} unallocated`,
            })),
          },
          {
            title: "Over-allocated payments",
            items: recon.over_allocated_payments.map((x) => ({
              id: x.payment_id,
              left: `Payment ${shortId(x.payment_id)}`,
              right: `${money(x.allocated)} allocated`,
              note: `payment is ${money(x.amount)}`,
            })),
          },
          {
            title: "Over-allocated bill lines",
            items: recon.over_allocated_lines.map((x) => ({
              id: x.bill_line_id,
              left: `Bill line ${shortId(x.bill_line_id)}`,
              right: `${money(x.allocated)} allocated`,
              note: `payable is ${money(x.amount)}`,
            })),
          },
          {
            title: "Payments without receipts",
            items: recon.payments_without_receipts.map((x) => ({
              id: x.payment_id,
              left: `Payment ${shortId(x.payment_id)}`,
              right: money(x.amount),
              note: "no receipt issued",
            })),
          },
          {
            title: "Possible duplicate references",
            items: recon.duplicate_references.map((x) => ({
              id: x.payment_ids[0],
              left: `“${x.reference}”`,
              right: `${x.count} payments of ${money(x.amount)}`,
              note: "",
            })),
          },
        ]
          .filter((g) => g.items.length > 0)
          .map((g) => (
            <Card key={g.title} padding="md">
              <p className="text-caption font-semibold text-text-secondary uppercase tracking-wider mb-2">
                ⚠️ {g.title} · {g.items.length}
              </p>
              <div className="space-y-1.5">
                {g.items.slice(0, 8).map((it) => (
                  <div key={it.id} className="flex justify-between gap-3 text-caption">
                    <span className="text-text-primary font-medium">{it.left}</span>
                    <span className="text-text-secondary text-right">
                      {it.note && <span>{it.note} · </span>}
                      <b className="text-warning">{it.right}</b>
                    </span>
                  </div>
                ))}
                {g.items.length > 8 && (
                  <p className="text-caption text-text-disabled">+{g.items.length - 8} more…</p>
                )}
              </div>
            </Card>
          ))}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Report subtabs */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        {TABS.map((t) => (
          <Chip key={t.key} active={tab === t.key} onClick={() => setTab(t.key)}>
            {t.label}
          </Chip>
        ))}
      </div>

      {/* Term pills */}
      {tab !== "recon" && terms.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
          <span className="text-caption font-semibold text-text-secondary uppercase tracking-wider">Term</span>
          {terms.map((t) => (
            <Chip key={t.id} active={termId === t.id} onClick={() => setTermId(t.id)}>
              {t.name}
            </Chip>
          ))}
        </div>
      )}

      {/* Section → class filters */}
      {needsSectionFilter && sections.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
            <span className="text-caption font-semibold text-text-secondary uppercase tracking-wider">Section</span>
            <Chip active={!sectionId} onClick={() => pickSection(null)}>
              All
            </Chip>
            {sections
              .filter((s) => s.id !== null)
              .map((s) => (
                <Chip key={s.id || "none"} active={sectionId === s.id} onClick={() => pickSection(s.id)}>
                  {s.name}
                </Chip>
              ))}
          </div>
          {sectionId && sectionClasses.length > 0 && (
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
              <span className="text-caption font-semibold text-text-secondary uppercase tracking-wider">Class</span>
              <Chip active={!classId} onClick={() => setClassId(null)}>
                All
              </Chip>
              {sectionClasses.map((c) => (
                <Chip key={c.id} active={classId === c.id} onClick={() => setClassId(c.id)}>
                  {c.name}
                </Chip>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Outstanding status */}
      {tab === "outstanding" && (
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
          <span className="text-caption font-semibold text-text-secondary uppercase tracking-wider">Status</span>
          {OUT_STATUSES.map((o) => (
            <Chip key={o.value} active={outStatus === o.value} onClick={() => setOutStatus(o.value)}>
              {o.label}
            </Chip>
          ))}
        </div>
      )}

      {/* Payment-register filters */}
      {tab === "payments" && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
            <span className="text-caption font-semibold text-text-secondary uppercase tracking-wider">Status</span>
            {PAY_STATUSES.map((o) => (
              <Chip key={o.value} active={payStatus === o.value} onClick={() => setPayStatus(o.value)}>
                {o.label}
              </Chip>
            ))}
          </div>
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
            <span className="text-caption font-semibold text-text-secondary uppercase tracking-wider">Method</span>
            {METHODS.map((m) => (
              <Chip key={m || "all"} active={payMethod === m} onClick={() => setPayMethod(m)}>
                {m || "All"}
              </Chip>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3 max-w-md">
            <Input type="date" label="From" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            <Input type="date" label="To" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
        </div>
      )}

      {/* Summary + export */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-caption text-text-secondary">
          {tab === "outstanding" && <>😟 {totals.outstanding.count} student{totals.outstanding.count === 1 ? "" : "s"} owing <b className="text-warning">{money(totals.outstanding.value)}</b></>}
          {tab === "classes" && (
            <>
              🏫 {totals.classes.students} billed students · Expected <b>{moneyShort(totals.classes.expected)}</b> · Collected{" "}
              <b className="text-success">{moneyShort(totals.classes.collected)}</b> · Outstanding{" "}
              <b className="text-warning">{moneyShort(totals.classes.outstanding)}</b>
            </>
          )}
          {tab === "fees" && (
            <>
              🏷️ Expected <b>{moneyShort(totals.fees.expected)}</b> · Collected{" "}
              <b className="text-success">{moneyShort(totals.fees.collected)}</b> · Outstanding{" "}
              <b className="text-warning">{moneyShort(totals.fees.outstanding)}</b>
            </>
          )}
          {tab === "payments" && (
            <>
              💳 {totals.payments.count} payment{totals.payments.count === 1 ? "" : "s"} · Valid total{" "}
              <b className="text-success">{money(totals.payments.posted)}</b>
            </>
          )}
          {tab === "recon" && <>🛡️ {recon?.totals.issues ?? 0} flagged issue{(recon?.totals.issues ?? 0) === 1 ? "" : "s"} across all terms</>}
        </p>
        {exportable && (
          <a href={exportUrl()} target="_blank" className="shrink-0">
            <Button size="sm">⬇️ Export Excel</Button>
          </a>
        )}
      </div>

      {renderBody()}

      {tab === "recon" && recon && recon.totals.issues > 0 && (
        <p className="text-caption text-text-disabled">
          Tip: investigate flagged items in{" "}
          <a href="/school-admin/finance/payments" className="text-primary font-semibold underline">
            Payments
          </a>{" "}
          or the student’s bill. Reconciliation never edits records automatically.
        </p>
      )}
    </div>
  );
}
