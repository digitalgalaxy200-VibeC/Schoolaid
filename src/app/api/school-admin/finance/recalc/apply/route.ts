import { NextResponse } from "next/server";
import { verifySchoolAdmin } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";
import { buildRecalcPlan } from "@/lib/finance/recalc";
import { loadRecalcInputs } from "@/lib/finance/recalc-loader";
import { round2 } from "@/lib/finance/billing";

// Phase 2 — RECALCULATION APPLY
//   POST /finance/recalc/apply  { term_id, reason? }
// Only reachable through an explicit admin action AFTER preview approval.
//   - updates obligation line amounts to the current term-aware config
//   - adds new lines for fee heads added after generation
//   - zeroes lines whose fee head no longer applies (never deletes — history)
//   - keeps waivers; nets are floored at zero
//   - payments/allocations are NEVER modified; excess paid becomes recorded
//     credit (credits ledger) with source references, and the excessed
//     allocations are flagged converted_to_credit
//   - writes adjustments + a bill_recalc_runs audit row

export async function POST(request: Request) {
  const { authorized, school_id, userId } = await verifySchoolAdmin();
  if (!authorized || !school_id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const termId = body.term_id;
  const reason = typeof body.reason === "string" && body.reason.trim() ? body.reason.trim() : null;
  if (!termId) return NextResponse.json({ error: "term_id is required" }, { status: 400 });

  const supabase = getServiceClient();

  const { data: term } = await supabase
    .from("academic_terms")
    .select("id, name")
    .eq("id", termId)
    .eq("school_id", school_id)
    .maybeSingle();
  if (!term) return NextResponse.json({ error: "term_id does not belong to this school" }, { status: 400 });

  const inputs = await loadRecalcInputs(supabase, school_id, termId);
  const plan = buildRecalcPlan(inputs);

  if (plan.bills_affected === 0) {
    return NextResponse.json({ ok: true, message: "Bills already match the fee setup — nothing to change", updated_bills: 0 });
  }

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
  if (runErr) return NextResponse.json({ error: runErr.message }, { status: 500 });
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
    creditedByAlloc.set(c.source_allocation_id, round2((creditedByAlloc.get(c.source_allocation_id) || 0) + Number(c.amount)));
  }

  for (const billChange of plan.bills) {
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
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        lineId = created.id as string;
      } else if (change.after !== change.before) {
        const { error } = await supabase
          .from("student_bill_lines")
          .update({ amount: change.after })
          .eq("id", change.line_id)
          .eq("school_id", school_id);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
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
            reason: `Fee "${change.fee_name}" reduced below amount paid (${change.before} → ${change.after})` + (reason ? ` — ${reason}` : ""),
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
  }

  if (creditsCreated > 0) {
    await supabase.from("bill_recalc_runs").update({ credits_created: creditsCreated }).eq("id", runId);
  }

  return NextResponse.json({
    ok: true,
    updated_bills: plan.bills_affected,
    students_affected: plan.students_affected,
    totals_before: plan.totals_before,
    totals_after: plan.totals_after,
    credits_created: creditsCreated,
    overflow_total: plan.overflow_total,
  });
}
