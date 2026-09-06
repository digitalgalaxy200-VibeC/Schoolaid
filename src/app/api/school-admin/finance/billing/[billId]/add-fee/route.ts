import { NextResponse } from "next/server";
import { verifySchoolAdmin } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";
import { loadFeeConfig, resolveFeeHeadConfig, round2 } from "@/lib/finance/billing";
import { deriveStatusAfter } from "@/lib/finance/recalc";

// Phase 1 (FIN-002) — add an OPTIONAL fee to ONE student's bill.
//   POST /finance/billing/[billId]/add-fee  { fee_head_id, amount? }
// Rules enforced here (matching the engine in billing.ts):
//   - Optionality comes from the term fee's fee_type (single source). A fee
//     that resolves as REQUIRED for this class cannot be added per student —
//     required fees propagate through billing sync, never through this route.
//   - The opt-in (student_fee_adjustments) is ALWAYS recorded — keyed to the
//     class override row when one exists, otherwise to the term fee row — so
//     the next sync/recalc keeps the fee for this student only.
//   - The amount is the engine's resolved amount for the class (the client
//     amount is only a fallback for legacy fee heads no longer configured).
//   - A fee previously removed (line zeroed) can be re-added: the line is
//     restored instead of duplicated; converted allocations stay credit.

export async function POST(request: Request, { params }: { params: Promise<{ billId: string }> }) {
  const { authorized, school_id, userId } = await verifySchoolAdmin();
  if (!authorized || !school_id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { billId } = await params;
  const body = await request.json().catch(() => ({}));
  const { fee_head_id, amount } = body;

  if (!fee_head_id) return NextResponse.json({ error: "fee_head_id is required" }, { status: 400 });

  const supabase = getServiceClient();

  // Fetch the bill
  const { data: bill, error: billErr } = await supabase
    .from("student_bills")
    .select("id, student_id, term_id, class_id, waiver_amount, students(id, class_id)")
    .eq("id", billId)
    .eq("school_id", school_id)
    .maybeSingle();

  if (billErr || !bill) return NextResponse.json({ error: "Bill not found" }, { status: 404 });

  // Fetch the fee head (name + legacy compulsory fallback)
  const { data: feeHead } = await supabase
    .from("fee_heads")
    .select("id, name, is_compulsory")
    .eq("id", fee_head_id)
    .eq("school_id", school_id)
    .maybeSingle();

  if (!feeHead) return NextResponse.json({ error: "Fee head not found" }, { status: 400 });

  // Class context: the bill's class-at-billing wins; legacy bills fall back to
  // the student's current class. resolveFeeHeadConfig mirrors resolveBillLines.
  const rawStudent = bill.students as { id: string; class_id: string | null } | { id: string; class_id: string | null }[] | null;
  const student = Array.isArray(rawStudent) ? rawStudent[0] : rawStudent;
  const effClassId = bill.class_id || student?.class_id || null;

  const config = await loadFeeConfig(supabase, school_id);
  const resolution = resolveFeeHeadConfig(config, { id: bill.student_id, class_id: effClassId }, bill.term_id, fee_head_id);

  // ── Amount: the engine's resolved amount wins; client amount only as a
  //    fallback for legacy fee heads that are no longer in the term config. ──
  const engineAmount = resolution.amount;
  let lineAmount = engineAmount > 0 ? engineAmount : Number(amount);
  if (!Number.isFinite(lineAmount) || lineAmount <= 0) {
    return NextResponse.json(
      { error: engineAmount <= 0 ? "This fee is not configured for this class/term — set it in Fee Setup first" : "amount must be greater than 0" },
      { status: 400 },
    );
  }
  lineAmount = round2(lineAmount);

  // ── Single source of optionality: the term fee type decides. A fee that is
  //    required for this class must never be added per student. ──
  const isCompulsory = resolution.term_fee ? resolution.is_compulsory : !!feeHead.is_compulsory;
  if (isCompulsory) {
    return NextResponse.json(
      { error: `"${feeHead.name}" is a required fee for this class — it is applied through Billing Sync, not added per student` },
      { status: 400 },
    );
  }

  // ── Existing line? A live line (amount > 0) is a duplicate. A removed line
  //    (zeroed when paid, or deleted when never paid) can be re-added. ──
  const { data: existingLine } = await supabase
    .from("student_bill_lines")
    .select("id, amount")
    .eq("bill_id", billId)
    .eq("fee_head_id", fee_head_id)
    .maybeSingle();

  const billLinesFor = async (): Promise<{ id: string; amount: number; waived_amount: number }[]> => {
    const { data } = await supabase
      .from("student_bill_lines")
      .select("id, amount, waived_amount")
      .eq("bill_id", billId);
    return (data || []) as { id: string; amount: number; waived_amount: number }[];
  };

  // Recompute bill totals + derived status from the lines AFTER the change
  // (shared by add, re-add and remove — one code path, one answer).
  const recomputeBill = async (billRow: { id: string; waiver_amount: number }) => {
    const allLines = await billLinesFor();
    const grossAfter = round2(allLines.reduce((s, l) => s + Number(l.amount), 0));
    const waiverAmount = Number(billRow.waiver_amount || 0);
    const netAfter = round2(Math.max(0, grossAfter - waiverAmount));
    const lineIds = allLines.map((l) => l.id);
    let paid = 0;
    if (lineIds.length > 0) {
      const { data: allocs } = await supabase
        .from("fee_allocations")
        .select("amount, converted_to_credit, payments(status)")
        .eq("school_id", school_id)
        .in("bill_line_id", lineIds);
      for (const a of (allocs || []) as { amount: number; converted_to_credit: boolean | null; payments: { status: string } | { status: string }[] | null }[]) {
        if (a.converted_to_credit === true) continue;
        const raw = a.payments as { status: string } | { status: string }[] | null;
        const st = Array.isArray(raw) ? raw[0]?.status : raw?.status;
        if (st === "active") paid += Number(a.amount);
      }
    }
    paid = round2(paid);
    const statusAfter = deriveStatusAfter(netAfter, paid);
    await supabase
      .from("student_bills")
      .update({ gross_amount: grossAfter, net_amount: netAfter, status: statusAfter })
      .eq("id", billRow.id)
      .eq("school_id", school_id);
    return { gross_amount: grossAfter, net_amount: netAfter, status: statusAfter };
  };

  // ── Opt-in record (student-specific). Keyed to the class override when one
  //    exists, otherwise to the term fee row itself. Required so the next
  //    sync/recalc keeps this fee for THIS student only. ──
  const ensureOptIn = async () => {
    if (!resolution.term_fee) return; // legacy fee head — nothing to key to
    const key = resolution.class_fee
      ? { class_fee_id: resolution.class_fee.id, term_fee_id: null }
      : { class_fee_id: null, term_fee_id: resolution.term_fee.id };
    const q = supabase
      .from("student_fee_adjustments")
      .select("id")
      .eq("school_id", school_id)
      .eq("student_id", bill.student_id);
    const { data: existing } = resolution.class_fee
      ? await q.eq("class_fee_id", resolution.class_fee.id).maybeSingle()
      : await q.eq("term_fee_id", resolution.term_fee.id).maybeSingle();
    if (existing) {
      await supabase.from("student_fee_adjustments").update({ is_opted_in: true }).eq("id", existing.id).eq("school_id", school_id);
    } else {
      await supabase
        .from("student_fee_adjustments")
        .insert({ school_id, student_id: bill.student_id, is_opted_in: true, ...key });
    }
  };

  // ── Re-add of a removed (zeroed) fee: restore the existing line. ──
  if (existingLine) {
    if (Number(existingLine.amount) > 0) {
      return NextResponse.json({ error: `"${feeHead.name}" is already on this bill` }, { status: 400 });
    }
    const { data: restored, error: updErr } = await supabase
      .from("student_bill_lines")
      .update({
        amount: lineAmount,
        is_compulsory: false,
        term_fee_id: resolution.term_fee?.id || null,
        class_fee_id: resolution.class_fee?.id || null,
      })
      .eq("id", existingLine.id)
      .eq("school_id", school_id)
      .select("id")
      .single();
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

    await ensureOptIn();
    await supabase.from("financial_adjustments").insert({
      school_id,
      student_id: bill.student_id,
      bill_id: billId,
      bill_line_id: restored.id,
      term_id: bill.term_id,
      fee_head_id,
      adjustment_type: "fee_added",
      before_amount: 0,
      after_amount: lineAmount,
      reason: `Optional fee re-added: ${feeHead.name}`,
      actor_id: userId || null,
    });
    const totals = await recomputeBill(bill);
    return NextResponse.json({
      ok: true,
      restored: true,
      line_id: restored.id,
      ...totals,
    });
  }

  // ── Brand-new line ──
  await ensureOptIn();
  const { data: newLine, error: lineErr } = await supabase
    .from("student_bill_lines")
    .insert({
      school_id,
      bill_id: billId,
      fee_head_id: fee_head_id,
      term_fee_id: resolution.term_fee?.id || null,
      class_fee_id: resolution.class_fee?.id || null,
      amount: lineAmount,
      waived_amount: 0,
      is_compulsory: false,
    })
    .select("id")
    .single();

  if (lineErr) return NextResponse.json({ error: lineErr.message }, { status: 500 });

  // Log financial adjustment
  await supabase.from("financial_adjustments").insert({
    school_id,
    student_id: bill.student_id,
    bill_id: billId,
    bill_line_id: newLine.id,
    term_id: bill.term_id,
    fee_head_id,
    adjustment_type: "fee_added",
    before_amount: 0,
    after_amount: lineAmount,
    reason: `Opted into optional fee: ${feeHead.name}`,
    actor_id: userId || null,
  });

  const totals = await recomputeBill(bill);
  return NextResponse.json({
    ok: true,
    line_id: newLine.id,
    ...totals,
  });
}
