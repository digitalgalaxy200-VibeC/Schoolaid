import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/service";
import { bursarRefusal, mayChangeLedger, verifyFinanceAdmin } from "@/lib/finance/permissions";
import { buildRecalcPlan } from "@/lib/finance/recalc";
import { loadRecalcInputs } from "@/lib/finance/recalc-loader";
import { applyRecalcPlan } from "@/lib/finance/recalc-apply";

// POST /finance/billing/[billId]/move-class   { class_id, reason? }
//
// A student was placed in the wrong class after bills were generated. This moves
// THAT bill to the right class and reprices it against that class's fees, using
// the same plan/apply path as "Sync with fee setup" — so waivers are preserved,
// paid money that becomes excess turns into credit, and the change is audited.
//
// It deliberately does NOT move the student record. Promotions and class
// allocation are an academic decision with their own screens; this fixes what
// the family is charged for this term.
//
// If the new class resolves to the same amounts, the bill is just moved, and the
// move is still recorded as a financial adjustment so History explains it.

type BillRow = {
  id: string;
  student_id: string;
  term_id: string;
  class_id: string | null;
  gross_amount: number;
  waiver_amount: number;
  net_amount: number;
  status: string;
};

export async function POST(request: Request, { params }: { params: Promise<{ billId: string }> }) {
  const auth = await verifyFinanceAdmin();
  if (!auth.authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!mayChangeLedger(auth.role)) return bursarRefusal("move a bill to another class");
  const { school_id, userId } = auth;

  const { billId } = await params;
  const body = await request.json().catch(() => ({}));
  const classId = typeof body.class_id === "string" ? body.class_id : "";
  const reason = typeof body.reason === "string" && body.reason.trim() ? body.reason.trim() : null;
  if (!classId) return NextResponse.json({ error: "class_id is required" }, { status: 400 });

  const supabase = getServiceClient();

  const [{ data: billRow }, { data: newClass }] = await Promise.all([
    supabase
      .from("student_bills")
      .select("id, student_id, term_id, class_id, gross_amount, waiver_amount, net_amount, status")
      .eq("id", billId)
      .eq("school_id", school_id)
      .maybeSingle(),
    supabase.from("classes").select("id, name").eq("id", classId).eq("school_id", school_id).maybeSingle(),
  ]);

  if (!billRow) return NextResponse.json({ error: "Bill not found" }, { status: 404 });
  if (!newClass) return NextResponse.json({ error: "class_id does not belong to this school" }, { status: 400 });

  const bill = billRow as BillRow;
  if (bill.class_id === classId) {
    return NextResponse.json({ error: "This bill is already in that class" }, { status: 400 });
  }

  const { data: oldClass } = bill.class_id
    ? await supabase.from("classes").select("id, name").eq("id", bill.class_id).eq("school_id", school_id).maybeSingle()
    : { data: null };

  const auditReason =
    `Bill moved from ${(oldClass as { name?: string } | null)?.name || "no class"} to ${newClass.name}` +
    (reason ? ` — ${reason}` : "");

  // Build the plan against the NEW class, for this bill only.
  const inputs = await loadRecalcInputs(supabase, school_id, bill.term_id);
  const lineIdsForBill = new Set(inputs.lines.filter((l) => l.bill_id === billId).map((l) => l.id));
  const plan = buildRecalcPlan({
    ...inputs,
    bills: [{ ...bill, class_id: classId }],
    lines: inputs.lines.filter((l) => l.bill_id === billId),
    allocs: inputs.allocs.filter((a) => lineIdsForBill.has(a.bill_line_id)),
  });

  // Move first: the apply step writes the repriced totals onto the row anyway,
  // and if it fails we put the class back, so a bill never claims a class whose
  // prices it does not hold.
  const { error: moveErr } = await supabase
    .from("student_bills")
    .update({ class_id: classId })
    .eq("id", billId)
    .eq("school_id", school_id);
  if (moveErr) return NextResponse.json({ error: moveErr.message }, { status: 500 });

  if (plan.bills_affected > 0) {
    const applied = await applyRecalcPlan(supabase, {
      school_id,
      termId: bill.term_id,
      plan,
      userId,
      reason: auditReason,
    });

    if (!applied.ok) {
      await supabase
        .from("student_bills")
        .update({ class_id: bill.class_id })
        .eq("id", billId)
        .eq("school_id", school_id);
      return NextResponse.json({ error: applied.error }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      moved_to: newClass.name,
      repriced: true,
      totals_before: plan.totals_before,
      totals_after: plan.totals_after,
      credits_created: applied.creditsCreated,
      overflow_total: plan.overflow_total,
    });
  }

  // Same prices: record the move so the audit trail is not silent.
  await supabase.from("financial_adjustments").insert({
    school_id,
    student_id: bill.student_id,
    bill_id: billId,
    term_id: bill.term_id,
    fee_head_id: null,
    adjustment_type: "class_moved",
    before_amount: Number(bill.gross_amount || 0),
    after_amount: Number(bill.gross_amount || 0),
    reason: `${auditReason} (amount unchanged)`,
    actor_id: userId || null,
  });

  return NextResponse.json({ ok: true, moved_to: newClass.name, repriced: false });
}
