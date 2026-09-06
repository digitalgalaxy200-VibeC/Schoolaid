"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Card, Button, Input, Badge, Modal, showToast } from "@/components/ui";
import { money, paymentStatusLabel, currencySymbol, fetchArray, fetchObject } from "@/components/finance/helpers";
import { PaymentSuccessModal, type PaymentSuccessData } from "@/components/finance/PaymentSuccessModal";
import { AddOptionalFeesModal, RemoveOptionalFeeModal } from "@/components/finance/OptionalFeeModals";

// Finance → Payments
// Record a payment inside a student's account snapshot (same data as the bill
// detail / finance workspace): summary tiles, outstanding fees, destination
// account, date, method — then an auto-allocated payment + receipt.

type Term = { id: string; name: string; is_active: boolean };
type BillLite = {
  id: string;
  student_id: string;
  student_name: string;
  class_name: string | null;
  term_id: string;
  net_amount: number;
  outstanding: number;
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
  const [studentQ, setStudentQ] = useState(preseedStudent);
  const [matches, setMatches] = useState<BillLite[]>([]);
  const [ws, setWs] = useState<Workspace | null>(null);
  const [wsLoading, setWsLoading] = useState(false);
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

  const loadPayments = useCallback(() => {
    const q = termId ? `?term_id=${encodeURIComponent(termId)}` : "";
    fetchArray<PaymentRow>(`/api/school-admin/finance/payments${q}`).then(setPayments);
  }, [termId]);
  useEffect(() => {
    if (terms.length > 0) loadPayments();
  }, [terms, loadPayments]);

  const searchStudents = useCallback(() => {
    if (!termId) return;
    fetchArray<BillLite>(`/api/school-admin/finance/billing?term_id=${encodeURIComponent(termId)}`).then((rows) => {
      const q = studentQ.trim().toLowerCase();
      setMatches(q ? rows.filter((b) => b.student_name.toLowerCase().includes(q)) : []);
    });
  }, [studentQ, termId]);
  useEffect(() => {
    const t = setTimeout(searchStudents, 250);
    return () => clearTimeout(t);
  }, [searchStudents]);

  // When the term changes, drop the picked student snapshot.
  useEffect(() => {
    setWs(null);
  }, [termId]);

  const pickStudent = async (b: BillLite) => {
    setStudentQ(b.student_name);
    setMatches([]);
    setWsLoading(true);
    const d = await fetchObject<Workspace>(
      `/api/school-admin/finance/students/${b.student_id}/workspace?term_id=${encodeURIComponent(b.term_id)}`,
    );
    setWsLoading(false);
    if (d) {
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
    } else {
      showToast({ type: "error", title: "Could not load this student's account" });
    }
  };

  // Refresh the open account snapshot after any change (fee added/removed,
  // payment recorded). The amount field is never touched here.
  const refreshWs = async () => {
    if (!ws) return;
    const d = await fetchObject<Workspace>(
      `/api/school-admin/finance/students/${ws.student.id}/workspace?term_id=${encodeURIComponent(termId)}`,
    );
    if (d) setWs(d);
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

  // Arrived from a bill's "Record payment" link → pick the single match automatically.
  useEffect(() => {
    if (!autoPicked.current && preseedStudent && matches.length === 1) {
      autoPicked.current = true;
      pickStudent(matches[0]);
    }
  }, [matches, preseedStudent]);

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

  // Success modal closed → re-pull the account snapshot so the summary tiles
  // and fee breakdown reflect the fresh balance. The amount stays empty.
  const closeSuccess = () => {
    setSuccess(null);
    refreshWs();
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

      {/* Record payment — search */}
      <Card>
        <p className="text-h3 font-bold text-text-primary mb-1">Record a payment</p>
        <p className="text-caption text-text-secondary mb-4">Search a student, review their account, then enter the amount received.</p>

        <Input value={studentQ} onChange={(e) => { setStudentQ(e.target.value); setWs(null); setSuccess(null); }} placeholder="Search student…" />

        {wsLoading && <p className="text-caption text-text-secondary py-4 text-center">Loading account…</p>}

        {!ws && !wsLoading && matches.length > 0 && (
          <div className="mt-3 max-h-56 overflow-y-auto space-y-1.5">
            {matches.map((b) => (
              <button
                key={b.id}
                onClick={() => pickStudent(b)}
                className="w-full text-left rounded-lg border border-border px-3 py-2 hover:bg-clay transition-colors flex justify-between items-center"
              >
                <span className="text-caption font-medium text-text-primary">{b.student_name} · {b.class_name || "—"}</span>
                <span className="text-caption text-warning font-bold">Owing {money(b.outstanding)}</span>
              </button>
            ))}
          </div>
        )}

        {!ws && !wsLoading && !matches.length && (
          <p className="text-caption text-text-secondary py-4 text-center">
            {studentQ ? "No student with an unpaid or existing bill matches this term." : "Start typing a student's name."}
          </p>
        )}

        {/* Account snapshot — same style as bill detail */}
        {ws && (
          <div className="mt-4 rounded-lg border border-border bg-clay p-4 space-y-4">
            <div className="flex items-start justify-between flex-wrap gap-3">
              <div>
                <p className="text-h3 font-bold text-text-primary">{ws.student.name}</p>
                <p className="text-caption text-text-secondary">
                  {ws.student.class_name || "—"} · {ws.term.name}
                  {ws.term.session_name ? ` · ${ws.term.session_name}` : ""}
                </p>
              </div>
              <Badge variant={summaryBadge(ws.summary.status)}>{ws.summary.status}</Badge>
            </div>

            <div className="grid grid-cols-2 tablet:grid-cols-4 gap-3 text-center">
              {[
                { label: "Expected", value: money(ws.summary.expected), cls: "text-text-primary" },
                { label: "Paid", value: money(ws.summary.paid), cls: "text-success" },
                { label: "Outstanding", value: money(ws.summary.outstanding), cls: ws.summary.outstanding > 0 ? "text-warning" : "text-success" },
                { label: "Credit", value: money(ws.summary.available_credit), cls: ws.summary.available_credit > 0 ? "text-primary" : "text-text-secondary" },
              ].map((x) => (
                <div key={x.label} className="rounded-lg bg-surface border border-border py-3">
                  <p className={`text-body font-extrabold ${x.cls}`}>{x.value}</p>
                  <p className="text-caption text-text-secondary">{x.label}</p>
                </div>
              ))}
            </div>

            {ws.bill && (
              <div>
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
                    <div key={f.fee_head_id} className="flex items-center justify-between gap-3 rounded-lg bg-surface border border-border px-3 py-2">
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

            <div className="grid grid-cols-1 tablet:grid-cols-2 gap-3">
              <div>
                <label className="text-caption text-text-secondary block mb-1">Amount received ({currencySymbol()})</label>
                <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} min={0} />
              </div>
              <div>
                <label className="text-caption text-text-secondary block mb-1">Payment date</label>
                <Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
              </div>
            </div>

            <div>
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
              <div>
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
              <p className="text-caption text-warning">
                No active school account configured yet — add one in the Accounts tab so receipts can show where the money was paid.
              </p>
            )}

            <div className="grid grid-cols-1 tablet:grid-cols-2 gap-3">
              <div>
                <label className="text-caption text-text-secondary block mb-1">Sender / Depositor name (optional)</label>
                <Input value={senderName} onChange={(e) => setSenderName(e.target.value)} placeholder="e.g. Mr. John Doe" />
              </div>
              <div>
                <label className="text-caption text-text-secondary block mb-1">Reference (optional)</label>
                <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. TRX-001" />
              </div>
            </div>
            <div>
              <label className="text-caption text-text-secondary block mb-1">Note (optional)</label>
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Paid at the bank" />
            </div>

            <div className="flex gap-2 flex-wrap">
              <Button onClick={record} loading={saving} disabled={!(Number(amount) > 0)}>Record payment</Button>
              <Button variant="secondary" onClick={() => { setWs(null); setStudentQ(""); }}>Cancel</Button>
            </div>
            <p className="text-caption text-text-disabled">
              The payment is allocated automatically across this student&apos;s outstanding fees, in the order above. Any amount
              beyond the balance becomes credit on the student&apos;s account, and a receipt is issued immediately.
            </p>
          </div>
        )}
      </Card>

      {/* History */}
      <div>
        <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
          <p className="text-caption font-semibold text-text-secondary uppercase tracking-wider">
            Payment history · {terms.find((t) => t.id === termId)?.name || ""}
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
