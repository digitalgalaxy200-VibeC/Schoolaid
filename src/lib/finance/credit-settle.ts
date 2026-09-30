// ============================================================================
// Finance — open-credit settlement ("credit is used first")
//
// THE RULE: money a student already holds as credit is spent BEFORE anything
// else. A bill must never sit unpaid while the same student holds open credit
// that could pay it, and a new cash payment must never cover a balance the
// student's own credit could have covered.
//
// Credits appear when money already received has to move: an optional fee is
// removed, or a recalculation lowers a fee below what was paid. Those flows
// convert the paid allocations into credit — and, without this module, the
// credit simply parked there while the bill kept showing its full balance.
//
// This runs automatically at every write that can create credit (fee removal,
// recalculation) and before a payment is recorded. The explicit
// `/finance/credits/apply` endpoint remains for deliberate, per-credit use —
// this module mirrors its contract exactly: insert `credit_applications` rows,
// close fully-used credits, refresh the bill's derived status.
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import { round2 } from "./billing";

export type SettleResult = {
  /** How much open credit was applied to this bill. */
  applied: number;
  /** Credit still open for this student after settling (on credits not consumed). */
  credit_remaining: number;
  outstanding_after: number;
  bill_status: string;
};

const EMPTY: SettleResult = {
  applied: 0,
  credit_remaining: 0,
  outstanding_after: 0,
  bill_status: "pending",
};

/**
 * Applies this student's open credits to one bill, oldest credit first, capped
 * by the bill's outstanding. Idempotent: a bill with no outstanding, or a
 * student with no open credit, settles to zero and only refreshes the derived
 * status.
 */
export async function settleOpenCreditsToBill(
  supabase: SupabaseClient,
  args: { schoolId: string; studentId: string; billId: string; actorId?: string | null },
): Promise<SettleResult> {
  const { schoolId, studentId, billId, actorId = null } = args;

  const { data: bill } = await supabase
    .from("student_bills")
    .select("id, student_id, term_id, net_amount")
    .eq("id", billId)
    .eq("school_id", schoolId)
    .maybeSingle();
  if (!bill || bill.student_id !== studentId) return EMPTY;

  const net = round2(Number(bill.net_amount));

  // ── Posted payments on this bill (same rule every finance screen uses) ──
  const { data: lineRows } = await supabase
    .from("student_bill_lines")
    .select("id")
    .eq("bill_id", billId);
  const lineIds = (lineRows || []).map((l: { id: string }) => l.id);

  let paid = 0;
  if (lineIds.length > 0) {
    const { data: allocs } = await supabase
      .from("fee_allocations")
      .select("amount, converted_to_credit, payments(status)")
      .eq("school_id", schoolId)
      .in("bill_line_id", lineIds);
    for (const a of (allocs || []) as {
      amount: number;
      converted_to_credit: boolean | null;
      payments: { status: string } | { status: string }[] | null;
    }[]) {
      if (a.converted_to_credit === true) continue;
      const raw = a.payments as { status: string } | { status: string }[] | null;
      const st = Array.isArray(raw) ? raw[0]?.status : raw?.status;
      if (st === "active") paid += Number(a.amount);
    }
    paid = round2(paid);
  }

  const { data: billApps } = await supabase
    .from("credit_applications")
    .select("amount")
    .eq("school_id", schoolId)
    .eq("bill_id", billId);
  let billApplied = round2(
    (billApps || []).reduce((s: number, a: { amount: number }) => s + Number(a.amount), 0),
  );

  let outstanding = round2(Math.max(0, net - paid - billApplied));

  const derivedStatus = () => {
    const covered = round2(paid + billApplied);
    return net > 0 && covered >= net ? "paid" : covered > 0 ? "partial" : "pending";
  };

  const refreshAndReturn = (applied: number, creditRemaining: number): SettleResult => {
    const status = derivedStatus();
    return { applied, credit_remaining: creditRemaining, outstanding_after: outstanding, bill_status: status };
  };

  if (outstanding <= 0) {
    const status = derivedStatus();
    await supabase.from("student_bills").update({ status }).eq("id", billId).eq("school_id", schoolId);
    return { applied: 0, credit_remaining: 0, outstanding_after: 0, bill_status: status };
  }

  // ── Open credits, oldest first (FIFO — the oldest money is spent first) ──
  const { data: credits } = await supabase
    .from("credits")
    .select("id, amount, created_at")
    .eq("school_id", schoolId)
    .eq("student_id", studentId)
    .eq("status", "open")
    .order("created_at");
  const creditRows = (credits || []) as { id: string; amount: number }[];

  let appliedTotal = 0;
  let creditRemaining = 0;

  if (creditRows.length > 0) {
    // Remaining per credit is derived from applications — never a stored column.
    const { data: apps } = await supabase
      .from("credit_applications")
      .select("credit_id, amount")
      .eq("school_id", schoolId)
      .in(
        "credit_id",
        creditRows.map((c) => c.id),
      );
    const usedByCredit = new Map<string, number>();
    for (const a of (apps || []) as { credit_id: string; amount: number }[]) {
      usedByCredit.set(a.credit_id, round2((usedByCredit.get(a.credit_id) || 0) + Number(a.amount)));
    }

    const inserts: Record<string, unknown>[] = [];
    const fullyUsed: string[] = [];

    for (const c of creditRows) {
      const remaining = round2(Math.max(0, Number(c.amount) - (usedByCredit.get(c.id) || 0)));
      if (remaining <= 0) continue;
      if (outstanding <= 0) {
        creditRemaining = round2(creditRemaining + remaining);
        continue;
      }
      const take = round2(Math.min(remaining, outstanding));
      inserts.push({
        school_id: schoolId,
        credit_id: c.id,
        student_id: studentId,
        bill_id: billId,
        term_id: bill.term_id,
        amount: take,
        applied_by: actorId,
      });
      appliedTotal = round2(appliedTotal + take);
      outstanding = round2(outstanding - take);
      billApplied = round2(billApplied + take);
      const left = round2(remaining - take);
      if (left <= 0) fullyUsed.push(c.id);
      else creditRemaining = round2(creditRemaining + left);
    }

    if (inserts.length > 0) {
      const { error } = await supabase.from("credit_applications").insert(inserts);
      if (error) {
        // The bill is unchanged (nothing was applied); the credit stays open and
        // the caller reports no credit applied. Better a missed automatic sweep
        // than a half-written application.
        console.error("[finance/credit-settle] could not record credit applications:", error.message);
        return EMPTY;
      }
    }
    if (fullyUsed.length > 0) {
      await supabase
        .from("credits")
        .update({ status: "closed" })
        .eq("school_id", schoolId)
        .in("id", fullyUsed);
    }
  }

  const status = derivedStatus();
  await supabase.from("student_bills").update({ status }).eq("id", billId).eq("school_id", schoolId);

  return refreshAndReturn(appliedTotal, creditRemaining);
}
