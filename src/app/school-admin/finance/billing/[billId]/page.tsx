"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Card, Button, Input, Badge, Modal, showToast } from "@/components/ui";
import { money, billStatusLabel, fetchArray, fetchObject } from "@/components/finance/helpers";

type BillLine = {
  id: string;
  fee_head_id: string;
  fee_name: string;
  amount: number;
  waived_amount: number;
  net_amount: number;
  is_compulsory: boolean;
};
type Waiver = { id: string; amount: number; waiver_type: string; fee_head_id: string | null; reason: string | null };
type Plan = { id: string; status: string; total_amount: number; installment_count: number };
type CreditInfo = { id: string; amount: number; applied_amount: number; remaining: number; status: string; reason: string | null; source: string; source_fee_name: string | null };
type BillDetail = {
  id: string;
  student: { id: string; name: string };
  class: { id: string; name: string } | null;
  term: { id: string; name: string } | null;
  gross_amount: number;
  waiver_amount: number;
  net_amount: number;
  paid: number;
  applied_credit: number;
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
  const [credits, setCredits] = useState<CreditInfo[]>([]);
  const [applyAmounts, setApplyAmounts] = useState<Record<string, string>>({});
  const [applyingCredit, setApplyingCredit] = useState(false);

  // Add optional fee modal state
  const [addFeeOpen, setAddFeeOpen] = useState(false);
  const [availableFees, setAvailableFees] = useState<{ id: string; name: string; amount: number; is_compulsory: boolean }[]>([]);
  const [selectedFeeId, setSelectedFeeId] = useState("");
  const [selectedFeeAmount, setSelectedFeeAmount] = useState("");
  const [addFeeBusy, setAddFeeBusy] = useState(false);

  const openAddFeeModal = async () => {
    if (!bill?.term?.id) return;
    setAddFeeOpen(true);
    // Fetch fee matrix for term
    const res = await fetch(`/api/school-admin/finance/matrix?term_id=${encodeURIComponent(bill.term.id)}`);
    const data = await res.json().catch(() => null);
    if (data && Array.isArray(data.fee_heads)) {
      const existingHeadIds = new Set(bill.lines.map((l) => l.fee_head_id));
      const avail: { id: string; name: string; amount: number; is_compulsory: boolean }[] = [];

      for (const fh of data.fee_heads) {
        if (existingHeadIds.has(fh.id)) continue;
        // Find cell amount for student's class
        const cell = (data.cells || []).find((c: { fee_head_id: string; class_id: string; amount: number | null }) => 
          c.fee_head_id === fh.id && c.class_id === bill.class?.id
        );
        const amt = cell?.amount ?? (fh.default?.amount ?? 0);
        avail.push({
          id: fh.id,
          name: fh.name,
          amount: amt,
          is_compulsory: !!fh.is_compulsory,
        });
      }
      setAvailableFees(avail);
      if (avail.length > 0) {
        setSelectedFeeId(avail[0].id);
        setSelectedFeeAmount(String(avail[0].amount || ""));
      }
    }
  };

  const addOptionalFee = async () => {
    const amt = Number(selectedFeeAmount);
    if (!selectedFeeId || !Number.isFinite(amt) || amt <= 0) return;
    setAddFeeBusy(true);
    const res = await fetch(`/api/school-admin/finance/billing/${billId}/add-fee`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fee_head_id: selectedFeeId, amount: amt }),
    });
    const d = await res.json().catch(() => ({}));
    setAddFeeBusy(false);
    if (res.ok) {
      showToast({ type: "success", title: "Optional fee added to bill" });
      setAddFeeOpen(false);
      load();
    } else {
      showToast({ type: "error", title: d?.error || "Failed to add fee" });
    }
  };

  const load = useCallback(() => {
    setMissing(false);
    fetchObject<BillDetail>(`/api/school-admin/finance/billing/${billId}`).then((b) => {
      setBill(b);
      if (!b) setMissing(true);
      if (b?.student?.id) {
        fetchArray<CreditInfo>(`/api/school-admin/finance/credits?student_id=${encodeURIComponent(b.student.id)}`).then((rows) =>
          setCredits(rows.filter((c) => c.status === "open" && c.remaining > 0)),
        );
      }
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

  const applyCredit = async (credit: CreditInfo) => {
    const amt = Number(applyAmounts[credit.id]);
    if (!Number.isFinite(amt) || amt <= 0) return;
    setApplyingCredit(true);
    const res = await fetch("/api/school-admin/finance/credits/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ credit_id: credit.id, bill_id: billId, amount: amt }),
    });
    const d = await res.json().catch(() => ({}));
    setApplyingCredit(false);
    if (res.ok) {
      showToast({ type: "success", title: `Credit applied — remaining ${money(d?.credit_remaining ?? 0)}` });
      setApplyAmounts((prev) => {
        const next = { ...prev };
        delete next[credit.id];
        return next;
      });
      load();
    } else {
      showToast({ type: "error", title: d?.error || "Apply failed" });
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
  const visibleLines = bill.lines.filter((l) => l.amount > 0 || l.waived_amount > 0);

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
        <div className="flex items-center justify-between mb-3">
          <p className="text-caption font-semibold text-text-secondary uppercase tracking-wider">Bill breakdown</p>
          <Button size="sm" variant="secondary" onClick={openAddFeeModal}>+ Add optional fee</Button>
        </div>
        <div className="space-y-1.5">
          {visibleLines.map((l) => (
            <div key={l.id} className="flex items-center justify-between text-body">
              <span className="text-text-primary">
                {l.fee_name}
                {!l.is_compulsory && <Badge variant="default" className="ml-2">Optional</Badge>}
              </span>
              <span className="text-text-primary font-medium">{money(l.amount)}</span>
            </div>
          ))}
          {visibleLines.length === 0 && <p className="text-caption text-text-secondary text-center py-3">No chargeable fee lines.</p>}
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
          {bill.applied_credit > 0 && (
            <div className="flex justify-between text-success">
              <span>Credit applied</span><span>−{money(bill.applied_credit)}</span>
            </div>
          )}
          <div className="flex justify-between font-bold text-text-primary text-body">
            <span>Outstanding</span><span className={bill.outstanding > 0 ? "text-warning" : "text-success"}>{money(bill.outstanding)}</span>
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

      {/* Student credits (Phase 3) */}
      <Card padding="md">
        <p className="text-caption font-semibold text-text-secondary uppercase tracking-wider mb-1">Available credits</p>
        <p className="text-caption text-text-disabled mb-3">
          Credit on this student’s account can be applied to this bill. Applying is explicit — it never changes the original payment records.
        </p>
        {credits.length === 0 ? (
          <p className="text-caption text-text-secondary text-center py-3">No available credit for this student.</p>
        ) : (
          <div className="space-y-2">
            {credits.map((c) => (
              <div key={c.id} className="rounded-lg bg-clay px-3 py-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="text-caption">
                    <p className="text-text-primary font-semibold">
                      {money(c.remaining)} available
                      {c.source_fee_name ? ` · from ${c.source_fee_name}` : ""}
                    </p>
                    <p className="text-text-disabled">{c.reason || "Credit on account"}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={0}
                      placeholder={`max ${c.remaining}`}
                      className="w-28"
                      value={applyAmounts[c.id] ?? ""}
                      onChange={(e) => setApplyAmounts((prev) => ({ ...prev, [c.id]: e.target.value }))}
                    />
                    <Button
                      size="sm"
                      onClick={() => applyCredit(c)}
                      loading={applyingCredit}
                      disabled={!(Number(applyAmounts[c.id]) > 0) || Number(applyAmounts[c.id]) > c.remaining}
                    >
                      Apply
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
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

      {/* Add optional fee modal */}
      <Modal isOpen={addFeeOpen} onClose={() => setAddFeeOpen(false)} title="Add optional fee to bill">
        <div className="space-y-4">
          <p className="text-caption text-text-secondary">
            Select an optional or add-on fee head configured for this class/term to append to <b className="text-text-primary">{bill.student.name}</b>’s bill.
          </p>

          {availableFees.length === 0 ? (
            <p className="text-caption text-text-secondary py-3 text-center">
              No additional fees available to add for this student's class.
            </p>
          ) : (
            <>
              <div>
                <label className="text-caption text-text-secondary block mb-1">Fee Head</label>
                <select
                  value={selectedFeeId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setSelectedFeeId(id);
                    const found = availableFees.find((f) => f.id === id);
                    if (found) setSelectedFeeAmount(String(found.amount || ""));
                  }}
                  className="w-full rounded-md border border-border bg-surface px-3 py-2 text-body text-text-primary focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  {availableFees.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name} {!f.is_compulsory ? "(Optional)" : ""} — ₦{f.amount.toLocaleString()}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-caption text-text-secondary block mb-1">Amount (₦)</label>
                <Input
                  type="number"
                  value={selectedFeeAmount}
                  onChange={(e) => setSelectedFeeAmount(e.target.value)}
                  placeholder="0"
                  min={1}
                />
              </div>
            </>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setAddFeeOpen(false)}>Cancel</Button>
            {availableFees.length > 0 && (
              <Button onClick={addOptionalFee} loading={addFeeBusy} disabled={!Number(selectedFeeAmount)}>
                Add to bill
              </Button>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}
