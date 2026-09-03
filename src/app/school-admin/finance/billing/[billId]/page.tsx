"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Card, Button, Input, Badge, Modal, showToast } from "@/components/ui";
import { money, billStatusLabel, fetchArray, fetchObject } from "@/components/finance/helpers";

type BillLine = {
  id: string;
  fee_name: string;
  amount: number;
  waived_amount: number;
  net_amount: number;
  is_compulsory: boolean;
};
type Waiver = { id: string; amount: number; waiver_type: string; fee_head_id: string | null; reason: string | null };
type Plan = { id: string; status: string; total_amount: number; installment_count: number };
type BillDetail = {
  id: string;
  student: { id: string; name: string };
  class: { id: string; name: string } | null;
  term: { id: string; name: string } | null;
  gross_amount: number;
  waiver_amount: number;
  net_amount: number;
  paid: number;
  outstanding: number;
  status: string;
  lines: BillLine[];
  waivers: Waiver[];
};

export default function BillDetailPage() {
  const { billId } = useParams<{ billId: string }>();
  const [bill, setBill] = useState<BillDetail | null>(null);
  const [missing, setMissing] = useState(false);
  const [waiverAmount, setWaiverAmount] = useState("");
  const [waiverReason, setWaiverReason] = useState("");
  const [waiverBusy, setWaiverBusy] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [planCount, setPlanCount] = useState("2");
  const [planBusy, setPlanBusy] = useState(false);
  const [plans, setPlans] = useState<Plan[]>([]);

  const load = useCallback(() => {
    setMissing(false);
    fetchObject<BillDetail>(`/api/school-admin/finance/billing/${billId}`).then((b) => {
      setBill(b);
      if (!b) setMissing(true);
    });
    fetchArray<Plan>(`/api/school-admin/finance/payment-plans?bill_id=${billId}`).then(setPlans);
  }, [billId]);
  useEffect(() => load(), [load]);

  const addWaiver = async () => {
    const amt = Number(waiverAmount);
    if (!Number.isFinite(amt) || amt <= 0) return;
    setWaiverBusy(true);
    const res = await fetch(`/api/school-admin/finance/billing/${billId}/waivers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: amt, reason: waiverReason || null }),
    });
    const d = await res.json().catch(() => ({}));
    setWaiverBusy(false);
    if (res.ok) {
      showToast({ type: "success", title: "Waiver applied" });
      setWaiverAmount("");
      setWaiverReason("");
      load();
    } else {
      showToast({ type: "error", title: d?.error || "Failed" });
    }
  };

  const createPlan = async () => {
    const count = Number(planCount);
    if (!Number.isInteger(count) || count < 1) return;
    setPlanBusy(true);
    const res = await fetch("/api/school-admin/finance/payment-plans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bill_id: billId, installment_count: count }),
    });
    const d = await res.json().catch(() => ({}));
    setPlanBusy(false);
    if (res.ok) {
      showToast({ type: "success", title: "Payment plan created" });
      setPlanOpen(false);
      load();
    } else {
      showToast({ type: "error", title: d?.error || "Failed" });
    }
  };

  if (missing) {
    return (
      <div className="space-y-4 max-w-3xl">
        <Link href="/school-admin/finance/billing" className="text-caption font-semibold text-primary underline">
          ← Back to billing
        </Link>
        <Card padding="md" className="text-center">
          <p className="text-body font-semibold text-text-primary">Bill not found</p>
          <p className="text-caption text-text-secondary mt-1">
            This bill does not exist or is not available for your school.
          </p>
        </Card>
      </div>
    );
  }

  if (!bill) {
    return <p className="text-caption text-text-secondary py-10 text-center">Loading…</p>;
  }

  const st = billStatusLabel(bill.status);

  return (
    <div className="space-y-4 max-w-3xl">
      <Link href="/school-admin/finance/billing" className="text-caption font-semibold text-primary underline">
        ← Back to billing
      </Link>

      {/* Header */}
      <Card>
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <p className="text-h2 font-bold text-text-primary">{bill.student.name}</p>
            <p className="text-caption text-text-secondary">
              {bill.class?.name || "—"} · {bill.term?.name || ""}
            </p>
          </div>
          <Badge variant={st.badge}>{st.label}</Badge>
        </div>
        <div className="grid grid-cols-2 tablet:grid-cols-4 gap-3 mt-4 text-center">
          {[
            { label: "Gross", value: money(bill.gross_amount), cls: "text-text-primary" },
            { label: "Waiver", value: `−${money(bill.waiver_amount)}`, cls: "text-warning" },
            { label: "Paid", value: money(bill.paid), cls: "text-success" },
            { label: "Outstanding", value: money(bill.outstanding), cls: bill.outstanding > 0 ? "text-error" : "text-success" },
          ].map((x) => (
            <div key={x.label} className="rounded-lg bg-clay py-3">
              <p className={`text-body font-extrabold ${x.cls}`}>{x.value}</p>
              <p className="text-caption text-text-secondary">{x.label}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* Lines */}
      <Card>
        <p className="text-caption font-semibold text-text-secondary uppercase tracking-wider mb-3">Bill breakdown</p>
        <div className="space-y-1.5">
          {bill.lines.map((l) => (
            <div key={l.id} className="flex items-center justify-between text-body">
              <span className="text-text-primary">
                {l.fee_name}
                {!l.is_compulsory && <Badge variant="default" className="ml-2">Optional</Badge>}
              </span>
              <span className="text-text-primary font-medium">{money(l.amount)}</span>
            </div>
          ))}
          {bill.lines.length === 0 && <p className="text-caption text-text-secondary text-center py-3">No fee lines.</p>}
        </div>
        <div className="border-t border-border mt-3 pt-3 space-y-1 text-caption">
          <div className="flex justify-between text-text-secondary">
            <span>Gross</span><span>{money(bill.gross_amount)}</span>
          </div>
          <div className="flex justify-between text-warning">
            <span>Waivers</span><span>−{money(bill.waiver_amount)}</span>
          </div>
          <div className="flex justify-between font-bold text-text-primary text-body">
            <span>Net payable</span><span>{money(bill.net_amount)}</span>
          </div>
        </div>
      </Card>

      {/* Actions */}
      <div className="flex flex-col tablet:flex-row gap-2">
        <Link href={`/school-admin/finance/payments?student=${encodeURIComponent(bill.student.name)}&bill=${billId}`}>
          <Button variant="primary" fullWidth>💳 Record payment</Button>
        </Link>
        <Button variant="secondary" fullWidth onClick={() => setPlanOpen(true)}>
          📅 Create payment plan
        </Button>
      </div>

      {/* Waivers */}
      <Card padding="md">
        <p className="text-caption font-semibold text-text-secondary uppercase tracking-wider mb-3">Waivers / discounts</p>
        <div className="space-y-2 mb-3">
          {bill.waivers.map((w) => (
            <div key={w.id} className="flex justify-between items-center rounded-lg bg-clay px-3 py-2 text-caption">
              <span className="text-text-primary">
                {money(w.amount)}
                {w.waiver_type === "percentage" && <Badge variant="draft" className="ml-2">%</Badge>}
              </span>
              <span className="text-text-disabled">{w.reason || "No reason"}</span>
            </div>
          ))}
          {bill.waivers.length === 0 && <p className="text-caption text-text-secondary">No waivers yet.</p>}
        </div>
        <div className="flex flex-col tablet:flex-row gap-2 items-end">
          <div className="w-full tablet:w-32">
            <label className="text-caption text-text-secondary block mb-1">Amount (₦)</label>
            <Input type="number" value={waiverAmount} onChange={(e) => setWaiverAmount(e.target.value)} placeholder="0" />
          </div>
          <div className="flex-1 w-full">
            <label className="text-caption text-text-secondary block mb-1">Reason</label>
            <Input value={waiverReason} onChange={(e) => setWaiverReason(e.target.value)} placeholder="e.g. Sibling discount" />
          </div>
          <Button onClick={addWaiver} loading={waiverBusy} disabled={!Number(waiverAmount)}>Apply waiver</Button>
        </div>
      </Card>

      {/* Payment plans */}
      <Card padding="md">
        <p className="text-caption font-semibold text-text-secondary uppercase tracking-wider mb-3">Payment plans</p>
        <div className="space-y-2">
          {plans.map((p) => (
            <div key={p.id} className="flex justify-between items-center rounded-lg bg-clay px-3 py-2 text-caption">
              <span className="text-text-primary">{money(p.total_amount)} · {p.installment_count} installments</span>
              <Badge variant={p.status === "active" ? "info" : "default"}>{p.status}</Badge>
            </div>
          ))}
          {plans.length === 0 && <p className="text-caption text-text-secondary">No plans yet — installments do not count as payments.</p>}
        </div>
      </Card>

      {/* Create plan modal */}
      <Modal isOpen={planOpen} onClose={() => setPlanOpen(false)} title="Create payment plan">
        <div className="space-y-4">
          <p className="text-caption text-text-secondary">
            Net payable: <b className="text-text-primary">{money(bill.net_amount)}</b>. The plan is a schedule — it does not record a payment.
          </p>
          <div>
            <label className="text-caption text-text-secondary block mb-1">Number of installments</label>
            <Input type="number" value={planCount} onChange={(e) => setPlanCount(e.target.value)} min={1} max={24} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setPlanOpen(false)}>Cancel</Button>
            <Button onClick={createPlan} loading={planBusy}>Create plan</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
