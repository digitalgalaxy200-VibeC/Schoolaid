"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Card, Button, Input, Badge, Modal, showToast } from "@/components/ui";
import { money, paymentStatusLabel, fetchArray, fetchObject } from "@/components/finance/helpers";
import { PaymentSuccessModal, type PaymentSuccessData } from "@/components/finance/PaymentSuccessModal";

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
type FeeRow = { fee_head_id: string; fee_name: string; amount: number; paid: number; outstanding: number };
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
  student: { id: string; name: string; class_name: string | null };
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
  // Optional-fee quick add (inline, above the amount field)
  const [addingOpt, setAddingOpt] = useState<string | null>(null);
  // Outstanding figure last auto-filled into the amount field — lets us
  // refresh the prefill when the account changes but never clobber a typed amount.
  const autoAmtRef = useRef<number | null>(null);

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
      autoAmtRef.current = d.summary.outstanding;
      setAmount(d.summary.outstanding > 0 ? String(d.summary.outstanding) : "");
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

  // Refresh the open account snapshot. When force is set (payment just recorded)
  // the amount refills to the remaining outstanding; otherwise the prefill only
  // updates if the officer has not typed their own amount yet.
  const refreshWs = async (force = false) => {
    if (!ws) return;
    const d = await fetchObject<Workspace>(
      `/api/school-admin/finance/students/${ws.student.id}/workspace?term_id=${encodeURIComponent(termId)}`,
    );
    if (!d) return;
    setWs(d);
    if (force || amount === "" || Number(amount) === autoAmtRef.current) {
      autoAmtRef.current = d.summary.outstanding;
      setAmount(d.summary.outstanding > 0 ? String(d.summary.outstanding) : "");
    }
  };

  // Optional fee quick-add — parent asked for an extra item while recording
  // the payment. Adds it to THIS student's bill only, then refreshes the
  // snapshot so Expected/Outstanding update before the amount is entered.
  const addOptionalFee = async (fee: { id: string; name: string; amount: number }) => {
    if (!ws?.bill) return;
    setAddingOpt(fee.id);
    const res = await fetch(`/api/school-admin/finance/billing/${ws.bill.id}/add-fee`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fee_head_id: fee.id, amount: fee.amount }),
    });
    const d = await res.json().catch(() => ({}));
    setAddingOpt(null);
    if (!res.ok) {
      showToast({ type: "error", title: d?.error || `Could not add ${fee.name}` });
      return;
    }
    showToast({ type: "success", title: `${fee.name} (${money(fee.amount)}) added to this account` });
    const fresh = await fetchObject<Workspace>(
      `/api/school-admin/finance/students/${ws.student.id}/workspace?term_id=${encodeURIComponent(termId)}`,
    );
    if (!fresh) return;
    setWs(fresh);
    if (amount === "" || Number(amount) === autoAmtRef.current) {
      autoAmtRef.current = fresh.summary.outstanding;
      setAmount(fresh.summary.outstanding > 0 ? String(fresh.summary.outstanding) : "");
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
      setReference("");
      setNote("");
      setSenderName("");
      loadPayments();
    } else {
      showToast({ type: "error", title: d?.error || "Payment failed" });
    }
  };

  // Success modal closed → re-pull the account snapshot so the summary tiles,
  // fees and the amount prefill reflect the fresh outstanding.
  const closeSuccess = () => {
    setSuccess(null);
    refreshWs(true);
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
      if (ws) refreshWs(true);
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

            {ws.fees.length > 0 && (
              <div>
                <p className="text-caption font-semibold text-text-secondary uppercase tracking-wider mb-2">Outstanding fees (auto-allocation order)</p>
                <div className="space-y-1.5">
                  {ws.fees.filter((f) => f.outstanding > 0).map((f) => (
                    <div key={f.fee_head_id} className="flex justify-between text-caption">
                      <span className="text-text-primary">{f.fee_name}</span>
                      <span className="text-text-secondary"><b className="text-text-primary">{money(f.outstanding)}</b> left of {money(f.amount)}</span>
                    </div>
                  ))}
                </div>
                {ws.fees.filter((f) => f.outstanding > 0).length === 0 && (
                  <p className="text-caption text-text-secondary">All fees on this bill are covered — an overpayment becomes credit.</p>
                )}
              </div>
            )}

            {ws.bill && ws.optional_fees.length > 0 && (
              <div>
                <p className="text-caption font-semibold text-text-secondary uppercase tracking-wider mb-1">Optional fees</p>
                <p className="text-caption text-text-disabled mb-2">
                  Parent wants an extra item? Add it to this student only — the Expected figure above updates immediately.
                </p>
                <div className="space-y-1.5">
                  {ws.optional_fees.map((f) => (
                    <div key={f.id} className="flex items-center justify-between rounded-lg bg-surface border border-border px-3 py-2">
                      <div>
                        <p className="text-caption font-medium text-text-primary">{f.name}</p>
                        <p className="text-caption text-text-secondary">{money(f.amount)}</p>
                      </div>
                      <Button size="sm" variant="secondary" onClick={() => addOptionalFee(f)} loading={addingOpt === f.id}>
                        Add
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 tablet:grid-cols-2 gap-3">
              <div>
                <label className="text-caption text-text-secondary block mb-1">Amount received (₦)</label>
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
              The payment is allocated automatically across the outstanding fees above. Any amount beyond the balance becomes credit on the
              student&apos;s account, and a receipt is issued immediately.
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
      <PaymentSuccessModal data={success} onClose={closeSuccess} />

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
