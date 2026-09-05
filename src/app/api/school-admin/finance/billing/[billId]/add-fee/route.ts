import { NextResponse } from "next/server";
import { verifySchoolAdmin } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";
import { round2 } from "@/lib/finance/billing";
import { deriveStatusAfter } from "@/lib/finance/recalc";

export async function POST(request: Request, { params }: { params: Promise<{ billId: string }> }) {
  const { authorized, school_id, userId } = await verifySchoolAdmin();
  if (!authorized || !school_id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { billId } = await params;
  const body = await request.json().catch(() => ({}));
  const { fee_head_id, amount } = body;

  if (!fee_head_id) return NextResponse.json({ error: "fee_head_id is required" }, { status: 400 });
  const lineAmount = Number(amount);
  if (!Number.isFinite(lineAmount) || lineAmount <= 0) {
    return NextResponse.json({ error: "amount must be greater than 0" }, { status: 400 });
  }

  const supabase = getServiceClient();

  // Fetch the bill
  const { data: bill, error: billErr } = await supabase
    .from("student_bills")
    .select("*, students(id, class_id)")
    .eq("id", billId)
    .eq("school_id", school_id)
    .maybeSingle();

  if (billErr || !bill) return NextResponse.json({ error: "Bill not found" }, { status: 404 });

  // Fetch the fee head
  const { data: feeHead } = await supabase
    .from("fee_heads")
    .select("id, name, is_compulsory")
    .eq("id", fee_head_id)
    .eq("school_id", school_id)
    .maybeSingle();

  if (!feeHead) return NextResponse.json({ error: "Fee head not found" }, { status: 400 });

  // Check if line already exists for this fee head
  const { data: existingLine } = await supabase
    .from("student_bill_lines")
    .select("id, amount")
    .eq("bill_id", billId)
    .eq("fee_head_id", fee_head_id)
    .maybeSingle();

  if (existingLine) {
    return NextResponse.json({ error: `"${feeHead.name}" is already on this bill` }, { status: 400 });
  }

  // Find class_fee and term_fee references if available
  const { data: termFee } = await supabase
    .from("term_fees")
    .select("id")
    .eq("school_id", school_id)
    .eq("fee_head_id", fee_head_id)
    .is("academic_section_id", null)
    .eq("term_id", bill.term_id)
    .maybeSingle();

  let classFeeId: string | null = null;
  if (termFee && bill.class_id) {
    const { data: cf } = await supabase
      .from("class_fees")
      .select("id")
      .eq("school_id", school_id)
      .eq("term_fee_id", termFee.id)
      .eq("class_id", bill.class_id)
      .maybeSingle();
    if (cf) classFeeId = cf.id;
  }

  // 1. Insert student_fee_adjustments opt-in record
  if (classFeeId) {
    const { data: existingAdj } = await supabase
      .from("student_fee_adjustments")
      .select("id")
      .eq("school_id", school_id)
      .eq("student_id", bill.student_id)
      .eq("class_fee_id", classFeeId)
      .maybeSingle();

    if (existingAdj) {
      await supabase
        .from("student_fee_adjustments")
        .update({ is_opted_in: true })
        .eq("id", existingAdj.id);
    } else {
      await supabase.from("student_fee_adjustments").insert({
        school_id,
        student_id: bill.student_id,
        class_fee_id: classFeeId,
        is_opted_in: true,
      });
    }
  }

  // 2. Insert new bill line item
  const { data: newLine, error: lineErr } = await supabase
    .from("student_bill_lines")
    .insert({
      school_id,
      bill_id: billId,
      fee_head_id: fee_head_id,
      term_fee_id: termFee?.id || null,
      class_fee_id: classFeeId,
      amount: lineAmount,
      waived_amount: 0,
      is_compulsory: !!feeHead.is_compulsory,
    })
    .select("id")
    .single();

  if (lineErr) return NextResponse.json({ error: lineErr.message }, { status: 500 });

  // 3. Recalculate bill totals
  const { data: allLines } = await supabase
    .from("student_bill_lines")
    .select("amount, waived_amount")
    .eq("bill_id", billId);

  const grossAfter = round2((allLines || []).reduce((s, l) => s + Number(l.amount), 0));
  const waiverAmount = Number(bill.waiver_amount || 0);
  const netAfter = round2(Math.max(0, grossAfter - waiverAmount));

  // Check paid amount
  const lineIds = (allLines || []).map((l: { id?: string }) => l.id).filter(Boolean);
  let paid = 0;
  if (lineIds.length > 0) {
    const { data: allocs } = await supabase
      .from("fee_allocations")
      .select("amount, converted_to_credit, payments(status)")
      .eq("school_id", school_id)
      .in("bill_line_id", lineIds);

    for (const a of (allocs || []) as { amount: number; converted_to_credit: boolean | null; payments: { status: string } | null }[]) {
      if (a.converted_to_credit === true) continue;
      if (a.payments?.status === "active") paid += Number(a.amount);
    }
  }

  const statusAfter = deriveStatusAfter(netAfter, paid);

  // Update bill record
  await supabase
    .from("student_bills")
    .update({
      gross_amount: grossAfter,
      net_amount: netAfter,
      status: statusAfter,
    })
    .eq("id", billId)
    .eq("school_id", school_id);

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

  return NextResponse.json({
    ok: true,
    line_id: newLine.id,
    gross_amount: grossAfter,
    net_amount: netAfter,
    status: statusAfter,
  });
}
