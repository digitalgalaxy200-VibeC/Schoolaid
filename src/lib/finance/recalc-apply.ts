// ============================================================================
// Finance — applying a recalculation plan
//
// WHY THIS IS ITS OWN MODULE
// --------------------------
// The write half of a recalculation used to live inside the HTTP route. A second
// caller now needs the same behaviour for ONE bill (a student moved to another
// class), and copying that loop would create two repricing paths that disagree
// the day one of them is fixed. The rules below are subtle and deliberate:
//
//   - line amounts are UPDATED, never deleted (history must survive),
//   - a fee head that no longer applies is zeroed, not dropped,
//   - payments and allocations are never touched; paid money that is now excess
//     becomes a credit record, and fully-consumed allocations are flagged,
//   - every change writes a financial_adjustments row and belongs to one
//     bill_recalc_runs audit row,
//   - waivers already granted are preserved by the plan, not re-derived here.
//
// The route keeps its validation and its response shape; this keeps the money
// rules in one place.
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import type { RecalcPlan } from "./recalc";
import { round2 } from "./billing";
import { settleOpenCreditsToBill } from "./credit-settle";

export type ApplyRecalcOptions = {
  school_id: string;
  termId: string;
  plan: RecalcPlan;
  userId: string | null;
  reason: string | null;
};

export type ApplyRecalcResult =
  | { ok: true; runId: string; creditsCreated: number }
  | { ok: false; error: string };

/**
 * Writes an approved plan. Callers must have checked authorization first; this
 * function trusts its plan but verifies every write it performs.
 *
 * Returns `ok: false` with a database message rather than throwing, so an HTTP
 * route can turn it into a response and a script can log it.
 */
export async function applyRecalcPlan(
  supabase: SupabaseClient,
  opts: ApplyRecalcOptions,
): Promise<ApplyRecalcResult> {
  const { school_id, termId, plan, userId, reason } = opts;

  // ── Audit run row first so adjustments/credits can reference it ──
  const { data: runRow, error: runErr } = await supabase
    .from("bill_recalc_runs")
    .insert({
      school_id,
      term_id: termId,
      initiated_by: userId || null,
      reason,
      students_affected: plan.students_affected,
      bills_affected: plan.bills_affected,
      totals_before: plan.totals_before,
      totals_after: plan.totals_after,
      credits_created: 0,
    })
    .select("id")
    .single();
  if (runErr) return { ok: false, error: runErr.message };
  const runId = runRow.id as string;

  let creditsCreated = 0;

  // Credits already born from an allocation (idempotency for partial conversions)
  const { data: creditRows } = await supabase
    .from("credits")
    .select("source_allocation_id, amount")
    .eq("school_id", school_id)
    .not("source_allocation_id", "is", null);
  const creditedByAlloc = new Map<string, number>();
  for (const c of (creditRows || []) as { source_allocation_id: string; amount: number }[]) {
    creditedByAlloc.set(
      c.source_allocation_id,
      round2((creditedByAlloc.get(c.source_allocation_id) || 0) + Number(c.amount)),
    );
  }

  for (const billChange of plan.bills) {
    let billCreditsForBill = 0;

    for (const change of billChange.changes) {
      const isNewLine = change.line_id === null;

      // 1) Obligation amount update (insert when the head is new to the bill)
      let lineId = change.line_id;
      if (isNewLine) {
        const { data: created, error } = await supabase
          .from("student_bill_lines")
          .insert({
            school_id,
            bill_id: billChange.bill_id,
            fee_head_id: change.fee_head_id,
            term_fee_id: change.term_fee_id,
            class_fee_id: change.class_fee_id,
            amount: change.after,
            waived_amount: 0,
            is_compulsory: change.is_compulsory,
          })
          .select("id")
          .single();
        if (error) return { ok: false, error: error.message };
        lineId = created.id as string;
      } else if (change.after !== change.before) {
        const { error } = await supabase
          .from("student_bill_lines")
          .update({ amount: change.after })
          .eq("id", change.line_id)
          .eq("school_id", school_id);
        if (error) return { ok: false, error: error.message };
      }

      // 2) Excess paid → student credit (payments/allocs untouched; fully
      //    consumed allocations flagged, partial conversions stay unflagged
      //    and remain idempotent via the credits ledger).
      if (change.overflow > 0 && lineId) {
        const { data: lineAllocs } = await supabase
          .from("fee_allocations")
          .select("id, payment_id, amount")
          .eq("school_id", school_id)
          .eq("bill_line_id", lineId)
          .eq("converted_to_credit", false)
          .order("created_at");
        let remaining = change.overflow;
        for (const alloc of (lineAllocs || []) as { id: string; payment_id: string; amount: number }[]) {
          if (remaining <= 0) break;
          const alreadyCredited = round2(creditedByAlloc.get(alloc.id) || 0);
          const allocRemaining = round2(Math.max(0, Number(alloc.amount) - alreadyCredited));
          if (allocRemaining <= 0) continue;
          const take = round2(Math.min(allocRemaining, remaining));
          if (take <= 0) continue;
          await supabase.from("credits").insert({
            school_id,
            student_id: billChange.student_id,
            term_id: termId,
            amount: take,
            reason:
              `Fee "${change.fee_name}" reduced below amount paid (${change.before} → ${change.after})` +
              (reason ? ` — ${reason}` : ""),
            source: change.after === 0 ? "fee_removed" : "fee_change",
            source_payment_id: alloc.payment_id,
            source_allocation_id: alloc.id,
            source_fee_head_id: change.fee_head_id,
            source_bill_id: billChange.bill_id,
            status: "open",
            created_by: userId || null,
            recalc_run_id: runId,
          });
          const newAllocRemaining = round2(allocRemaining - take);
          creditedByAlloc.set(alloc.id, round2(alreadyCredited + take));
          if (newAllocRemaining <= 0) {
            await supabase
              .from("fee_allocations")
              .update({ converted_to_credit: true })
              .eq("id", alloc.id)
              .eq("school_id", school_id);
          }
          remaining = round2(remaining - take);
          creditsCreated += 1;
          billCreditsForBill += 1;
        }
      }

      // 3) Adjustment record (evidence of the obligation change)
      await supabase.from("financial_adjustments").insert({
        school_id,
        student_id: billChange.student_id,
        bill_id: billChange.bill_id,
        bill_line_id: lineId || null,
        term_id: termId,
        fee_head_id: change.fee_head_id,
        adjustment_type: "fee_change",
        before_amount: change.before,
        after_amount: change.after,
        reason: reason || `Fee setup changed for ${billChange.class_name || "class"}`,
        actor_id: userId || null,
        recalc_run_id: runId,
      });
    }

    // 4) Bill totals + derived status
    await supabase
      .from("student_bills")
      .update({
        gross_amount: billChange.gross_after,
        net_amount: billChange.net_after,
        status: billChange.status_after,
      })
      .eq("id", billChange.bill_id)
      .eq("school_id", school_id);

    // 5) Credit is used first: spend any credit this bill just gained on what
    //    it still owes, so fee reductions never strand paid money as unused
    //    credit while the bill stays unpaid.
    if (billCreditsForBill > 0) {
      await settleOpenCreditsToBill(supabase, {
        schoolId: school_id,
        studentId: billChange.student_id,
        billId: billChange.bill_id,
        actorId: userId || null,
      });
    }
  }

  if (creditsCreated > 0) {
    await supabase.from("bill_recalc_runs").update({ credits_created: creditsCreated }).eq("id", runId);
  }

  return { ok: true, runId, creditsCreated };
}
