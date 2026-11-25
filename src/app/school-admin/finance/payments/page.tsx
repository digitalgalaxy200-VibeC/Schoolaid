"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Card, Button, Input, Badge, Modal, showToast } from "@/components/ui";
import { money, paymentStatusLabel, currencySymbol, receiptPdfUrl, fetchArray, fetchObject } from "@/components/finance/helpers";
import { workspaceStatusText } from "@/lib/finance/status";
import { formatDate } from "@/lib/dates";
import { PaymentSuccessModal, type PaymentSuccessData } from "@/components/finance/PaymentSuccessModal";
import { AddOptionalFeesModal, RemoveOptionalFeeModal } from "@/components/finance/OptionalFeeModals";
import { termLabel, pickFinanceTerm, schoolTodayISO } from "@/lib/school-admin/term";
import { PastTermNotice, TermSelect } from "@/components/finance/TermSelect";
import { useFinanceRole } from "@/components/finance/useFinanceRole";
import { whatsAppLink } from "@/lib/finance/phone";

// Finance → Payments — LIST-FIRST payment monitoring + recording.
// 1) See every billed student for the term with their canonical financial
//    position (Expected / Paid / Balance / Status from the engine).
// 2) Filter by class, payment status and name — combined.
// 3) Select a student → the existing Record Payment workflow (unchanged):
//    fee breakdown, optional-fee checklist, method/account/sender, receipt.
// Note: this list shows students WITH a bill for the selected term only;
// students without bills are handled on the Billing tab.

type Term = { id: string; name: string; is_active: boolean; start_date: string; end_date: string; session_name: string | null };
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
  parent_phone: string | null;
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
  term_id: string | null;
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

type TodayData = {
  date: string;
  total: number;
  count: number;
  by_method: { method: string; total: number; count: number }[];
};

type TermActivity = { term_id: string; bills: number; payments: number };

const METHODS = ["Transfer", "Cash", "POS", "Cheque", "Online", "Other"];
// Only these methods land in a specific school account (Transfer/POS per FIN-001);
// for Cash/Cheque/Online/Other no bank selection is required.
const ACCOUNT_METHODS = ["Transfer", "POS"];

/**
 * The method the bursar used last.
 *
 * A cash desk takes the same kind of money all morning. Re-picking "Cash" for
 * every parent is pure friction, so we remember the choice per browser. It is
 * only a default — changing the chip still changes the method, and nothing is
 * written until the payment is recorded.
 */
const LAST_METHOD_KEY = "schoolaid.finance.lastMethod";
const rememberedMethod = (): string | null => {
  try {
    const stored = window.localStorage.getItem(LAST_METHOD_KEY);
    return stored && METHODS.includes(stored) ? stored : null;
  } catch {
    return null;
  }
};

// Payment-status filter: PAID and COMPLETED are one user-facing "Paid" group.
const matchesStatus = (rowStatus: string, filter: string): boolean => {
  if (!filter) return true;
  if (filter === "PAID") return rowStatus === "PAID" || rowStatus === "COMPLETED";
  return rowStatus === filter;
};

const statusMeta = (s: string): { label: string; badge: "success" | "warning" | "error" | "default" } => {
  if (s === "PAID" || s === "COMPLETED") return { label: workspaceStatusText(s), badge: "success" };
  if (s === "PARTIALLY PAID") return { label: workspaceStatusText(s), badge: "warning" };
  if (s === "NOT PAID") return { label: workspaceStatusText(s), badge: "error" };
  return { label: s, badge: "default" };
};

const summaryBadge = (s: string): "success" | "warning" | "error" | "default" => {
  if (s === "COMPLETED" || s === "PAID") return "success";
  if (s === "PARTIALLY PAID") return "warning";
  if (s === "NOT PAID") return "error";
  return "default";
};

export default function FinancePaymentsPage() {
  // Voiding is an admin action. The route refuses a bursar; this keeps the
  // control off their screen so they are not offered something that will fail.
  const { canChangeLedger } = useFinanceRole();
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
  const [today, setToday] = useState<TodayData | null>(null);
  const [sortKey, setSortKey] = useState<"balance" | "name" | "class">("balance");
  const [historyMethod, setHistoryMethod] = useState("");
  const [historyFrom, setHistoryFrom] = useState("");
  const [historyTo, setHistoryTo] = useState("");
  const [receiptInput, setReceiptInput] = useState("");
  const [receiptQuery, setReceiptQuery] = useState("");
  const [remindOpen, setRemindOpen] = useState(false);

  // Payment form
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("Cash");
  const [accountId, setAccountId] = useState("");
  const [payDate, setPayDate] = useState("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [senderName, setSenderName] = useState("");
  const [saving, setSaving] = useState(false);
  const amountRef = useRef<HTMLInputElement>(null);
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
    Promise.all([
      fetchArray<Term>("/api/school-admin/terms"),
      fetchObject<{ terms: TermActivity[] }>("/api/school-admin/finance/terms-summary"),
    ]).then(([rows, summary]) => {
      setTerms(rows);
      const activity = summary?.terms ?? [];
      const current = pickFinanceTerm(rows, activity, schoolTodayISO());
      if (current) setTermId(current.id);
    });
  }, []);

  const loadToday = useCallback(() => {
    fetchObject<TodayData>("/api/school-admin/finance/today").then(setToday);
  }, []);

  useEffect(() => {
    loadToday();
  }, [loadToday]);

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
    const params = new URLSearchParams();
    if (historyMethod) params.set("method", historyMethod);
    if (historyFrom) params.set("date_from", historyFrom);
    if (historyTo) params.set("date_to", historyTo);
    if (receiptQuery) params.set("receipt", receiptQuery);

    // Recent payments across terms: the last 30 days by default. A receipt
    // lookup or an explicit from-date searches all time instead.
    if (!receiptQuery && !historyFrom) {
      const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);
      params.set("date_from", from);
    }

    const qs = params.toString();
    fetchArray<PaymentRow>(`/api/school-admin/finance/payments${qs ? `?${qs}` : ""}`).then(setPayments);
  }, [historyMethod, historyFrom, historyTo, receiptQuery]);

  useEffect(() => {
    loadPayments();
  }, [loadPayments]);

  // ── Derived: classes present in the term, sorted by name ──
  const classes = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    for (const r of rows) {
      const key = r.class_id || "__none__";
      if (!map.has(key)) map.set(key, { id: r.class_id || "", name: r.class_name || "(no class)" });
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);

  // ── Derived: term-level payment-health counts AND amounts (complete dataset) ──
  const stats = useMemo(() => {
    const unpaid = { count: 0, amount: 0 };
    const partial = { count: 0, amount: 0 };
    const paid = { count: 0, amount: 0 };
    let outstanding = 0;

    for (const r of rows) {
      outstanding += r.outstanding;
      if (r.payment_status === "NOT PAID") {
        unpaid.count += 1;
        unpaid.amount += r.outstanding;
      } else if (r.payment_status === "PARTIALLY PAID") {
        partial.count += 1;
        partial.amount += r.outstanding;
      } else {
        paid.count += 1;
        paid.amount += r.paid + r.applied_credit;
      }
    }

    return { total: rows.length, unpaid, partial, paid, outstanding: Math.round(outstanding * 100) / 100 };
  }, [rows]);

  const orderedTerms = useMemo(() => {
    const current = terms.find((t) => t.id === termId);
    const rest = terms
      .filter((t) => t.id !== termId)
      .sort((a, b) => b.start_date.localeCompare(a.start_date));
    return current ? [current, ...rest] : rest;
  }, [terms, termId]);

  // ── Derived: visible rows after combined filters ──
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
      .sort((a, b) => {
        if (sortKey === "name") return a.student_name.localeCompare(b.student_name);
        if (sortKey === "class") {
          return (
            (a.class_name || "").localeCompare(b.class_name || "") ||
            a.student_name.localeCompare(b.student_name)
          );
        }
        return b.outstanding - a.outstanding || a.student_name.localeCompare(b.student_name);
      });
  }, [rows, classFilter, statusFilter, q, sortKey]);

  // Excel export of the list as filtered by CLASS and STATUS. The name search
  // is a client-side convenience and is not sent — the file never claims to be
  // more filtered than it is (the button says so in its title).
  const exportHref = () => {
    const p = new URLSearchParams({ type: "students" });
    if (termId) p.set("term_id", termId);
    if (classFilter) p.set("class_id", classFilter);
    if (statusFilter) {
      p.set(
        "status",
        statusFilter === "NOT PAID" ? "unpaid" : statusFilter === "PARTIALLY PAID" ? "partial" : "paid",
      );
    }
    return `/api/school-admin/finance/reports/export?${p.toString()}`;
  };

  const reminderHref = (row: StudentRow): string | null => {
    if (!row.parent_phone || row.outstanding <= 0) return null;
    return whatsAppLink(
      row.parent_phone,
      `Dear parent, this is a reminder that ${row.student_name}'s outstanding balance for ${
        termName || "this term"
      } is ${money(row.outstanding)}. Kindly settle it at the school office. Thank you.`,
    );
  };

  // Arrived from a bill's "Record payment" link (?student=Name) → open that
  // student's panel automatically once the list is loaded.
  const applyWorkspace = useCallback((d: Workspace) => {
    setWs(d);
    // The cash-desk default: the balance is prefilled, because most payments
    // are for the full amount. A part payment is a single edit; an empty field
    // made every full payment a retype of the same number.
    setAmount(d.summary.outstanding > 0 ? String(d.summary.outstanding) : "");
    // Method defaults to what this bursar last used (cash desks are consistent).
    const preferred = rememberedMethod() || "Cash";
    setMethod(preferred);
    setAccountId(ACCOUNT_METHODS.includes(preferred) ? d.accounts[0]?.id || "" : "");
    setPayDate(new Date().toISOString().slice(0, 10));
    setReference("");
    setNote("");
    setSenderName("");
    setSuccess(null);
  }, []);

  useEffect(() => {
    if (ws) amountRef.current?.focus();
  }, [ws]);

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
      const applied = Number(d?.credit_applied || 0);
      showToast({
        type: "success",
        title: `${removeTarget.fee_name} removed${credited > 0 ? ` — ${money(credited)} converted to credit` : ""}${applied > 0 ? `, ${money(applied)} applied to the bill` : ""}`,
      });
      await refreshWs();
    } else {
      showToast({ type: "error", title: d?.error || "Could not remove fee" });
    }
  };

  const chooseMethod = (m: string) => {
    setMethod(m);
    try {
      window.localStorage.setItem(LAST_METHOD_KEY, m);
    } catch {
      // Private mode or a blocked storage API: remembering is a nicety, not a requirement.
    }
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
        credit_applied: Number(d?.credit_applied || 0),
        balance: d?.balance || null,
      });
      // Clean slate: the form must never hold the previous payment's amount.
      setAmount("");
      setReference("");
      setNote("");
      setSenderName("");
      loadPayments();
      loadToday();
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
      loadToday();
      if (ws) refreshWs();
    } else {
      showToast({ type: "error", title: "Void failed" });
    }
  };

  const postedTotal = payments.filter((p) => p.status === "active").reduce((s, p) => s + p.amount, 0);
  const reminderRows = visible.filter((r) => reminderHref(r));
  const filtersActive = classFilter !== "" || statusFilter !== "" || q.trim() !== "";
  const selectCls =
    "w-full rounded-md border border-border bg-surface px-3 py-2 text-caption text-text-primary focus:outline-none focus:ring-2 focus:ring-primary";

  return (
    <div className="space-y-5">
      {/* Term */}
      <TermSelect terms={orderedTerms} value={termId} onChange={setTermId} />
      <PastTermNotice term={orderedTerms.find((t) => t.id === termId) || null} />

      {/* Today's cash desk */}
      <Card padding="md">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-caption uppercase tracking-wide text-text-muted font-semibold">
              Today&apos;s collection
            </p>
            <p className="text-h2 font-bold text-text-primary mt-0.5">
              {today ? money(today.total) : "—"}
            </p>
            <p className="text-caption text-text-secondary">
              {today
                ? `${today.count} receipt${today.count === 1 ? "" : "s"} recorded`
                : "Loading today's collections…"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {today && today.by_method.length > 0 ? (
              today.by_method.map((row) => (
                <span
                  key={row.method}
                  className="px-2.5 py-1 rounded-full bg-clay text-caption font-semibold text-text-secondary"
                >
                  {row.method} · {money(row.total)} ({row.count})
                </span>
              ))
            ) : (
              <span className="text-caption text-text-muted">No collections yet today.</span>
            )}
          </div>
        </div>
      </Card>

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

          {/* Filters — one search, one class filter; status is the tiles below. */}
          {termId && rowsTerm === termId && rows.length > 0 && (
            <>
              <div className="grid grid-cols-1 tablet:grid-cols-3 gap-3 mb-4">
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
                <div className="tablet:col-span-2">
                  <label className="text-caption text-text-secondary block mb-1">Search student</label>
                  <Input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Search by name — press Enter to open the first match"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && visible.length > 0) {
                        e.preventDefault();
                        void pickStudent(visible[0]);
                      }
                    }}
                  />
                </div>
              </div>

              {/* Clickable money tiles: count AND amount, not just a headcount. */}
              {rowsTerm === termId && (
                <div className="grid grid-cols-2 tablet:grid-cols-4 gap-2 mb-4">
                  {[
                    { key: "", label: "All students", count: stats.total, amount: stats.outstanding, caption: "outstanding" },
                    { key: "NOT PAID", label: "Unpaid", count: stats.unpaid.count, amount: stats.unpaid.amount, caption: "outstanding" },
                    { key: "PARTIALLY PAID", label: "Part-paid", count: stats.partial.count, amount: stats.partial.amount, caption: "outstanding" },
                    { key: "PAID", label: "Paid", count: stats.paid.count, amount: stats.paid.amount, caption: "collected" },
                  ].map((tile) => {
                    const active = statusFilter === tile.key;
                    return (
                      <button
                        key={tile.label}
                        type="button"
                        aria-pressed={active}
                        onClick={() => setStatusFilter(tile.key)}
                        className={`text-left rounded-lg border p-3 transition-colors ${
                          active
                            ? "border-primary bg-primary-light"
                            : "border-border bg-clay hover:border-primary/50"
                        }`}
                      >
                        <p className="text-caption text-text-secondary font-semibold">{tile.label}</p>
                        <p className="text-body font-extrabold text-text-primary mt-0.5">{tile.count}</p>
                        <p className="text-caption text-text-secondary">
                          <span className="font-semibold text-text-primary">{money(tile.amount)}</span>{" "}
                          {tile.caption}
                        </p>
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
                <p className="text-caption text-text-secondary">
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
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setRemindOpen(true)}>
                    Remind unpaid
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => window.print()}>
                    Print list
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => window.open(exportHref(), "_blank")}>
                    Export Excel
                  </Button>
                </div>
              </div>

              {/* Desktop column headers */}
              <div className="hidden tablet:grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_100px_100px_100px_92px_190px] items-center gap-2 px-4 pb-1 text-caption font-semibold text-text-secondary uppercase tracking-wider">
                <button type="button" onClick={() => setSortKey("name")} className="text-left">Student</button>
                <button type="button" onClick={() => setSortKey("class")} className="text-left">Class</button>
                <span className="text-right">Expected</span>
                <span className="text-right">Paid</span>
                <button type="button" onClick={() => setSortKey("balance")} className="text-right">Balance</button>
                <span className="text-center">Status</span>
                <span className="text-right">Action</span>
              </div>

              <div className="space-y-1.5">
                {visible.map((r) => {
                  const st = statusMeta(r.payment_status);
                  const reminder = reminderHref(r);
                  const paidTotal = r.paid + r.applied_credit;
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
                      className="rounded-lg bg-surface border border-border px-4 py-3 hover:bg-clay hover:border-primary/40 transition-colors cursor-pointer"
                    >
                      {/* Desktop row */}
                      <div className="hidden tablet:grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_100px_100px_100px_92px_190px] items-center gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold text-text-primary truncate">{r.student_name}</p>
                          {r.parent_phone && (
                            <p className="text-caption text-text-muted truncate">{r.parent_phone}</p>
                          )}
                        </div>
                        <p className="text-caption text-text-secondary truncate">{r.class_name || "—"}</p>
                        <p className="text-right text-caption font-semibold text-text-primary">{money(r.net_amount)}</p>
                        <p className="text-right text-caption font-semibold text-success">{money(paidTotal)}</p>
                        <p className={`text-right text-caption font-bold ${r.outstanding > 0 ? "text-warning" : "text-success"}`}>
                          {money(r.outstanding)}
                        </p>
                        <span className="flex justify-center">
                          <Badge variant={st.badge}>{st.label}</Badge>
                        </span>
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              void pickStudent(r);
                            }}
                          >
                            Record payment
                          </Button>
                          {reminder && (
                            <a
                              href={reminder}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="text-caption font-semibold text-primary underline whitespace-nowrap"
                            >
                              Remind
                            </a>
                          )}
                        </div>
                      </div>

                      {/* Mobile card — the balance is the headline */}
                      <div className="tablet:hidden">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-semibold text-text-primary truncate">{r.student_name}</p>
                            <p className="text-caption text-text-secondary">{r.class_name || "—"}</p>
                          </div>
                          <Badge variant={st.badge}>{st.label}</Badge>
                        </div>
                        <div className="grid grid-cols-3 gap-2 mt-2 text-center">
                          <div>
                            <p className="text-caption text-text-muted">Expected</p>
                            <p className="text-caption font-semibold text-text-primary">{money(r.net_amount)}</p>
                          </div>
                          <div>
                            <p className="text-caption text-text-muted">Paid</p>
                            <p className="text-caption font-semibold text-success">{money(paidTotal)}</p>
                          </div>
                          <div>
                            <p className="text-caption text-text-muted">Balance</p>
                            <p className={`text-h3 font-bold ${r.outstanding > 0 ? "text-warning" : "text-success"}`}>
                              {money(r.outstanding)}
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 mt-3">
                          <Button
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              void pickStudent(r);
                            }}
                          >
                            Record payment
                          </Button>
                          {reminder && (
                            <a
                              href={reminder}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="text-caption font-semibold text-primary underline"
                            >
                              Remind
                            </a>
                          )}
                          <Link
                            href={`/school-admin/finance/students/${r.student_id}?term_id=${encodeURIComponent(r.term_id)}`}
                            onClick={(e) => e.stopPropagation()}
                            className="text-caption font-semibold text-text-secondary underline ml-auto"
                          >
                            Account
                          </Link>
                        </div>
                      </div>
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

          {!termId || rowsTerm !== termId ? (
            <p className="text-caption text-text-secondary py-8 text-center">Loading students…</p>
          ) : rows.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-h3 font-bold text-text-primary">No bills for {termName || "this term"}</p>
              <p className="text-small text-text-secondary mt-1 max-w-md mx-auto">
                A payment cannot be collected until bills exist for this term.
              </p>
              <Link
                href={`/school-admin/finance/billing?term_id=${encodeURIComponent(termId)}`}
                className="inline-flex items-center justify-center font-semibold rounded-lg px-5 py-2.5 text-body min-h-[42px] bg-primary text-white hover:bg-primary-dark mt-4"
              >
                Generate bills for this term
              </Link>
              <p className="text-caption text-text-muted mt-2">
                Only an administrator can generate bills. A bursar should ask their school admin.
              </p>
            </div>
          ) : null}
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
                <div className="flex items-baseline justify-between gap-2">
                  <label className="text-caption text-text-secondary block mb-1">Amount received ({currencySymbol()})</label>
                  {ws.summary.outstanding > 0 && (
                    <button
                      type="button"
                      onClick={() => setAmount(String(ws.summary.outstanding))}
                      className="text-caption font-semibold text-primary underline whitespace-nowrap"
                    >
                      Pay full balance ({money(ws.summary.outstanding)})
                    </button>
                  )}
                </div>
                <Input
                  ref={amountRef}
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void record();
                    }
                  }}
                  min={0}
                />
                <p className="text-caption text-text-muted mt-1">
                  The full balance is prefilled. Change it for a part payment.
                </p>
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
              The payment is allocated automatically across this student&apos;s outstanding fees, in the order above. Any
              credit the student already holds is applied first. Any amount beyond the balance becomes credit on the
              student&apos;s account, and a receipt is issued immediately.
            </p>
          </Card>
        </>
      )}

      {/* Recent payments — across terms, last 30 days by default */}
      <div>
        <div className="flex items-end justify-between flex-wrap gap-2 mb-2">
          <div>
            <p className="text-caption font-semibold text-text-secondary uppercase tracking-wider">
              Recent payments
            </p>
            <p className="text-caption text-text-secondary">
              Across all terms · last 30 days by default
            </p>
          </div>
          <p className="text-caption text-text-secondary">
            <b className="text-success">{money(postedTotal)}</b> collected from{" "}
            {payments.filter((p) => p.status === "active").length} payments
          </p>
        </div>

        <div className="grid grid-cols-2 tablet:grid-cols-4 gap-2 mb-3">
          <select
            value={historyMethod}
            onChange={(e) => setHistoryMethod(e.target.value)}
            className={selectCls}
            aria-label="Filter payments by method"
          >
            <option value="">All methods</option>
            {METHODS.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
          <Input type="date" value={historyFrom} onChange={(e) => setHistoryFrom(e.target.value)} aria-label="Payments from date" />
          <Input type="date" value={historyTo} onChange={(e) => setHistoryTo(e.target.value)} aria-label="Payments to date" />
          <div className="flex gap-2">
            <Input
              value={receiptInput}
              onChange={(e) => setReceiptInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  setReceiptQuery(receiptInput.trim());
                }
              }}
              placeholder="Receipt number…"
            />
            <Button size="sm" variant="secondary" onClick={() => setReceiptQuery(receiptInput.trim())}>
              Find
            </Button>
          </div>
        </div>
        {(historyMethod || historyFrom || historyTo || receiptQuery) && (
          <button
            type="button"
            onClick={() => {
              setHistoryMethod("");
              setHistoryFrom("");
              setHistoryTo("");
              setReceiptInput("");
              setReceiptQuery("");
            }}
            className="text-caption font-semibold text-error underline mb-2"
          >
            Clear payment filters
          </button>
        )}

        <div className="hidden tablet:grid grid-cols-[1.5fr_1fr_120px_100px_190px] items-center gap-2 px-4 pb-1 text-caption font-semibold text-text-secondary uppercase tracking-wider">
          <span>Date · Student</span>
          <span>Method</span>
          <span className="text-right">Amount</span>
          <span className="text-center">Status</span>
          <span className="text-right">Actions</span>
        </div>

        <div className="space-y-2">
          {payments.map((p) => {
            const st = paymentStatusLabel(p.status);
            const term = p.term_id ? terms.find((t) => t.id === p.term_id) : null;
            return (
              <div key={p.id} className="rounded-lg bg-surface border border-border px-4 py-3">
                {/* Desktop */}
                <div className="hidden tablet:grid grid-cols-[1.5fr_1fr_120px_100px_190px] items-center gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-text-primary truncate">{p.student_name}</p>
                    <p className="text-caption text-text-secondary truncate">
                      {formatDate(p.paid_at)}
                      {term ? ` · ${termLabel(term)}` : ""}
                      {p.receipt_number ? ` · ${p.receipt_number}` : ""}
                    </p>
                  </div>
                  <p className="text-caption text-text-secondary">
                    {p.method || "—"}
                    {p.sender_name ? ` · ${p.sender_name}` : ""}
                  </p>
                  <p className={`text-right font-bold ${p.status === "active" ? "text-text-primary" : "text-text-disabled line-through"}`}>
                    {money(p.amount)}
                  </p>
                  <span className="flex justify-center">
                    <Badge variant={st.badge}>{st.label}</Badge>
                  </span>
                  <div className="flex items-center justify-end gap-2">
                    {p.receipt_id && (
                      <a href={receiptPdfUrl(p.receipt_id)} target="_blank" rel="noopener noreferrer" className="text-caption font-semibold text-primary underline whitespace-nowrap">
                        Print
                      </a>
                    )}
                    {p.receipt_id && (
                      <a href={receiptPdfUrl(p.receipt_id, true)} download className="text-caption font-semibold text-text-secondary underline whitespace-nowrap">
                        Download
                      </a>
                    )}
                    {p.status === "active" && canChangeLedger && (
                      <button onClick={() => setVoidTarget(p)} className="text-caption font-semibold text-error underline whitespace-nowrap">
                        Void
                      </button>
                    )}
                  </div>
                </div>

                {/* Mobile */}
                <div className="tablet:hidden">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-text-primary truncate">{p.student_name}</p>
                      <p className="text-caption text-text-secondary truncate">
                        {formatDate(p.paid_at)}
                        {term ? ` · ${termLabel(term)}` : ""}
                      </p>
                    </div>
                    <Badge variant={st.badge}>{st.label}</Badge>
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-2">
                    <p className="text-caption text-text-secondary">
                      {p.method || "—"}
                      {p.receipt_number ? ` · ${p.receipt_number}` : ""}
                    </p>
                    <p className={`text-body font-bold ${p.status === "active" ? "text-text-primary" : "text-text-disabled line-through"}`}>
                      {money(p.amount)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-3 mt-2">
                    {p.receipt_id && (
                      <a href={receiptPdfUrl(p.receipt_id)} target="_blank" rel="noopener noreferrer" className="text-caption font-semibold text-primary underline">
                        Print
                      </a>
                    )}
                    {p.receipt_id && (
                      <a href={receiptPdfUrl(p.receipt_id, true)} download className="text-caption font-semibold text-text-secondary underline">
                        Download
                      </a>
                    )}
                    {p.status === "active" && canChangeLedger && (
                      <button onClick={() => setVoidTarget(p)} className="text-caption font-semibold text-error underline">
                        Void
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          {payments.length === 0 && (
            <Card padding="md" className="text-center">
              <p className="text-caption text-text-secondary">
                No payments found in this window. Try a wider date range or a receipt number.
              </p>
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

      {/* Bulk reminder links — nothing is sent automatically */}
      <Modal isOpen={remindOpen} onClose={() => setRemindOpen(false)} title="Send payment reminders">
        <div className="space-y-4">
          <p className="text-caption text-text-secondary">
            Each link opens WhatsApp with the student, balance and term already written. Nothing is sent automatically.
          </p>
          {reminderRows.length === 0 ? (
            <p className="text-caption text-text-muted text-center py-4">
              No student in this filter has a parent phone number and an outstanding balance.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {reminderRows.map((row) => {
                const href = reminderHref(row);
                return (
                  <li key={row.id} className="py-2.5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-small font-medium text-text-primary truncate">{row.student_name}</p>
                      <p className="text-caption text-text-muted">
                        {row.class_name || "—"} · {money(row.outstanding)} outstanding
                      </p>
                    </div>
                    {href && (
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-caption font-semibold text-primary underline shrink-0"
                      >
                        Open WhatsApp
                      </a>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Modal>
    </div>
  );
}
