"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Card, Button, Input, Badge, Modal, showToast } from "@/components/ui";
import { money, fetchArray, fetchObject } from "@/components/finance/helpers";

// Student Finance Workspace (Phase A) — one screen for the whole workflow:
// identity → summary → required fees → optional fee → payment → receipt.

type Term = { id: string; name: string; is_active: boolean };
type Account = { id: string; bank_name: string; account_name: string; account_number: string; is_active: boolean };
type FeeRow = { fee_head_id: string; fee_name: string; amount: number; waived: number; paid: number; outstanding: number };
type PaymentRow = {
  id: string;
  paid_at: string;
  amount: number;
  method: string | null;
  reference: string | null;
  paid_into: string | null;
  status: string;
  receipt_number: string | null;
  receipt_id: string | null;
  breakdown: { fee: string; amount: number }[];
};
type Workspace = {
  student: { id: string; name: string; gender: string | null; class_name: string | null; parent_name: string | null; parent_phone: string | null };
  term: { id: string; name: string; session_name: string | null };
  bill: { id: string; status: string | null } | null;
  summary: { expected: number; paid: number; applied_credit: number; outstanding: number; available_credit: number; status: string };
  fees: FeeRow[];
  optional_fees: { id: string; name: string; amount: number }[];
  accounts: Account[];
  payments: PaymentRow[];
};

const METHODS = ["Transfer", "Cash", "POS", "Cheque", "Online", "Other"];
const statusBadge = (s: string): "success" | "warning" | "error" | "info" | "default" => {
  if (s === "COMPLETED" || s === "PAID") return "success";
  if (s === "PARTIALLY PAID") return "warning";
  if (s === "NOT PAID") return "error";
  return "default";
};

export default function StudentFinanceWorkspacePage() {
  const { studentId } = useParams<{ studentId: string }>();
  const [terms, setTerms] = useState<Term[]>([]);
  const [termId, setTermId] = useState("");
  const [data, setData] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);

  // Optional fee modal
  const [optOpen, setOptOpen] = useState(false);
  const [addingOpt, setAddingOpt] = useState<string | null>(null);

  // Payment form
  const [payOpen, setPayOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("Transfer");
  const [accountId, setAccountId] = useState("");
  const [payDate, setPayDate] = useState("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [lastReceipt, setLastReceipt] = useState<{ number: string; id: string } | null>(null);

  useEffect(() => {
    fetchArray<Term>("/api/school-admin/terms").then((rows) => {
      setTerms(rows);
      const active = rows.find((t) => t.is_active) || rows[0];
      if (active) setTermId(active.id);
    });
  }, []);

  const load = useCallback(() => {
    if (!termId) return;
    setLoading(true);
    fetchObject<Workspace>(`/api/school-admin/finance/students/${studentId}/workspace?term_id=${encodeURIComponent(termId)}`).then((d) => {
      setData(d);
      setLoading(false);
    });
  }, [studentId, termId]);
  useEffect(() => {
    if (terms.length > 0) load();
  }, [terms, load]);

  const openPay = () => {
    if (!data) return;
    setAmount(String(data.summary.outstanding > 0 ? data.summary.outstanding : ""));
    setAccountId(data.accounts[0]?.id || "");
    setPayDate(new Date().toISOString().slice(0, 10));
    setReference("");
    setNote("");
    setPayOpen(true);
  };

  const recordPayment = async () => {
    if (!data?.bill) return;
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) return;
    setSaving(true);
    const res = await fetch("/api/school-admin/finance/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        student_id: data.student.id,
        bill_id: data.bill.id,
        term_id: termId,
        amount: amt,
        method,
        reference: reference.trim() || null,
        notes: note.trim() || null,
        school_account_id: accountId || null,
        paid_at: payDate || undefined,
      }),
    });
    const d = await res.json().catch(() => ({}));
    setSaving(false);
    if (res.ok) {
      showToast({ type: "success", title: `Payment recorded — receipt ${d?.receipt?.receipt_number || d?.payment?.receipt_number || ""}` });
      if (d?.receipt) setLastReceipt({ number: d.receipt.receipt_number, id: d.receipt.id });
      setPayOpen(false);
      load();
    } else {
      showToast({ type: "error", title: d?.error || "Payment failed" });
    }
  };

  const addOptionalFee = async (feeHeadId: string, amountValue: number) => {
    if (!data?.bill) return;
    setAddingOpt(feeHeadId);
    const res = await fetch(`/api/school-admin/finance/billing/${data.bill.id}/add-fee`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fee_head_id: feeHeadId, amount: amountValue }),
    });
    const d = await res.json().catch(() => ({}));
    setAddingOpt(null);
    if (res.ok) {
      showToast({ type: "success", title: "Optional fee added to this student's account" });
      load();
    } else {
      showToast({ type: "error", title: d?.error || "Failed to add fee" });
    }
  };

  if (loading && !data) return <p className="text-caption text-text-secondary py-10 text-center">Loading…</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <Link href="/school-admin/finance/billing" className="text-caption font-semibold text-primary underline">
          ← Back to billing
        </Link>
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
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
      </div>

      {!data ? (
        <Card padding="md" className="text-center">
          <p className="text-caption text-text-secondary">Could not load this student's finance workspace.</p>
        </Card>
      ) : (
        <>
          {/* Identity */}
          <Card>
            <div className="flex items-start justify-between flex-wrap gap-3">
              <div>
                <p className="text-h2 font-bold text-text-primary">{data.student.name}</p>
                <p className="text-caption text-text-secondary">
                  {[data.student.gender, data.student.class_name].filter(Boolean).join(" · ") || "No class"}
                </p>
                <p className="text-caption text-text-secondary mt-1">
                  {data.term.name}
                  {data.term.session_name ? ` · ${data.term.session_name} Session` : ""}
                </p>
                {(data.student.parent_name || data.student.parent_phone) && (
                  <p className="text-caption text-text-secondary mt-1">
                    Parent/Guardian: {data.student.parent_name || "—"}
                    {data.student.parent_phone ? ` · ${data.student.parent_phone}` : ""}
                  </p>
                )}
              </div>
              <Badge variant={statusBadge(data.summary.status)}>{data.summary.status || "NO BILL"}</Badge>
            </div>
          </Card>

          {/* Summary */}
          <div className="grid grid-cols-2 tablet:grid-cols-5 gap-3 text-center">
            {[
              { label: "Expected", value: money(data.summary.expected), cls: "text-text-primary" },
              { label: "Paid", value: money(data.summary.paid), cls: "text-success" },
              { label: "Balance", value: money(data.summary.outstanding), cls: data.summary.outstanding > 0 ? "text-warning" : "text-success" },
              { label: "Credit", value: money(data.summary.available_credit), cls: data.summary.available_credit > 0 ? "text-primary" : "text-text-secondary" },
              { label: "Status", value: data.summary.status || "—", cls: "text-text-primary" },
            ].map((x) => (
              <div key={x.label} className="rounded-lg bg-clay py-3">
                <p className={`text-body font-extrabold ${x.cls}`}>{x.value}</p>
                <p className="text-caption text-text-secondary">{x.label}</p>
              </div>
            ))}
          </div>

          {!data.bill ? (
            <Card padding="md" className="text-center space-y-2">
              <p className="text-caption text-text-secondary">
                This student has no bill for {data.term.name} yet. Generate bills for the term first.
              </p>
              <Link href="/school-admin/finance/billing" className="inline-block text-caption font-semibold text-primary underline">
                Go to Billing →
              </Link>
            </Card>
          ) : (
            <>
              {/* Fees */}
              <Card>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-caption font-semibold text-text-secondary uppercase tracking-wider">Required fees</p>
                  <Button size="sm" variant="secondary" onClick={() => setOptOpen(true)} disabled={data.optional_fees.length === 0}>
                    + Add optional fee
                  </Button>
                </div>
                <div className="space-y-1.5">
                  {data.fees.map((f) => (
                    <div key={f.fee_head_id} className="flex items-center justify-between text-body">
                      <span className="text-text-primary">{f.fee_name}</span>
                      <span className="text-caption text-text-secondary">
                        {f.paid > 0 && <b className="text-success">{money(f.paid)} paid</b>}
                        {f.outstanding > 0 ? <> · <b className="text-warning">{money(f.outstanding)} left</b></> : f.paid === 0 ? <b>{money(f.amount)}</b> : null}
                      </span>
                    </div>
                  ))}
                  {data.fees.length === 0 && <p className="text-caption text-text-secondary text-center py-3">No fees on this bill.</p>}
                </div>
              </Card>

              {/* Actions */}
              <div className="flex flex-col tablet:flex-row gap-2">
                <Button fullWidth onClick={openPay}>
                  💳 Make payment
                </Button>
                <Link href={`/school-admin/finance/billing/${data.bill.id}`} className="w-full">
                  <Button variant="secondary" fullWidth>View full bill</Button>
                </Link>
              </div>

              {lastReceipt && (
                <Card variant="clay" padding="md" className="flex items-center justify-between gap-3">
                  <p className="text-caption text-text-primary">✅ Receipt <b>{lastReceipt.number}</b> issued</p>
                  <a href={`/api/school-admin/finance/receipts/${lastReceipt.id}/pdf`} target="_blank" className="text-caption font-semibold text-primary underline">
                    View / download PDF
                  </a>
                </Card>
              )}

              {/* Payment history */}
              <div>
                <p className="text-caption font-semibold text-text-secondary uppercase tracking-wider mb-2">Payment history</p>
                <div className="space-y-2">
                  {data.payments.map((p) => (
                    <div key={p.id} className="rounded-lg bg-surface border border-border px-4 py-3">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="min-w-0">
                          <p className="font-semibold text-text-primary">
                            {money(p.amount)}
                            {p.status === "voided" && <Badge variant="error" className="ml-2">Voided</Badge>}
                          </p>
                          <p className="text-caption text-text-secondary">
                            {new Date(p.paid_at).toLocaleDateString()} · {p.method || "—"}
                            {p.paid_into ? ` · ${p.paid_into}` : ""}
                            {p.reference ? ` · ${p.reference}` : ""}
                          </p>
                          {p.breakdown.length > 0 && (
                            <p className="text-caption text-text-disabled mt-0.5">{p.breakdown.map((b) => `${b.fee} ${money(b.amount)}`).join(" · ")}</p>
                          )}
                        </div>
                        {p.receipt_id ? (
                          <a
                            href={`/api/school-admin/finance/receipts/${p.receipt_id}/pdf`}
                            target="_blank"
                            className="text-caption font-semibold text-primary underline shrink-0"
                          >
                            Receipt {p.receipt_number}
                          </a>
                        ) : (
                          <span className="text-caption text-text-disabled shrink-0">No receipt</span>
                        )}
                      </div>
                    </div>
                  ))}
                  {data.payments.length === 0 && <p className="text-caption text-text-secondary text-center py-3">No payments recorded for this term.</p>}
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* Optional fee modal */}
      <Modal isOpen={optOpen} onClose={() => setOptOpen(false)} title="Add optional fee">
        <div className="space-y-2">
          {data?.optional_fees.map((f) => (
            <div key={f.id} className="flex items-center justify-between rounded-lg bg-clay px-3 py-2">
              <div>
                <p className="text-caption font-medium text-text-primary">{f.name}</p>
                <p className="text-caption text-text-secondary">{money(f.amount)}</p>
              </div>
              <Button size="sm" onClick={() => addOptionalFee(f.id, f.amount)} loading={addingOpt === f.id}>
                Add to account
              </Button>
            </div>
          ))}
          {data?.optional_fees.length === 0 && (
            <p className="text-caption text-text-secondary text-center py-4">
              No optional fees are configured for this class/term yet — set them in Fee Setup first.
            </p>
          )}
        </div>
      </Modal>

      {/* Make payment modal */}
      <Modal isOpen={payOpen} onClose={() => setPayOpen(false)} title="Make payment">
        <div className="space-y-4">
          {data && (
            <div className="rounded-lg bg-clay p-3 text-caption text-text-secondary flex flex-wrap gap-x-6 gap-y-1">
              <span>Expected <b className="text-text-primary">{money(data.summary.expected)}</b></span>
              <span>Paid <b className="text-success">{money(data.summary.paid)}</b></span>
              <span>Balance <b className="text-warning">{money(data.summary.outstanding)}</b></span>
            </div>
          )}
          <div>
            <label className="text-caption text-text-secondary block mb-1">Amount received (₦)</label>
            <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} min={0} />
          </div>
          <div>
            <label className="text-caption text-text-secondary block mb-1">Method</label>
            <div className="flex gap-2 flex-wrap">
              {METHODS.map((m) => (
                <button
                  key={m}
                  onClick={() => setMethod(m)}
                  className={`px-3 py-1.5 rounded-full text-caption font-semibold border transition-colors ${
                    method === m ? "bg-primary text-text-inverse border-primary" : "bg-surface text-text-secondary border-border"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
          {data && data.accounts.length > 0 && (
            <div>
              <label className="text-caption text-text-secondary block mb-1">Paid into (school account)</label>
              <select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-body text-text-primary focus:outline-none focus:ring-2 focus:ring-primary"
              >
                {data.accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.bank_name} · {a.account_name} · {a.account_number}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="grid grid-cols-1 tablet:grid-cols-2 gap-3">
            <div>
              <label className="text-caption text-text-secondary block mb-1">Payment date</label>
              <Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
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
          <p className="text-caption text-text-disabled">
            The payment is allocated automatically across this bill's outstanding fees, and a receipt is generated immediately. If the
            amount exceeds the balance, the extra becomes credit on this student's account.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setPayOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={recordPayment} loading={saving} disabled={!(Number(amount) > 0)}>Save payment</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
