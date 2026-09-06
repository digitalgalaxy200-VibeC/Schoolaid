"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Card, Button, Input, Badge, Modal, showToast } from "@/components/ui";
import { money, paymentStatusLabel, currencySymbol, fetchArray, fetchObject } from "@/components/finance/helpers";
import { PaymentSuccessModal, type PaymentSuccessData } from "@/components/finance/PaymentSuccessModal";
import { AddOptionalFeesModal, RemoveOptionalFeeModal } from "@/components/finance/OptionalFeeModals";

// Finance → Payments — LIST-FIRST payment monitoring + recording.
// 1) See every billed student for the term with their canonical financial
//    position (Expected / Paid / Balance / Status from the engine).
// 2) Filter by class, payment status and name — combined.
// 3) Select a student → the existing Record Payment workflow (unchanged):
//    fee breakdown, optional-fee checklist, method/account/sender, receipt.

type Term = { id: string; name: string; is_active: boolean };
// One row per student bill — payment_status is derived by the API with the
// SAME canonical engine (termStatus) used by the workspace and dashboard.
type StudentRow = {
  id: string;
  student_id: string;
  student_name: string;
  class_id: string | null;
  class_name: string | null;
  term_id: string;
  net_amount: number;
  paid: number;
  applied_credit: number;
  outstanding: number;
  payment_status: string;
};
type FeeRow = { fee_head_id: string; fee_name: string; amount: number; waived: number; paid: number; outstanding: number; required: boolean };
type Account = { id: string; bank_name: string; account_name: string; account_number: string; is_active: boolean };
type PaymentRow = {
  id: string;
  student_name: string;
  amount: number;
  method: string | null;
  reference: string | null;
  paid_into: string | null;
  sender_name: string | null;
  paid_on: string | null;
  receipt_number: string | null;
  receipt_id: string | null;
  paid_at: string;
  status: string;
};
type Workspace = {
  student: { id: string; name: string; class_name: string | null; parent_name: string | null; parent_phone: string | null };
  term: { id: string; name: string; session_name: string | null };
  bill: { id: string } | null;
  summary: { expected: number; paid: number; applied_credit: number; outstanding: number; available_credit: number; status: string };
  fees: FeeRow[];
  optional_fees: { id: string; name: string; amount: number }[];
  accounts: Account[];
  payments: PaymentRow[];
};

const METHODS = ["Transfer", "Cash", "POS", "Cheque", "Online", "Other"];
// Only these methods land in a specific school account (Transfer/POS per FIN-001);
// for Cash/Cheque/Online/Other no bank selection is required.
const ACCOUNT_METHODS = ["Transfer", "POS"];

// Payment-status filter: PAID and COMPLETED are one user-facing "Paid" group.
const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "All statuses" },
  { value: "NOT PAID", label: "Not Paid" },
  { value: "PARTIALLY PAID", label: "Partially Paid" },
  { value: "PAID", label: "Paid" },
];

const statusMeta = (s: string): { label: string; badge: "success" | "warning" | "error" | "default" } => {
  if (s === "PAID" || s === "COMPLETED") return { label: "Paid", badge: "success" };
  if (s === "PARTIALLY PAID") return { label: "Partially Paid", badge: "warning" };
  if (s === "NOT PAID") return { label: "Not Paid", badge: "error" };
  return { label: s, badge: "default" };
};

const matchesStatus = (rowStatus: string, filter: string): boolean => {
  if (!filter) return true;
  if (filter === "PAID") return rowStatus === "PAID" || rowStatus === "COMPLETED";
  return rowStatus === filter;
};

const summaryBadge = (s: string): "success" | "warning" | "error" | "default" => {
  if (s === "COMPLETED" || s === "PAID") return "success";
  if (s === "PARTIALLY PAID") return "warning";
  if (s === "NOT PAID") return "error";
  return "default";
};

export default function FinancePaymentsPage() {
  const searchParams = useSearchParams();
  const preseedStudent = searchParams.get("student") || "";
  const autoPicked = useRef(false);
  const [terms, setTerms] = useState<Term[]>([]);
  const [termId, setTermId] = useState("");
  const termName = terms.find((t) => t.id === termId)?.name || "";

  // The term's full student list (billed students only — see billing API).
  // rowsTerm tracks which term the loaded rows belong to, so switching terms
  // never shows another term's data while the fetch is in flight.
  const [rows, setRows] = useState<StudentRow[]>([]);
  const [rowsTerm, setRowsTerm] = useState("");

  // Filters — combined over the COMPLETE selected-term dataset (client-side)
  const [classFilter, setClassFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [q, setQ] = useState("");

  // Open student record panel (the existing workflow)
  const [ws, setWs] = useState<Workspace | null>(null);

  const [payments, setPayments] = useState<PaymentRow[]>([]);

  // Payment form
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("Cash");
  const [accountId, setAccountId] = useState("");
  const [payDate, setPayDate] = useState("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [senderName, setSenderName] = useState("");
  const [saving, setSaving] = useState(false);
  // Success modal (replaces toast-only confirmation)
  const [success, setSuccess] = useState<PaymentSuccessData | null>(null);

  // Optional-fee flows (FIN-002): deliberate selection behind a checklist
  // modal; removal only ever applies to optional fees.
  const [addOpen, setAddOpen] = useState(false);
  const [addBusy, setAddBusy] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<FeeRow | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);

  // Void flow
  const [voidTarget, setVoidTarget] = useState<PaymentRow | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [voiding, setVoiding] = useState(false);

  useEffect(() => {
    fetchArray<Term>("/api/school-admin/terms").then((rows) => {
      setTerms(rows);
      const active = rows.find((t) => t.is_active) || rows[0];
      if (active) setTermId(active.id);
    });
  }, []);

  // ── Load the complete billed-student list for the term (one request) ──
  const loadStudents = useCallback(() => {
    if (!termId) return;
    fetchArray<StudentRow>(`/api/school-admin/finance/billing?term_id=${encodeURIComponent(termId)}`).then((data) => {
      setRows(data);
      setRowsTerm(termId);
    });
  }, [termId]);

  useEffect(() => {
    if (terms.length > 0) loadStudents();
  }, [terms, loadStudents]);

  const loadPayments = useCallback(() => {
    const qp = termId ? `?term_id=${encodeURIComponent(termId)}` : "";
    fetchArray<PaymentRow>(`/api/school-admin/finance/payments${qp}`).then(setPayments);
  }, [termId]);
  useEffect(() => {
    if (terms.length > 0) loadPayments();
  }, [terms, loadPayments]);

  // ── Derived: classes present in the term, sorted by name ──
  const classes = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    for (const r of rows) {
      const key = r.class_id || "__none__";
      if (!map.has(key)) map.set(key, { id: r.class_id || "", name: r.class_name || "(no class)" });
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);

  // ── Derived: term-level payment-health counts (complete dataset) ──
  const counts = useMemo(() => {
    let notPaid = 0;
    let partial = 0;
    let paid = 0;
    for (const r of rows) {
      if (r.payment_status === "NOT PAID") notPaid += 1;
      else if (r.payment_status === "PARTIALLY PAID") partial += 1;
      else paid += 1; // PAID + COMPLETED
    }
    return { total: rows.length, notPaid, partial, paid };
  }, [rows]);

  // ── Derived: visible rows after combined filters (sorted by name) ──
  const visible = useMemo(() => {
    const query = q.trim().toLowerCase();
    return rows
      .filter((r) => {
        if (classFilter) {
          const key = r.class_id || "__none__";
          if (key !== classFilter) return false;
        }
        if (!matchesStatus(r.payment_status, statusFilter)) return false;
        if (query && !r.student_name.toLowerCase().includes(query)) return false;
        return true;
      })
      .sort((a, b) => a.student_name.localeCompare(b.student_name));
  }, [rows, classFilter, statusFilter, q]);

  // Arrived from a bill's "Record payment" link (?student=Name) → open that
  // student's panel automatically once the list is loaded.
  const applyWorkspace = useCallback((d: Workspace) => {
    setWs(d);
    // Amount Received ALWAYS starts empty — the officer types what actually
    // came in; nothing is ever pre-filled from the outstanding balance.
    setAmount("");
    setAccountId(d.accounts[0]?.id || "");
    setPayDate(new Date().toISOString().slice(0, 10));
    setReference("");
    setNote("");
    setSenderName("");
    setSuccess(null);
  }, []);

  const pickStudent = async (row: StudentRow) => {
    const d = await fetchObject<Workspace>(
      `/api/school-admin/finance/students/${row.student_id}/workspace?term_id=${encodeURIComponent(row.term_id)}`,
    );
    if (d) {
      applyWorkspace(d);
    } else {
      showToast({ type: "error", title: "Could not load this student's account" });
    }
  };

  useEffect(() => {
    if (autoPicked.current || !preseedStudent || rows.length === 0) return;
    const match = rows.find((r) => r.student_name.toLowerCase() === preseedStudent.toLowerCase());
    if (!match) return;
    autoPicked.current = true;
    (async () => {
      const d = await fetchObject<Workspace>(
        `/api/school-admin/finance/students/${match.student_id}/workspace?term_id=${encodeURIComponent(match.term_id)}`,
      );
      if (d) applyWorkspace(d);
    })();
  }, [rows, preseedStudent, applyWorkspace]);

  // Refresh the open account snapshot after any change (fee added/removed).
  const refreshWs = async () => {
    if (!ws) return;
    const d = await fetchObject<Workspace>(
      `/api/school-admin/finance/students/${ws.student.id}/workspace?term_id=${encodeURIComponent(termId)}`,
    );
    if (d) setWs(d);
  };

  // Return from the record panel to the student list (rows always re-pulled
  // so no row can show stale financial data).
  const backToList = () => {
    setWs(null);
    loadStudents();
  };

  // Add the checked optional fees to THIS student's bill (one call each, in
  // selection order), then refresh so Expected updates before payment entry.
  const addManyOptional = async (ids: string[]) => {
    if (!ws?.bill || ids.length === 0) return;
    const chosen = ws.optional_fees.filter((f) => ids.includes(f.id));
    setAddBusy(true);
    let added = 0;
    let failed: string | null = null;
    for (const fee of chosen) {
      const res = await fetch(`/api/school-admin/finance/billing/${ws.bill.id}/add-fee`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fee_head_id: fee.id, amount: fee.amount }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        added += 1;
      } else {
        failed = d?.error || `Could not add ${fee.name}`;
        break;
      }
    }
    setAddBusy(false);
    if (added > 0) {
      setAddOpen(false);
      showToast({ type: "success", title: `${added} optional fee${added > 1 ? "s" : ""} added to this student's account` });
      await refreshWs();
    }
    if (failed) showToast({ type: "error", title: failed });
  };

  // Remove an optional fee from this student's bill (required fees are never
  // removable here — no Remove control renders for them).
  const removeOptionalFee = async (reason: string) => {
    if (!ws?.bill || !removeTarget) return;
    setRemoveBusy(true);
    const res = await fetch(`/api/school-admin/finance/billing/${ws.bill.id}/remove-fee`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fee_head_id: removeTarget.fee_head_id, reason: reason || null }),
    });
    const d = await res.json().catch(() => ({}));
    setRemoveBusy(false);
    setRemoveTarget(null);
    if (res.ok) {
      const credited = Number(d?.credit_amount || 0);
      showToast({
        type: "success",
        title: `${removeTarget.fee_name} removed${credited > 0 ? ` — ${money(credited)} converted to credit` : ""}`,
      });
      await refreshWs();
    } else {
      showToast({ type: "error", title: d?.error || "Could not remove fee" });
    }
  };

  const chooseMethod = (m: string) => {
    setMethod(m);
    if (!ACCOUNT_METHODS.includes(m)) {
      setAccountId("");
    } else if (!accountId && ws?.accounts?.[0]) {
      setAccountId(ws.accounts[0].id);
    }
  };

  const record = async () => {
    if (!ws) return;
    if (saving) return; // double-submit guard
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) return;
    setSaving(true);
    const res = await fetch("/api/school-admin/finance/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        student_id: ws.student.id,
        bill_id: ws.bill?.id || null,
        term_id: termId,
        amount: amt,
        method,
        reference: reference.trim() || null,
        notes: note.trim() || null,
        sender_name: senderName.trim() || null,
        school_account_id: accountId || null,
        paid_at: payDate || undefined,
      }),
    });
    const d = await res.json().catch(() => ({}));
    setSaving(false);
    if (res.ok) {
      setSuccess({
        student_name: ws.student.name,
        amount: amt,
        receipt: d?.receipt ? { id: d.receipt.id, receipt_number: d.receipt.receipt_number } : null,
        credit: d?.credit || null,
        balance: d?.balance || null,
      });
      // Clean slate: the form must never hold the previous payment's amount.
      setAmount("");
      setReference("");
      setNote("");
      setSenderName("");
      loadPayments();
    } else {
      showToast({ type: "error", title: d?.error || "Payment failed" });
    }
  };

  // Success modal closed → back to the student list with fresh rows, so the
  // recorded payment is immediately reflected (Expected/Paid/Balance/Status).
  const closeSuccess = () => {
    setSuccess(null);
    backToList();
  };

  const doVoid = async () => {
    if (!voidTarget || !voidReason.trim()) return;
    setVoiding(true);
    const res = await fetch(`/api/school-admin/finance/payments/${voidTarget.id}/void`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: voidReason }),
    });
    setVoiding(false);
    setVoidTarget(null);
    setVoidReason("");
    if (res.ok) {
      showToast({ type: "success", title: "Payment voided — record kept for audit" });
      loadPayments();
      if (ws) refreshWs();
    } else {
      showToast({ type: "error", title: "Void failed" });
    }
  };

  const postedTotal = payments.filter((p) => p.status === "active").reduce((s, p) => s + p.amount, 0);
  const filtersActive = classFilter !== "" || statusFilter !== "" || q.trim() !== "";
  const selectCls =
    "w-full rounded-md border border-border bg-surface px-3 py-2 text-caption text-text-primary focus:outline-none focus:ring-2 focus:ring-primary";

  return (
    <div className="space-y-5">
      {/* Term */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
        <span className="text-caption font-semibold text-text-secondary uppercase tracking-wider">Term</span>
        {terms.map((t) => (
          <button
            key={t.id}
            onClick={() => setTermId(t.id)}
            className={`px-3 py-1.5 rounded-full text-caption font-semibold whitespace-nowrap border transition-colors ${
              termId === t.id ? "bg-primary text-text-inverse border-primary" : "bg-surface text-text-secondary border-border"
            }`}
          >
            {t.name}
          </button>
        ))}
      </div>

      {/* LIST MODE — every billed student for the term */}
      {!ws && (
        <Card>
          <div className="flex items-start justify-between flex-wrap gap-2 mb-3">
            <div>
              <p className="text-h3 font-bold text-text-primary">Students · {termName || "…"}</p>
              <p className="text-caption text-text-secondary">
                Billed students for this term — select one to review the account or record a payment.
              </p>
            </div>
          </div>

          {/* Filters */}
          <div className="grid grid-cols-2 tablet:grid-cols-4 gap-3 mb-4">
            <div>
              <label className="text-caption text-text-secondary block mb-1">Class</label>
              <select value={classFilter} onChange={(e) => setClassFilter(e.target.value)} className={selectCls}>
                <option value="">All classes</option>
                {classes.map((c) => (
                  <option key={c.id || "none"} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-caption text-text-secondary block mb-1">Payment status</label>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={selectCls}>
                {STATUS_OPTIONS.map((s) => (
                  <option key={s.value || "all"} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-span-2 tablet:col-span-2">
              <label className="text-caption text-text-secondary block mb-1">Search student</label>
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by student name…" />
            </div>
          </div>

          {/* Payment-health counts — complete selected-term dataset */}
          {rowsTerm === termId && (
            <div className="grid grid-cols-2 tablet:grid-cols-4 gap-3 text-center mb-4">
              {[
                { label: "Students", value: counts.total, cls: "text-text-primary" },
                { label: "Not Paid", value: counts.notPaid, cls: "text-error" },
                { label: "Partially Paid", value: counts.partial, cls: "text-warning" },
                { label: "Paid", value: counts.paid, cls: "text-success" },
              ].map((x) => (
                <div key={x.label} className="rounded-lg bg-clay py-2.5">
                  <p className={`text-body font-extrabold ${x.cls}`}>{x.value}</p>
                  <p className="text-caption text-text-secondary">{x.label}</p>
                </div>
              ))}
            </div>
          )}

          {rowsTerm !== termId ? (
            <p className="text-caption text-text-secondary py-8 text-center">Loading students…</p>
          ) : rows.length === 0 ? (
            <Card padding="md" variant="clay" className="text-center">
              <p className="text-caption text-text-secondary">
                No billed students for {termName} yet —{" "}
                <Link href="/school-admin/finance/billing" className="text-primary font-semibold underline">
                  generate bills
                </Link>{" "}
                first, then students appear here.
              </p>
            </Card>
          ) : (
            <>
              <p className="text-caption text-text-secondary mb-2">
                {filtersActive ? `Showing ${visible.length} of ${rows.length} students` : `${rows.length} students`}
                {filtersActive && (
                  <button
                    onClick={() => {
                      setClassFilter("");
                      setStatusFilter("");
                      setQ("");
                    }}
                    className="ml-2 text-caption font-semibold text-error underline"
                  >
                    Clear filters
                  </button>
                )}
              </p>

              {/* Desktop column headers */}
              <div className="hidden tablet:flex items-center gap-3 px-4 pb-1 text-caption font-semibold text-text-secondary uppercase tracking-wider">
                <span className="flex-1">Student · Class</span>
                <span className="w-28 text-right">Expected</span>
                <span className="w-28 text-right">Paid</span>
                <span className="w-28 text-right">Balance</span>
                <span className="w-24 text-center">Status</span>
                <span className="w-20 text-right" />
              </div>

              <div className="space-y-1.5">
                {visible.map((r) => {
                  const st = statusMeta(r.payment_status);
                  return (
                    <div
                      key={r.id}
                      onClick={() => pickStudent(r)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          pickStudent(r);
                        }
                      }}
                      className="rounded-lg bg-surface border border-border px-4 py-3 hover:bg-clay hover:border-primary/40 transition-colors cursor-pointer flex items-center gap-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-text-primary truncate">{r.student_name}</p>
                        <p className="text-caption text-text-secondary">{r.class_name || "—"}</p>
                        {/* Mobile compact amounts */}
                        <p className="tablet:hidden text-caption text-text-secondary mt-0.5">
                          Expected <b className="text-text-primary">{money(r.net_amount)}</b> · Paid{" "}
                          <b className="text-success">{money(r.paid)}</b> · Balance{" "}
                          <b className={r.outstanding > 0 ? "text-warning" : "text-success"}>{money(r.outstanding)}</b>
                        </p>
                      </div>
                      <div className="hidden tablet:flex items-center gap-3 shrink-0">
                        <span className="w-28 text-right text-caption font-semibold text-text-primary">{money(r.net_amount)}</span>
                        <span className="w-28 text-right text-caption font-semibold text-success">{money(r.paid)}</span>
                        <span className={`w-28 text-right text-caption font-semibold ${r.outstanding > 0 ? "text-warning" : "text-success"}`}>
                          {money(r.outstanding)}
                        </span>
                        <span className="w-24 flex justify-center">
                          <Badge variant={st.badge}>{st.label}</Badge>
                        </span>
                        <span className="w-20 text-right">
                          <Link
                            href={`/school-admin/finance/students/${r.student_id}?term_id=${encodeURIComponent(r.term_id)}`}
                            onClick={(e) => e.stopPropagation()}
                            className="text-caption font-semibold text-primary underline"
                          >
                            Workspace
                          </Link>
                        </span>
                      </div>
                      <Badge variant={st.badge} className="tablet:hidden shrink-0">
                        {st.label}
                      </Badge>
                    </div>
                  );
                })}

                {visible.length === 0 && (
                  <Card padding="md" variant="clay" className="text-center">
                    <p className="text-caption text-text-secondary">No students match these filters.</p>
                  </Card>
                )}
              </div>
            </>
          )}
        </Card>
      )}

      {/* RECORD MODE — the existing student account + payment workflow */}
      {ws && (
        <>
          <button onClick={backToList} className="text-caption font-semibold text-primary underline">
            ← Back to students
          </button>

          <Card>
            <div className="flex items-start justify-between flex-wrap gap-3">
              <div>
                <p className="text-h3 font-bold text-text-primary">{ws.student.name}</p>
                <p className="text-caption text-text-secondary">
                  {ws.student.class_name || "—"} · {ws.term.name}
                  {ws.term.session_name ? ` · ${ws.term.session_name}` : ""}
                </p>
                {(ws.student.parent_name || ws.student.parent_phone) && (
                  <p className="text-caption text-text-secondary mt-1">
                    Parent/Guardian: {ws.student.parent_name || "—"}
                    {ws.student.parent_phone ? ` · ${ws.student.parent_phone}` : ""}
                  </p>
                )}
              </div>
              <Badge variant={summaryBadge(ws.summary.status)}>{ws.summary.status}</Badge>
            </div>

            <div className="mt-4 grid grid-cols-2 tablet:grid-cols-4 gap-3 text-center">
              {[
                { label: "Expected", value: money(ws.summary.expected), cls: "text-text-primary" },
                { label: "Paid", value: money(ws.summary.paid), cls: "text-success" },
                { label: "Outstanding", value: money(ws.summary.outstanding), cls: ws.summary.outstanding > 0 ? "text-warning" : "text-success" },
                { label: "Credit", value: money(ws.summary.available_credit), cls: ws.summary.available_credit > 0 ? "text-primary" : "text-text-secondary" },
              ].map((x) => (
                <div key={x.label} className="rounded-lg bg-clay py-3">
                  <p className={`text-body font-extrabold ${x.cls}`}>{x.value}</p>
                  <p className="text-caption text-text-secondary">{x.label}</p>
                </div>
              ))}
            </div>

            {ws.bill && (
              <div className="mt-4">
                <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                  <div>
                    <p className="text-caption font-semibold text-text-secondary uppercase tracking-wider">Fee breakdown</p>
                    <p className="text-caption text-text-disabled">Exactly what this student is expected to pay — per item.</p>
                  </div>
                  {ws.optional_fees.length > 0 && (
                    <Button size="sm" variant="secondary" onClick={() => setAddOpen(true)}>
                      ＋ Add additional fee
                    </Button>
                  )}
                </div>
                <div className="space-y-1.5">
                  {ws.fees.map((f) => (
                    <div key={f.fee_head_id} className="flex items-center justify-between gap-3 rounded-lg bg-clay px-3 py-2">
                      <div className="min-w-0">
                        <p className="text-caption font-medium text-text-primary truncate">
                          {f.fee_name} {f.required ? "🔒" : ""}
                        </p>
                        {f.waived > 0 && <p className="text-caption text-text-disabled">{money(f.waived)} waived</p>}
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-caption text-text-secondary">
                          <b className="text-text-primary">{money(f.amount)}</b> expected
                          {f.paid > 0 ? (
                            <>
                              {" · "}
                              <b className="text-success">{money(f.paid)}</b> paid
                            </>
                          ) : null}
                          {f.outstanding > 0 ? (
                            <>
                              {" · "}
                              <b className="text-warning">{money(f.outstanding)}</b> left
                            </>
                          ) : f.paid > 0 ? (
                            <>
                              {" · "}
                              <b className="text-success">covered</b>
                            </>
                          ) : null}
                        </span>
                        {!f.required && (
                          <button
                            onClick={() => setRemoveTarget(f)}
                            className="text-caption font-semibold text-error underline whitespace-nowrap"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                  {ws.fees.length === 0 && (
                    <p className="text-caption text-text-secondary text-center py-2">
                      No fees on this bill yet — use “＋ Add additional fee” above if the parent requested an item.
                    </p>
                  )}
                </div>
              </div>
            )}

            <div className="mt-4 grid grid-cols-1 tablet:grid-cols-2 gap-3">
              <div>
                <label className="text-caption text-text-secondary block mb-1">Amount received ({currencySymbol()})</label>
                <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} min={0} />
              </div>
              <div>
                <label className="text-caption text-text-secondary block mb-1">Payment date</label>
                <Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
              </div>
            </div>

            <div className="mt-3">
              <label className="text-caption text-text-secondary block mb-1">Method</label>
              <div className="flex gap-2 flex-wrap">
                {METHODS.map((m) => (
                  <button
                    key={m}
                    onClick={() => chooseMethod(m)}
                    className={`px-3 py-1.5 rounded-full text-caption font-semibold border transition-colors ${
                      method === m ? "bg-primary text-text-inverse border-primary" : "bg-surface text-text-secondary border-border"
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            {ACCOUNT_METHODS.includes(method) && ws.accounts.length > 0 && (
              <div className="mt-3">
                <label className="text-caption text-text-secondary block mb-1">Paid into (school account)</label>
                <select
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  className="w-full rounded-md border border-border bg-surface px-3 py-2 text-body text-text-primary focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  {ws.accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.bank_name} · {a.account_name} · {a.account_number}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {ACCOUNT_METHODS.includes(method) && ws.accounts.length === 0 && (
              <p className="mt-3 text-caption text-warning">
                No active school account configured yet — add one in the Accounts tab so receipts can show where the money was paid.
              </p>
            )}

            <div className="mt-3 grid grid-cols-1 tablet:grid-cols-2 gap-3">
              <div>
                <label className="text-caption text-text-secondary block mb-1">Sender / Depositor name (optional)</label>
                <Input value={senderName} onChange={(e) => setSenderName(e.target.value)} placeholder="e.g. Mr. John Doe" />
              </div>
              <div>
                <label className="text-caption text-text-secondary block mb-1">Reference (optional)</label>
                <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. TRX-001" />
              </div>
            </div>
            <div className="mt-3">
              <label className="text-caption text-text-secondary block mb-1">Note (optional)</label>
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Paid at the bank" />
            </div>

            <div className="mt-4 flex gap-2 flex-wrap">
              <Button onClick={record} loading={saving} disabled={!(Number(amount) > 0)}>
                Record payment
              </Button>
              <Button variant="secondary" onClick={backToList}>
                ← Back to students
              </Button>
            </div>
            <p className="mt-3 text-caption text-text-disabled">
              The payment is allocated automatically across this student&apos;s outstanding fees, in the order above. Any amount
              beyond the balance becomes credit on the student&apos;s account, and a receipt is issued immediately.
            </p>
          </Card>
        </>
      )}

      {/* Term payment history */}
      <div>
        <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
          <p className="text-caption font-semibold text-text-secondary uppercase tracking-wider">
            Payment history · {termName || ""}
          </p>
          <p className="text-caption text-text-secondary">
            <b className="text-success">{money(postedTotal)}</b> collected in valid payments ({payments.filter((p) => p.status === "active").length})
          </p>
        </div>
        <div className="hidden tablet:flex items-center justify-between gap-3 px-4 pb-1 text-caption font-semibold text-text-secondary uppercase tracking-wider">
          <span>Date · Student</span>
          <span className="w-40 text-right">Amount</span>
          <span className="w-24 text-center">Status</span>
        </div>
        <div className="space-y-2">
          {payments.map((p) => {
            const st = paymentStatusLabel(p.status);
            return (
              <div key={p.id} className="rounded-lg bg-surface border border-border px-4 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-text-primary truncate">{p.student_name}</p>
                  <p className="text-caption text-text-secondary">
                    {new Date(p.paid_at).toLocaleDateString()} · {p.method || "—"}
                    {p.sender_name ? ` · ${p.sender_name}` : ""}
                    {p.paid_into ? ` · ${p.paid_into}` : ""}
                    {p.reference ? ` · ${p.reference}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="text-right">
                    <p className={`font-bold ${p.status === "active" ? "text-text-primary" : "text-text-disabled line-through"}`}>{money(p.amount)}</p>
                    <p className="text-caption text-text-secondary">{p.receipt_number || "no receipt"}</p>
                  </div>
                  <Badge variant={st.badge}>{st.label}</Badge>
                  {p.receipt_id && (
                    <a href={`/api/school-admin/finance/receipts/${p.receipt_id}/pdf`} target="_blank" className="text-caption font-semibold text-primary underline whitespace-nowrap">
                      Receipt
                    </a>
                  )}
                  {p.status === "active" && (
                    <button onClick={() => setVoidTarget(p)} className="text-caption font-semibold text-error underline whitespace-nowrap">
                      Void
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {payments.length === 0 && (
            <Card padding="md" className="text-center">
              <p className="text-caption text-text-secondary">No payments recorded for this term yet.</p>
            </Card>
          )}
        </div>
      </div>

      {/* Payment success modal (in-app — no browser dialogs) */}
      <PaymentSuccessModal
        data={success}
        parent={{ name: ws?.student.parent_name, phone: ws?.student.parent_phone }}
        onClose={closeSuccess}
      />

      {/* Optional fee checklist — nothing is added until the officer confirms */}
      {addOpen && !!ws?.bill && (
        <AddOptionalFeesModal
          fees={ws.optional_fees}
          busy={addBusy}
          onClose={() => { if (!addBusy) setAddOpen(false); }}
          onAdd={addManyOptional}
        />
      )}

      {/* Optional fee removal (reason logged; paid amounts become credit) */}
      {removeTarget && (
        <RemoveOptionalFeeModal
          target={{ fee_head_id: removeTarget.fee_head_id, fee_name: removeTarget.fee_name, amount: removeTarget.amount }}
          busy={removeBusy}
          onClose={() => { if (!removeBusy) setRemoveTarget(null); }}
          onConfirm={removeOptionalFee}
        />
      )}

      {/* Void modal */}
      <Modal isOpen={!!voidTarget} onClose={() => setVoidTarget(null)} title="Void payment">
        <div className="space-y-4">
          <p className="text-caption text-text-secondary">
            {voidTarget ? `Void ${money(voidTarget.amount)} from ${voidTarget.student_name}? The record stays for audit but no longer counts toward balances.` : ""}
          </p>
          <div>
            <label className="text-caption text-text-secondary block mb-1">Reason (required)</label>
            <Input value={voidReason} onChange={(e) => setVoidReason(e.target.value)} placeholder="e.g. Wrong student recorded" />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setVoidTarget(null)}>Cancel</Button>
            <Button variant="danger" onClick={doVoid} loading={voiding} disabled={!voidReason.trim()}>Void payment</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
