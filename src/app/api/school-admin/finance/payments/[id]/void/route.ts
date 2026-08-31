import { NextResponse } from "next/server";
import { verifySchoolAdmin } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";
import { round2 } from "@/lib/finance/billing";

// Phase 5 — void a payment (auditable; the record is NEVER deleted).
//   body: { reason }
// Voided payments no longer contribute to balances — their allocations
// remain in fee_allocations as history but are excluded via payments.status.

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { authorized, school_id, userId } = await verifySchoolAdmin();
  if (!authorized || !school_id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await request.json();
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (!reason) return NextResponse.json({ error: "reason is required to void a payment" }, { status: 400 });

  const supabase = getServiceClient();

  const { data: payment, error: payErr } = await supabase
    .from("payments")
    .select("id, status, notes")
    .eq("id", id)
    .eq("school_id", school_id)
    .maybeSingle();
  if (payErr) return NextResponse.json({ error: payErr.message }, { status: 500 });
  if (!payment) return NextResponse.json({ error: "Payment not found" }, { status: 404 });
  if (payment.status !== "active") {
    return NextResponse.json({ error: `Payment is already ${payment.status}` }, { status: 409 });
  }

  const { error: updErr } = await supabase
    .from("payments")
    .update({
      status: "voided",
      voided_by: userId,
      voided_at: new Date().toISOString(),
      notes: [payment.notes, `VOIDED: ${reason}`].filter(Boolean).join(" | "),
    })
    .eq("id", id);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  // Recompute affected bills' status from remaining posted allocations
  const { data: allocs } = await supabase
    .from("fee_allocations")
    .select("bill_line_id")
    .eq("payment_id", id);
  const lineIds = (allocs || []).map((a: { bill_line_id: string }) => a.bill_line_id);
  const billIds = new Set<string>();
  if (lineIds.length > 0) {
    const { data: lines } = await supabase
      .from("student_bill_lines")
      .select("bill_id")
      .in("id", lineIds);
    for (const l of (lines || []) as { bill_id: string }[]) billIds.add(l.bill_id);
  }

  for (const billId of billIds) {
    const { data: bill } = await supabase
      .from("student_bills")
      .select("id, net_amount")
      .eq("id", billId)
      .single();
    if (!bill) continue;
    const { data: billLines } = await supabase
      .from("student_bill_lines")
      .select("id")
      .eq("bill_id", billId);
    const ids = (billLines || []).map((l: { id: string }) => l.id);
    let paid = 0;
    if (ids.length > 0) {
      const { data: paidAllocs } = await supabase
        .from("fee_allocations")
        .select("amount, payments(status)")
        .in("bill_line_id", ids);
      for (const a of (paidAllocs || []) as { amount: number; payments: { status: string } | { status: string }[] | null }[]) {
        const raw = a.payments as { status: string } | { status: string }[] | null;
        const st = Array.isArray(raw) ? raw[0]?.status : raw?.status;
        if (st === "active") paid += Number(a.amount);
      }
    }
    const net = round2(Number(bill.net_amount));
    const newStatus = paid >= net ? "paid" : paid > 0 ? "partial" : "pending";
    await supabase.from("student_bills").update({ status: newStatus }).eq("id", billId);
  }

  return NextResponse.json({ id, status: "voided", voided_by: userId, voided_at: new Date().toISOString(), reason });
}
