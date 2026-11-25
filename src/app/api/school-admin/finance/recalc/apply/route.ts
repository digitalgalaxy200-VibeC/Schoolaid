import { NextResponse } from "next/server";
import { bursarRefusal, mayChangeLedger, verifyFinanceAdmin } from "@/lib/finance/permissions";
import { getServiceClient } from "@/lib/supabase/service";
import { buildRecalcPlan } from "@/lib/finance/recalc";
import { loadRecalcInputs } from "@/lib/finance/recalc-loader";
import { applyRecalcPlan } from "@/lib/finance/recalc-apply";

// Phase 2 — RECALCULATION APPLY
//   POST /finance/recalc/apply  { term_id, reason? }
// Only reachable through an explicit admin action AFTER preview approval.
//   - updates obligation line amounts to the current term-aware config
//   - adds new lines for fee heads added after generation
//   - zeroes lines whose fee head no longer applies (never deletes — history)
//   - keeps waivers; nets are floored at zero
//   - payments/allocations are NEVER modified; excess paid becomes recorded
//     credit, and the excessed allocations are flagged converted_to_credit
//   - writes adjustments + a bill_recalc_runs audit row
//
// The write loop itself lives in src/lib/finance/recalc-apply.ts, so a single
// bill (a class move) can be repriced by the same code rather than a copy.

export async function POST(request: Request) {
  const auth = await verifyFinanceAdmin();
  if (!auth.authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!mayChangeLedger(auth.role)) return bursarRefusal("recalculate bills");
  const { school_id, userId } = auth;

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

  const applied = await applyRecalcPlan(supabase, { school_id, termId, plan, userId, reason });
  if (!applied.ok) return NextResponse.json({ error: applied.error }, { status: 500 });

  return NextResponse.json({
    ok: true,
    updated_bills: plan.bills_affected,
    students_affected: plan.students_affected,
    totals_before: plan.totals_before,
    totals_after: plan.totals_after,
    credits_created: applied.creditsCreated,
    overflow_total: plan.overflow_total,
  });
}
