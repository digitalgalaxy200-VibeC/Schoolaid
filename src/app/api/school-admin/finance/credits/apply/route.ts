import { NextResponse } from "next/server";
import { verifySchoolAdmin } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";
import { round2 } from "@/lib/finance/billing";

// Phase 3 — CREDIT APPLICATION (explicit, per spec §11)
//   POST /finance/credits/apply { credit_id, bill_id, amount }
// Moves credit ONTO a specific bill of the SAME student. The credit record and
// its source history never change; remaining credit is derived from
// applications. After applying, the bill's stored status is refreshed.

export async function POST(request: Request) {
  const { authorized, school_id, userId } = await verifySchoolAdmin();
  if (!authorized || !school_id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const { credit_id, bill_id, amount } = body;
  if (!credit_id || !bill_id) return NextResponse.json({ error: "credit_id and bill_id are required" }, { status: 400 });
  const amt = round2(Number(amount));
  if (!Number.isFinite(amt) || amt <= 0) return NextResponse.json({ error: "amount must be greater than zero" }, { status: 400 });

  const supabase = getServiceClient();

  // ── Tenant isolation + same-student rule ──
  const { data: credit } = await supabase
    .from("credits")
    .select("id, student_id, amount, status")
    .eq("id", credit_id)
    .eq("school_id", school_id)
    .maybeSingle();
  if (!credit) return NextResponse.json({ error: "credit_id does not belong to this school" }, { status: 400 });
  if (credit.status !== "open") return NextResponse.json({ error: "This credit is already fully applied or closed" }, { status: 400 });

  const { data: bill } = await supabase
    .from("student_bills")
    .select("id, student_id, term_id, net_amount, gross_amount, waiver_amount, status")
    .eq("id", bill_id)
    .eq("school_id", school_id)
    .maybeSingle();
  if (!bill) return NextResponse.json({ error: "bill_id does not belong to this school" }, { status: 400 });
  if (bill.student_id !== credit.student_id) {
    return NextResponse.json({ error: "Credit can only be applied to the same student's bill" }, { status: 400 });
  }

  // Remaining credit (derived — never trusted from a stored column)
  const { data: apps } = await supabase
    .from("credit_applications")
    .select("amount")
    .eq("school_id", school_id)
    .eq("credit_id", credit_id);
  const applied = round2((apps || []).reduce((s: number, a: { amount: number }) => s + Number(a.amount), 0));
  const remaining = round2(Math.max(0, Number(credit.amount) - applied));
  if (amt > remaining) {
    return NextResponse.json({ error: `Only ${remaining} of this credit remains` }, { status: 400 });
  }

  // ── Outstanding guard: never apply more credit than the bill's outstanding ──
  const { data: lineRows } = await supabase.from("student_bill_lines").select("id").eq("bill_id", bill.id);
  const lineIds = (lineRows || []).map((l: { id: string }) => l.id);
  let paid = 0;
  if (lineIds.length > 0) {
    const { data: allocs } = await supabase
      .from("fee_allocations")
      .select("amount, converted_to_credit, payments(status)")
      .eq("school_id", school_id)
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
  }
  const { data: billApps } = await supabase
    .from("credit_applications")
    .select("amount")
    .eq("school_id", school_id)
    .eq("bill_id", bill.id);
  const billApplied = round2((billApps || []).reduce((s: number, a: { amount: number }) => s + Number(a.amount), 0));
  paid = round2(paid);
  const net = round2(Number(bill.net_amount));
  const outstanding = round2(Math.max(0, net - paid - billApplied));
  if (amt > outstanding) {
    return NextResponse.json({ error: `Applying ${amt} would exceed this bill's outstanding of ${outstanding}` }, { status: 400 });
  }

  // ── Apply ──
  const { error: appErr } = await supabase.from("credit_applications").insert({
    school_id,
    credit_id: credit.id,
    student_id: credit.student_id,
    bill_id: bill.id,
    term_id: bill.term_id,
    amount: amt,
    applied_by: userId || null,
  });
  if (appErr) return NextResponse.json({ error: appErr.message }, { status: 500 });

  const newApplied = round2(applied + amt);
  const newBillApplied = round2(billApplied + amt);
  const newRemaining = round2(Math.max(0, Number(credit.amount) - newApplied));

  // Close the credit when fully used
  if (newRemaining <= 0) {
    await supabase.from("credits").update({ status: "closed" }).eq("id", credit.id).eq("school_id", school_id);
  }

  // Refresh the bill's derived status (payments + applied credits together)
  const covered = round2(paid + newBillApplied);
  const newStatus = covered >= net ? "paid" : covered > 0 ? "partial" : "pending";
  await supabase.from("student_bills").update({ status: newStatus }).eq("id", bill.id).eq("school_id", school_id);

  return NextResponse.json({
    ok: true,
    applied_amount: amt,
    credit_remaining: newRemaining,
    bill_outstanding: round2(Math.max(0, outstanding - amt)),
    bill_status: newStatus,
  });
}
