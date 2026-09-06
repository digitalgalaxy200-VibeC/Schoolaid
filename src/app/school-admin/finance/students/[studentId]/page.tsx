"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Card, Button, Input, Badge, Modal, showToast } from "@/components/ui";
import { money, currencySymbol, fetchArray, fetchObject } from "@/components/finance/helpers";
import { PaymentSuccessModal, type PaymentSuccessData } from "@/components/finance/PaymentSuccessModal";
import { AddOptionalFeesModal, RemoveOptionalFeeModal } from "@/components/finance/OptionalFeeModals";
import { whatsAppLink } from "@/lib/finance/phone";

// Student Finance Workspace (Phase A) — one screen for the whole workflow:
// identity → summary → required fees → optional fee → payment → receipt.

type Term = { id: string; name: string; is_active: boolean };
type Account = { id: string; bank_name: string; account_name: string; account_number: string; is_active: boolean };
type FeeRow = { fee_head_id: string; fee_name: string; amount: number; waived: number; paid: number; outstanding: number; required: boolean };
type PaymentRow = {
  id: string;
  paid_at: string;
  amount: number;
  method: string | null;
  reference: string | null;
  paid_into: string | null;
  sender_name: string | null;
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
// Transfer/POS land in a specific school account; Cash & the rest do not.
const ACCOUNT_METHODS = ["Transfer", "POS"];
const statusBadge = (s: string): "success" | "warning" | "error" | "info" | "default" => {
  if (s === "COMPLETED" || s === "PAID") return "success";
  if (s === "PARTIALLY PAID") return "warning";
  if (s === "NOT PAID") return "error";
  return "default";
};

export default function StudentFinanceWorkspacePage() {
  const { studentId } = useParams<{ studentId: string }>();
  const preseedTerm = useSearchParams().get("term_id") || "";
  const [terms, setTerms] = useState<Term[]>([]);
  const [termId, setTermId] = useState("");
  const [data, setData] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);

  // Optional-fee flows (FIN-002): checklist modal + per-fee removal
  const [addOpen, setAddOpen] = useState(false);
  const [addBusy, setAddBusy] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<FeeRow | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);

  // Payment form
  const [payOpen, setPayOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("Transfer");
  const [accountId, setAccountId] = useState("");
  const [payDate, setPayDate] = useState("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [senderName, setSenderName] = useState("");
  const [saving, setSaving] = useState(false);
  // Success modal (in-app — replaces the toast-only confirmation)
  const [success, setSuccess] = useState<PaymentSuccessData | null>(null);

  useEffect(() => {
    fetchArray<Term>("/api/school-admin/terms").then((rows) => {
      setTerms(rows);
      // Prefer the term the caller asked for (e.g. the Payments list), then
      // fall back to the active term.
      const wanted = preseedTerm ? rows.find((t) => t.id === preseedTerm) : undefined;
      const active = wanted || rows.find((t) => t.is_active) || rows[0];
      if (active) setTermId(active.id);
    });
  }, [preseedTerm]);

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
    // Amount Received ALWAYS starts empty — type what actually came in.
    setAmount("");
    setAccountId(data.accounts[0]?.id || "");
    setPayDate(new Date().toISOString().slice(0, 10));
    setReference("");
    setNote("");
    setSenderName("");
    setPayOpen(true);
  };

  const chooseMethod = (m: string) => {
    setMethod(m);
    if (!ACCOUNT_METHODS.includes(m)) {
      setAccountId("");
    } else if (!accountId && data?.accounts?.[0]) {
      setAccountId(data.accounts[0].id);
    }
  };

  const recordPayment = async () => {
    if (!data?.bill) return;
    if (saving) return; // double-submit guard
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
        sender_name: senderName.trim() || null,
        school_account_id: accountId || null,
        paid_at: payDate || undefined,
      }),
    });
    const d = await res.json().catch(() => ({}));
    setSaving(false);
    if (res.ok) {
      setPayOpen(false);
      setSuccess({
        student_name: data.student.name,
        amount: amt,
        receipt: d?.receipt ? { id: d.receipt.id, receipt_number: d.receipt.receipt_number } : null,
        credit: d?.credit || null,
        balance: d?.balance || null,
      });
      load();
    } else {
      showToast({ type: "error", title: d?.error || "Payment failed" });
    }
  };

  const addManyOptional = async (ids: string[]) => {
    if (!data?.bill || ids.length === 0) return;
    const chosen = data.optional_fees.filter((f) => ids.includes(f.id));
    setAddBusy(true);
    let added = 0;
    let failed: string | null = null;
    for (const fee of chosen) {
      const res = await fetch(`/api/school-admin/finance/billing/${data.bill.id}/add-fee`, {
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
      load();
    }
    if (failed) showToast({ type: "error", title: failed });
  };

  const removeOptionalFee = async (reason: string) => {
    if (!data?.bill || !removeTarget) return;
    setRemoveBusy(true);
    const res = await fetch(`/api/school-admin/finance/billing/${data.bill.id}/remove-fee`, {
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
      load();
    } else {
      showToast({ type: "error", title: d?.error || "Could not remove fee" });
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
          <p className="text-caption text-text-secondary">Could not load this student&apos;s finance workspace.</p>
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
              {/* Fee breakdown — what this student owes, item by item */}
              <Card>
                <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                  <div>
                    <p className="text-caption font-semibold text-text-secondary uppercase tracking-wider">Fees on this bill</p>
                    <p className="text-caption text-text-disabled">Required fees are locked; optional ones can be removed.</p>
                  </div>
                  {data.optional_fees.length > 0 && (
                    <Button size="sm" variant="secondary" onClick={() => setAddOpen(true)}>
                      ＋ Add additional fee
                    </Button>
                  )}
                </div>
                <div className="space-y-1.5">
                  {data.fees.map((f) => (
                    <div key={f.fee_head_id} className="flex items-center justify-between gap-3 rounded-lg bg-clay/60 px-3 py-2">
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
                  {data.fees.length === 0 && (
                    <p className="text-caption text-text-secondary text-center py-3">
                      No fees on this bill yet — use “＋ Add additional fee” above if the parent requested an item.
                    </p>
                  )}
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

              {/* Payment history */}
              <div>
                <p className="text-caption font-semibold text-text-secondary uppercase tracking-wider mb-2">Payment history</p>
                <div className="space-y-2">
                  {data.payments.map((p) => {
                    const waLink =
                      p.receipt_id && data.student.parent_phone
                        ? whatsAppLink(
                            data.student.parent_phone,
                            `Dear ${data.student.parent_name || "Parent/Guardian"}, your payment of ${money(p.amount)} for ${data.student.name} has been recorded (Receipt ${p.receipt_number}). Thank you.`,
                          )
                        : null;
                    return (
                      <div key={p.id} className="rounded-lg bg-surface border border-border px-4 py-3">
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <div className="min-w-0">
                            <p className="font-semibold text-text-primary">
                              {money(p.amount)}
                              {p.status === "voided" && <Badge variant="error" className="ml-2">Voided</Badge>}
                            </p>
                            <p className="text-caption text-text-secondary">
                              {new Date(p.paid_at).toLocaleDateString()} · {p.method || "—"}
                              {p.sender_name ? ` · ${p.sender_name}` : ""}
                              {p.paid_into ? ` · ${p.paid_into}` : ""}
                              {p.reference ? ` · ${p.reference}` : ""}
                            </p>
                            {p.breakdown.length > 0 && (
                              <p className="text-caption text-text-disabled mt-0.5">{p.breakdown.map((b) => `${b.fee} ${money(b.amount)}`).join(" · ")}</p>
                            )}
                          </div>
                          <div className="shrink-0 flex flex-col items-end gap-1">
                            {p.receipt_id ? (
                              <a
                                href={`/api/school-admin/finance/receipts/${p.receipt_id}/pdf`}
                                target="_blank"
                                className="text-caption font-semibold text-primary underline"
                              >
                                Receipt {p.receipt_number}
                              </a>
                            ) : (
                              <span className="text-caption text-text-disabled">No receipt</span>
                            )}
                            {waLink && (
                              <a
                                href={waLink}
                                target="_blank"
                                rel="noreferrer"
                                className="text-caption font-semibold text-success underline"
                              >
                                Send receipt to parent
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {data.payments.length === 0 && <p className="text-caption text-text-secondary text-center py-3">No payments recorded for this term.</p>}
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* Optional fee checklist — nothing is added until the officer confirms */}
      {addOpen && !!data?.bill && (
        <AddOptionalFeesModal
          fees={data.optional_fees}
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
            <label className="text-caption text-text-secondary block mb-1">Amount received ({currencySymbol()})</label>
            <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} min={0} />
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
          {data && data.accounts.length > 0 && ACCOUNT_METHODS.includes(method) && (
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
          {data && data.accounts.length === 0 && ACCOUNT_METHODS.includes(method) && (
            <p className="text-caption text-warning">
              No active school account configured yet — add one in Finance → Accounts so receipts can show where the money was paid.
            </p>
          )}
          <div className="grid grid-cols-1 tablet:grid-cols-2 gap-3">
            <div>
              <label className="text-caption text-text-secondary block mb-1">Sender / Depositor name (optional)</label>
              <Input value={senderName} onChange={(e) => setSenderName(e.target.value)} placeholder="e.g. Mr. John Doe" />
            </div>
            <div>
              <label className="text-caption text-text-secondary block mb-1">Payment date</label>
              <Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-1 tablet:grid-cols-2 gap-3">
            <div>
              <label className="text-caption text-text-secondary block mb-1">Reference (optional)</label>
              <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. TRX-001" />
            </div>
            <div>
              <label className="text-caption text-text-secondary block mb-1">Note (optional)</label>
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Paid at the bank" />
            </div>
          </div>
          <p className="text-caption text-text-disabled">
            The payment is allocated automatically across this bill&apos;s outstanding fees, and a receipt is generated immediately. If the
            amount exceeds the balance, the extra becomes credit on this student&apos;s account.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setPayOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={recordPayment} loading={saving} disabled={!(Number(amount) > 0)}>Save payment</Button>
          </div>
        </div>
      </Modal>

      {/* Payment success modal (in-app — no browser dialogs) */}
      <PaymentSuccessModal
        data={success}
        parent={{ name: data?.student.parent_name, phone: data?.student.parent_phone }}
        onClose={() => { setSuccess(null); }}
      />
    </div>
  );
}
