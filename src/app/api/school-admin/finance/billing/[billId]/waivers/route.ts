import { NextResponse } from "next/server";
import { verifySchoolAdmin } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";
import { round2 } from "@/lib/finance/billing";

// Phase 3 — apply a waiver to a bill.
//   body: { amount?, percentage?, fee_head_id?, reason }
//   - percentage given  → amount = percentage% of gross (bill-level) or of the
//     fee line amount (when fee_head_id provided)
//   - fee_head_id given → line-level waiver (updates the line's waived_amount)
//   - otherwise         → bill-level waiver (reduces the bill total)
// The COMPUTED amount is stored — history stays exact.

export async function POST(request: Request, { params }: { params: Promise<{ billId: string }> }) {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized || !school_id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { billId } = await params;
  const body = await request.json();
  const { amount, percentage, fee_head_id, reason } = body;

  const supabase = getServiceClient();

  const { data: bill, error: billErr } = await supabase
    .from("student_bills")
    .select("*")
    .eq("id", billId)
    .eq("school_id", school_id)
    .maybeSingle();
  if (billErr) return NextResponse.json({ error: billErr.message }, { status: 500 });
  if (!bill) return NextResponse.json({ error: "Bill not found" }, { status: 404 });

  // Resolve the waiver amount
  let waiverAmount: number;
  if (percentage !== undefined) {
    const pct = Number(percentage);
    if (!Number.isFinite(pct) || pct <= 0 || pct > 100) {
      return NextResponse.json({ error: "percentage must be between 0 and 100" }, { status: 400 });
    }
    if (fee_head_id) {
      const { data: line } = await supabase
        .from("student_bill_lines")
        .select("id, amount")
        .eq("bill_id", billId)
        .eq("fee_head_id", fee_head_id)
        .maybeSingle();
      if (!line) return NextResponse.json({ error: "fee_head_id is not on this bill" }, { status: 400 });
      waiverAmount = round2((Number(line.amount) * pct) / 100);
    } else {
      waiverAmount = round2((Number(bill.gross_amount) * pct) / 100);
    }
  } else {
    waiverAmount = round2(Number(amount));
    if (!Number.isFinite(waiverAmount) || waiverAmount <= 0) {
      return NextResponse.json({ error: "amount must be a positive number" }, { status: 400 });
    }
  }

  // Line-level: clamp to the line's remaining amount
  let lineId: string | null = null;
  if (fee_head_id) {
    const { data: line } = await supabase
      .from("student_bill_lines")
      .select("id, amount, waived_amount")
      .eq("bill_id", billId)
      .eq("fee_head_id", fee_head_id)
      .maybeSingle();
    if (!line) return NextResponse.json({ error: "fee_head_id is not on this bill" }, { status: 400 });
    const remaining = round2(Number(line.amount) - Number(line.waived_amount));
    if (waiverAmount > remaining) {
      return NextResponse.json({ error: `Waiver exceeds the remaining line amount (${remaining})` }, { status: 400 });
    }
    lineId = line.id;
    const { error: lineErr } = await supabase
      .from("student_bill_lines")
      .update({ waived_amount: round2(Number(line.waived_amount) + waiverAmount) })
      .eq("id", line.id);
    if (lineErr) return NextResponse.json({ error: lineErr.message }, { status: 500 });
  } else {
    const remaining = round2(Number(bill.gross_amount) - Number(bill.waiver_amount));
    if (waiverAmount > remaining) {
      return NextResponse.json({ error: `Waiver exceeds the remaining bill amount (${remaining})` }, { status: 400 });
    }
  }

  // Insert the waiver record (term-scoped, fee-specific when applicable)
  const { data: waiver, error: wErr } = await supabase
    .from("student_waivers")
    .insert({
      school_id,
      student_id: bill.student_id,
      amount: waiverAmount,
      reason: reason || null,
      term_id: bill.term_id,
      fee_head_id: fee_head_id || null,
      waiver_type: percentage !== undefined ? "percentage" : "fixed",
    })
    .select()
    .single();
  if (wErr) return NextResponse.json({ error: wErr.message }, { status: 500 });

  // Recompute bill totals
  const newWaiverTotal = round2(Number(bill.waiver_amount) + waiverAmount);
  const newNet = round2(Math.max(0, Number(bill.gross_amount) - newWaiverTotal));
  const { data: updatedBill, error: uErr } = await supabase
    .from("student_bills")
    .update({ waiver_amount: newWaiverTotal, net_amount: newNet })
    .eq("id", billId)
    .select()
    .single();
  if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 });

  return NextResponse.json(
    { waiver, bill: updatedBill, line_id: lineId },
    { status: 201 },
  );
}
