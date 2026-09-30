import { NextResponse } from "next/server";
import { verifySchoolAdmin } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";
import { buildRecalcPlan } from "@/lib/finance/recalc";
import { loadRecalcInputs } from "@/lib/finance/recalc-loader";
import { round2 } from "@/lib/finance/billing";

// Phase 2 — RECALCULATION PREVIEW
//   POST /finance/recalc/preview  { term_id }
// Never writes anything. Compares the term's existing bills against the
// current fee configuration and reports exactly what Apply would change.

export async function POST(request: Request) {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized || !school_id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const termId = body.term_id;
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

  const examples = plan.bills.slice(0, 6).map((b) => ({
    student_name: b.student_name,
    class_name: b.class_name,
    net_before: b.net_before,
    net_after: b.net_after,
    changes: b.changes.slice(0, 4).map((c) => ({
      fee: c.fee_name,
      before: c.before,
      after: c.after,
    })),
  }));

  return NextResponse.json({
    term_name: (term as { name: string }).name,
    students_affected: plan.students_affected,
    bills_affected: plan.bills_affected,
    totals_before: round2(plan.totals_before),
    totals_after: round2(plan.totals_after),
    difference: round2(plan.difference),
    overflow_total: round2(plan.overflow_total),
    overflow_students: plan.overflow_students,
    examples,
    up_to_date: plan.bills_affected === 0,
  });
}
