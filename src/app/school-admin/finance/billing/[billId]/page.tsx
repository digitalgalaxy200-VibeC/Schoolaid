"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Card, Button, Input, Badge, Modal, showToast } from "@/components/ui";
import { money, billStatusLabel, currencySymbol, fetchArray, fetchObject } from "@/components/finance/helpers";
import { useFinanceRole } from "@/components/finance/useFinanceRole";

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

/** The money a waiver entry represents, for the live preview. */
const waiverMoney = (mode: "amount" | "percent", raw: string, scopeAmount: number): number => {
  const n = Number(raw) || 0;
  const value = mode === "percent" ? (scopeAmount * n) / 100 : n;
  return Math.round((value + Number.EPSILON) * 100) / 100;
};
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
  // A bursar may read this page but not change what is owed on it. The routes
  // enforce that too; this only keeps them from typing into a form that will be
  // refused.
  const { canChangeLedger } = useFinanceRole();
  const [bill, setBill] = useState<BillDetail | null>(null);
  const [missing, setMissing] = useState(false);
  const [waiverAmount, setWaiverAmount] = useState("");
  const [waiverReason, setWaiverReason] = useState("");
  const [waiverBusy, setWaiverBusy] = useState(false);
  // The API has always supported a percentage and a per-fee-head waiver; the
  // screen only ever sent a fixed whole-bill amount, so a "10% sibling discount"
  // had to be calculated by hand on every bill.
  const [waiverMode, setWaiverMode] = useState<"amount" | "percent">("amount");
  const [waiverFeeHead, setWaiverFeeHead] = useState("");
  const [planOpen, setPlanOpen] = useState(false);
  const [planCount, setPlanCount] = useState("2");
  const [planBusy, setPlanBusy] = useState(false);

  // Move this bill to another class (a placement mistake, not a promotion).
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveClasses, setMoveClasses] = useState<{ id: string; name: string }[]>([]);
  const [moveClassId, setMoveClassId] = useState("");
  const [moveReason, setMoveReason] = useState("");
  const [moveBusy, setMoveBusy] = useState(false);
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
    const raw = Number(waiverAmount);
    if (!Number.isFinite(raw) || raw <= 0) return;
    if (waiverMode === "percent" && raw > 100) return;
    setWaiverBusy(true);
    const body: Record<string, unknown> = { reason: waiverReason || null };
    if (waiverFeeHead) body.fee_head_id = waiverFeeHead;
    if (waiverMode === "percent") body.percentage = raw;
    else body.amount = raw;

    const res = await fetch(`/api/school-admin/finance/billing/${billId}/waivers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = await res.json().catch(() => ({}));
    setWaiverBusy(false);
    if (res.ok) {
      showToast({ type: "success", title: "Waiver applied" });
      setWaiverAmount("");
      setWaiverReason("");
      setWaiverFeeHead("");
      setWaiverMode("amount");
      load();
    } else {
      showToast({ type: "error", title: d?.error || "Failed" });
    }
  };

  const openMove = async () => {
    setMoveOpen(true);
    setMoveClassId("");
    setMoveReason("");
    if (moveClasses.length === 0) {
      const rows = await fetchArray<{ id: string; name: string }>("/api/school-admin/classes");
      setMoveClasses(rows.filter((c) => c.id !== (bill?.class?.id ?? "")));
    }
  };

  const doMove = async () => {
    if (!moveClassId) return;
    setMoveBusy(true);
    const res = await fetch(`/api/school-admin/finance/billing/${billId}/move-class`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ class_id: moveClassId, reason: moveReason.trim() || null }),
    });
    const d = await res.json().catch(() => ({}));
    setMoveBusy(false);
    if (res.ok) {
      showToast({
        type: "success",
        title: d.repriced
          ? `Moved to ${d.moved_to} — ${money(d.totals_before)} → ${money(d.totals_after)}`
          : `Moved to ${d.moved_to} — the amount did not change`,
      });
      setMoveOpen(false);
      load();
    } else {
      showToast({ type: "error", title: d?.error || "Could not move the bill" });
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
          {canChangeLedger && (
            <Button size="sm" variant="secondary" onClick={openAddFeeModal}>+ Add optional fee</Button>
          )}
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
        <Link href={`/school-admin/finance/students/${bill.student.id}`}>
          <Button variant="secondary" fullWidth>Open finance workspace</Button>
        </Link>
        <Button variant="secondary" fullWidth onClick={() => setPlanOpen(true)}>
          📅 Create payment plan
        </Button>
        {canChangeLedger && (
          <Button variant="secondary" fullWidth onClick={openMove}>
            Move to another class
          </Button>
        )}
      </div>
      <a
        href={`/api/school-admin/finance/billing/${billId}/invoice`}
        target="_blank"
        className="text-caption font-semibold text-primary underline self-start"
      >
        View invoice (PDF) — what this student is expected to pay
      </a>

      {/* Waivers */}
      <Card padding="md">
        <p className="text-caption font-semibold text-text-secondary uppercase tracking-wider mb-3">Waivers / discounts</p>
        <div className="space-y-2 mb-3">
          {bill.waivers.map((w) => {
            const feeName = w.fee_head_id
              ? bill.lines.find((l) => l.fee_head_id === w.fee_head_id)?.fee_name || null
              : null;
            return (
              <div key={w.id} className="flex justify-between items-center gap-2 rounded-lg bg-clay px-3 py-2 text-caption">
                <span className="text-text-primary">
                  {money(w.amount)}
                  {w.waiver_type === "percentage" && <Badge variant="draft" className="ml-2">%</Badge>}
                  {feeName ? <span className="text-text-secondary"> · {feeName}</span> : <span className="text-text-secondary"> · whole bill</span>}
                </span>
                <span className="text-text-disabled">{w.reason || "No reason"}</span>
              </div>
            );
          })}
          {bill.waivers.length === 0 && <p className="text-caption text-text-secondary">No waivers yet.</p>}
        </div>

        {/* Amount or percentage, whole bill or one fee. */}
        <div className="flex gap-2 mb-3">
          {([
            { key: "amount", label: `Fixed amount (${currencySymbol()})` },
            { key: "percent", label: "Percentage" },
          ] as const).map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => setWaiverMode(m.key)}
              className={`px-3 py-1.5 rounded-full text-caption font-semibold border transition-colors ${
                waiverMode === m.key
                  ? "bg-primary text-text-inverse border-primary"
                  : "bg-surface text-text-secondary border-border"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 tablet:grid-cols-4 gap-2 items-end">
          <div>
            <label className="text-caption text-text-secondary block mb-1">
              {waiverMode === "percent" ? "Percentage (%)" : `Amount (${currencySymbol()})`}
            </label>
            <Input
              type="number"
              value={waiverAmount}
              onChange={(e) => setWaiverAmount(e.target.value)}
              placeholder={waiverMode === "percent" ? "e.g. 10" : "0"}
            />
          </div>
          <div>
            <label className="text-caption text-text-secondary block mb-1">Applies to</label>
            <select
              value={waiverFeeHead}
              onChange={(e) => setWaiverFeeHead(e.target.value)}
              className="w-full min-h-[44px] rounded-lg border border-border bg-surface px-3 text-caption text-text-primary"
            >
              <option value="">Whole bill</option>
              {bill.lines.map((l) => (
                <option key={l.fee_head_id} value={l.fee_head_id}>
                  {l.fee_name} ({money(l.amount)})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-caption text-text-secondary block mb-1">Reason</label>
            <Input
              value={waiverReason}
              onChange={(e) => setWaiverReason(e.target.value)}
              placeholder="e.g. Sibling discount"
            />
          </div>
          <Button
            onClick={addWaiver}
            loading={waiverBusy}
            disabled={
              !canChangeLedger ||
              !Number(waiverAmount) ||
              (waiverMode === "percent" && Number(waiverAmount) > 100)
            }
          >
            Apply waiver
          </Button>
        </div>
        {!canChangeLedger && (
          <p className="text-caption text-text-muted mt-2">
            A bursar can see waivers on this bill but cannot grant one. Ask a school administrator.
          </p>
        )}

        {/* What the entry currently means, so nobody guesses. */}
        {Number(waiverAmount) > 0 && (
          <p className="text-caption text-text-secondary mt-2">
            {waiverMode === "percent"
              ? `${Number(waiverAmount)}% of ${
                  waiverFeeHead
                    ? bill.lines.find((l) => l.fee_head_id === waiverFeeHead)?.fee_name || "that fee"
                    : "the whole bill"
                } = ${money(
                  waiverMoney(
                    waiverMode,
                    waiverAmount,
                    waiverFeeHead
                      ? bill.lines.find((l) => l.fee_head_id === waiverFeeHead)?.amount || 0
                      : bill.gross_amount,
                  ),
                )}`
              : `${money(Number(waiverAmount))} off ${waiverFeeHead ? "that fee" : "the whole bill"}`}
          </p>
        )}
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
              No additional fees available to add for this student&apos;s class.
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
                      {f.name} {!f.is_compulsory ? "(Optional)" : ""} — {money(f.amount)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-caption text-text-secondary block mb-1">Amount ({currencySymbol()})</label>
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
      <Modal isOpen={moveOpen} onClose={() => !moveBusy && setMoveOpen(false)} title="Move bill to another class">
        <div className="space-y-4">
          <p className="text-caption text-text-secondary">
            This reprices the bill against the chosen class&apos;s fees for this term, using the same
            rules as Sync with fee setup. Waivers are kept, and any money already paid that is no longer
            owed becomes credit. The student record itself does not move.
          </p>
          <div>
            <label className="text-caption text-text-secondary block mb-1">New class</label>
            <select
              value={moveClassId}
              onChange={(e) => setMoveClassId(e.target.value)}
              className="w-full min-h-[44px] rounded-lg border border-border bg-surface px-3 text-caption text-text-primary"
            >
              <option value="">Select a class…</option>
              {moveClasses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-caption text-text-secondary block mb-1">Reason (optional)</label>
            <Input
              value={moveReason}
              onChange={(e) => setMoveReason(e.target.value)}
              placeholder="e.g. placed in the wrong class at admission"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setMoveOpen(false)} disabled={moveBusy}>
              Cancel
            </Button>
            <Button onClick={doMove} loading={moveBusy} disabled={!moveClassId}>
              Move and reprice
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
