"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Card, Button, Input, Badge, Modal, showToast } from "@/components/ui";
import { money, paymentStatusLabel } from "@/components/finance/helpers";

type Bill = {
  id: string;
  student_id: string;
  student_name: string;
  class_name: string | null;
  net_amount: number;
  outstanding: number;
};
type Payment = {
  id: string;
  student_id: string;
  student_name: string;
  amount: number;
  method: string | null;
  reference: string | null;
  receipt_number: string | null;
  receipt_id: string | null;
  paid_at: string;
  status: string;
  notes: string | null;
};

const METHODS = ["Transfer", "Cash", "POS", "Cheque", "Online", "Other"];

export default function FinancePaymentsPage() {
  const searchParams = useSearchParams();
  const preseedStudent = searchParams.get("student") || "";
  const [studentQ, setStudentQ] = useState(preseedStudent);
  const [bills, setBills] = useState<Bill[]>([]);
  const [picked, setPicked] = useState<Bill | null>(null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("Cash");
  const [reference, setReference] = useState("");
  const [saving, setSaving] = useState(false);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [lastReceipt, setLastReceipt] = useState<{ number: string; id: string } | null>(null);
  const [voidTarget, setVoidTarget] = useState<Payment | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [voiding, setVoiding] = useState(false);

  const searchBills = useCallback(() => {
    fetch(`/api/school-admin/finance/billing`)
      .then((r) => r.json())
      .then((rows: Bill[]) => {
        const q = studentQ.trim().toLowerCase();
        setBills(q ? rows.filter((b) => b.student_name.toLowerCase().includes(q)) : rows);
      })
      .catch(() => {});
  }, [studentQ]);

  useEffect(() => {
    const t = setTimeout(searchBills, 250);
    return () => clearTimeout(t);
  }, [searchBills]);

  const loadPayments = useCallback(() => {
    fetch("/api/school-admin/finance/payments")
      .then((r) => r.json())
      .then(setPayments)
      .catch(() => {});
  }, []);
  useEffect(() => loadPayments(), [loadPayments]);

  const pickBill = (b: Bill) => {
    setPicked(b);
    setAmount(String(b.outstanding));
  };

  const record = async () => {
    if (!picked) return;
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) return;
    setSaving(true);
    const res = await fetch("/api/school-admin/finance/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        student_id: picked.student_id,
        bill_id: picked.id,
        amount: amt,
        method,
        reference: reference || null,
        notes: null,
      }),
    });
    const d = await res.json().catch(() => ({}));
    setSaving(false);
    if (res.ok) {
      showToast({ type: "success", title: `Payment recorded — receipt ${d.receipt?.receipt_number || ""}` });
      if (d.receipt) setLastReceipt({ number: d.receipt.receipt_number, id: d.receipt.id });
      setPicked(null);
      setAmount("");
      setReference("");
      searchBills();
      loadPayments();
    } else {
      showToast({ type: "error", title: d?.error || "Failed" });
    }
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
      showToast({ type: "success", title: "Payment voided" });
      loadPayments();
      searchBills();
    } else {
      showToast({ type: "error", title: "Void failed" });
    }
  };

  return (
    <div className="space-y-5">
      {lastReceipt && (
        <Card variant="clay" padding="md" className="flex items-center justify-between gap-3">
          <p className="text-caption text-text-primary">
            ✅ Receipt <b>{lastReceipt.number}</b> issued
          </p>
          <a
            href={`/api/school-admin/finance/receipts/${lastReceipt.id}/pdf`}
            target="_blank"
            className="text-caption font-semibold text-primary underline"
          >
            View / download PDF
          </a>
        </Card>
      )}

      {/* Record payment */}
      <Card>
        <p className="text-h3 font-bold text-text-primary mb-1">Record a payment</p>
        <p className="text-caption text-text-secondary mb-4">Search a student with a bill, then enter the amount received.</p>

        <Input value={studentQ} onChange={(e) => { setStudentQ(e.target.value); setPicked(null); }} placeholder="Search student…" />

        {!picked && bills.length > 0 && (
          <div className="mt-3 max-h-56 overflow-y-auto space-y-1.5">
            {bills.map((b) => (
              <button
                key={b.id}
                onClick={() => pickBill(b)}
                className="w-full text-left rounded-lg border border-border px-3 py-2 hover:bg-clay transition-colors flex justify-between items-center"
              >
                <span className="text-caption font-medium text-text-primary">{b.student_name} · {b.class_name || "—"}</span>
                <span className="text-caption text-warning font-bold">Owing {money(b.outstanding)}</span>
              </button>
            ))}
          </div>
        )}

        {picked && (
          <div className="mt-4 rounded-lg bg-clay p-4 space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <p className="font-semibold text-text-primary">{picked.student_name}</p>
                <p className="text-caption text-text-secondary">{picked.class_name || "—"}</p>
              </div>
              <Badge variant="warning">Owing {money(picked.outstanding)}</Badge>
            </div>

            <div className="grid grid-cols-1 tablet:grid-cols-2 gap-3">
              <div>
                <label className="text-caption text-text-secondary block mb-1">Amount (₦)</label>
                <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} min={0} />
              </div>
              <div>
                <label className="text-caption text-text-secondary block mb-1">Reference (optional)</label>
                <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. TRX-001" />
              </div>
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

            <div className="flex gap-2">
              <Button onClick={record} loading={saving} disabled={!(Number(amount) > 0)}>Save payment</Button>
              <Button variant="secondary" onClick={() => setPicked(null)}>Cancel</Button>
            </div>
            <p className="text-caption text-text-disabled">
              Overpayments are blocked. The payment is automatically allocated to the bill and a receipt is issued.
            </p>
          </div>
        )}
      </Card>

      {/* History */}
      <div>
        <p className="text-caption font-semibold text-text-secondary uppercase tracking-wider mb-2">Payment history</p>
        <div className="space-y-2">
          {payments.map((p) => {
            const st = paymentStatusLabel(p.status);
            return (
              <div key={p.id} className="rounded-lg bg-surface border border-border px-4 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-text-primary truncate">{p.student_name}</p>
                  <p className="text-caption text-text-secondary">
                    {new Date(p.paid_at).toLocaleDateString()} · {p.method || "—"} {p.reference ? `· ${p.reference}` : ""} · {p.receipt_number || "no receipt"}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <p className="font-bold text-text-primary">{money(p.amount)}</p>
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
              <p className="text-caption text-text-secondary">No payments recorded yet.</p>
            </Card>
          )}
        </div>
      </div>

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
