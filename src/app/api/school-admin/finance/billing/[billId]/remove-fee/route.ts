import { NextResponse } from "next/server";
import { verifySchoolAdmin } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";
import { round2 } from "@/lib/finance/billing";
import { deriveStatusAfter } from "@/lib/finance/recalc";

// Phase 1 (FIN-002) — remove an OPTIONAL fee from ONE student's bill.
//   POST /finance/billing/[billId]/remove-fee  { fee_head_id, reason? }
// Financial integrity rules (all enforced here, matching the recalc engine):
//   - REQUIRED fees cannot be removed through this workflow (fee setup or a
//     waiver is the correct path for those).
//   - The student's opt-in is flipped OFF, so a later Sync/recalc can never
//     resurrect this fee for this student (but never touches other students).
//   - If the fee was never paid (no allocation rows), the line is deleted.
//   - If money was allocated to it, the line is ZEROED — never deleted — and
//     the paid amount becomes student credit through the exact same
//     conversion used by recalculation: the payment and allocation rows stay
//     untouched (immutable), the allocation is flagged converted_to_credit
//     once fully consumed, and a credits-ledger row references its origin.
//   - Every removal writes a fee_removed adjustment (audit trail).

type ObjJoin<T> = T | T[] | null;
const firstOf = <T,>(join: ObjJoin<T>): T | null => (Array.isArray(join) ? join[0] ?? null : join ?? null);

export async function POST(request: Request, { params }: { params: Promise<{ billId: string }> }) {
  const { authorized, school_id, userId } = await verifySchoolAdmin();
  if (!authorized || !school_id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { billId } = await params;
  const body = await request.json().catch(() => ({}));
  const { fee_head_id, reason } = body;
  if (!fee_head_id) return NextResponse.json({ error: "fee_head_id is required" }, { status: 400 });
  const removalReason = typeof reason === "string" && reason.trim() ? reason.trim() : null;

  const supabase = getServiceClient();

  // ── Bill (tenant-scoped) ──
  const { data: bill, error: billErr } = await supabase
    .from("student_bills")
    .select("id, student_id, term_id, waiver_amount")
    .eq("id", billId)
    .eq("school_id", school_id)
    .maybeSingle();
  if (billErr || !bill) return NextResponse.json({ error: "Bill not found" }, { status: 404 });

  // ── The line for this fee head ──
  const { data: line } = await supabase
    .from("student_bill_lines")
    .select("id, fee_head_id, amount, waived_amount, is_compulsory, term_fee_id, class_fee_id, fee_heads(id, name)")
    .eq("school_id", school_id)
    .eq("bill_id", billId)
    .eq("fee_head_id", fee_head_id)
    .maybeSingle();
  if (!line) return NextResponse.json({ error: "This fee is not on the student's bill" }, { status: 404 });

  const lineRow = line as {
    id: string;
    fee_head_id: string;
    amount: number;
    is_compulsory: boolean;
    term_fee_id: string | null;
    class_fee_id: string | null;
    fee_heads: { id: string; name: string } | { id: string; name: string }[] | null;
  };
  const feeHeadJoin = lineRow.fee_heads as ObjJoin<{ id: string; name: string }>;
  const feeName = firstOf(feeHeadJoin)?.name || "Fee";

  if (lineRow.is_compulsory) {
    return NextResponse.json(
      { error: `"${feeName}" is a required fee — required fees cannot be removed from a student's account. Adjust the fee setup or grant a waiver instead.` },
      { status: 400 },
    );
  }

  const beforeAmount = round2(Number(lineRow.amount));
  if (beforeAmount <= 0) {
    // Already removed — idempotent
    return NextResponse.json({ ok: true, already_removed: true, credit_amount: 0 });
  }

  // ── Allocations that touched this line (any payment state) ──
  const { data: allocRows } = await supabase
    .from("fee_allocations")
    .select("id, payment_id, amount, converted_to_credit, payments(status)")
    .eq("school_id", school_id)
    .eq("bill_line_id", lineRow.id);
  const allocs = (allocRows || []) as {
    id: string;
    payment_id: string;
    amount: number;
    converted_to_credit: boolean | null;
    payments: { status: string } | { status: string }[] | null;
  }[];
  const activeAllocs = allocs.filter((a) => {
    if (a.converted_to_credit === true) return false;
    const raw = a.payments as { status: string } | { status: string }[] | null;
    const st = Array.isArray(raw) ? raw[0]?.status : raw?.status;
    return st === "active";
  });

  // Credits already born from these allocations (idempotency for partial conversions)
  const allocIds = activeAllocs.map((a) => a.id);
  const creditedByAlloc = new Map<string, number>();
  if (allocIds.length > 0) {
    const { data: creditRows } = await supabase
      .from("credits")
      .select("source_allocation_id, amount")
      .eq("school_id", school_id)
      .in("source_allocation_id", allocIds);
    for (const c of (creditRows || []) as { source_allocation_id: string; amount: number }[]) {
      creditedByAlloc.set(c.source_allocation_id, round2((creditedByAlloc.get(c.source_allocation_id) || 0) + Number(c.amount)));
    }
  }
  // The whole remaining paid weight converts: the fee no longer applies (after = 0).
  let creditAmount = 0;
  for (const a of activeAllocs) {
    const remaining = round2(Math.max(0, Number(a.amount) - (creditedByAlloc.get(a.id) || 0)));
    creditAmount = round2(creditAmount + remaining);
  }

  // ── 1) The line ──
  // No allocation rows at all → delete safely (nothing references it).
  // Any allocation (paid or voided) → zero the amount; the row must survive so
  // receipts/breakdowns that read allocations keep their history.
  let lineDeleted = false;
  if (allocs.length === 0) {
    const { error: delErr } = await supabase.from("student_bill_lines").delete().eq("id", lineRow.id).eq("school_id", school_id);
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });
    lineDeleted = true;
  } else {
    const { error: updErr } = await supabase
      .from("student_bill_lines")
      .update({ amount: 0 })
      .eq("id", lineRow.id)
      .eq("school_id", school_id);
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  // ── 2) Paid amount → student credit (payments untouched; consumed
  //       allocations flagged — identical semantics to the recalc engine) ──
  if (creditAmount > 0) {
    for (const a of activeAllocs) {
      const alreadyCredited = round2(creditedByAlloc.get(a.id) || 0);
      const take = round2(Math.max(0, Number(a.amount) - alreadyCredited));
      if (take <= 0) continue;
      await supabase.from("credits").insert({
        school_id,
        student_id: bill.student_id,
        term_id: bill.term_id,
        amount: take,
        reason:
          `"${feeName}" removed from this student's account — previously paid amount converted to credit` +
          (removalReason ? ` — ${removalReason}` : ""),
        source: "fee_removed",
        source_payment_id: a.payment_id,
        source_allocation_id: a.id,
        source_fee_head_id: lineRow.fee_head_id,
        source_bill_id: billId,
        status: "open",
        created_by: userId || null,
      });
      await supabase.from("fee_allocations").update({ converted_to_credit: true }).eq("id", a.id).eq("school_id", school_id);
    }
  }

  // ── 3) Flip the student's opt-in OFF so sync/recalc cannot resurrect it ──
  if (lineRow.class_fee_id) {
    await supabase
      .from("student_fee_adjustments")
      .update({ is_opted_in: false })
      .eq("school_id", school_id)
      .eq("student_id", bill.student_id)
      .eq("class_fee_id", lineRow.class_fee_id);
  } else if (lineRow.term_fee_id) {
    await supabase
      .from("student_fee_adjustments")
      .update({ is_opted_in: false })
      .eq("school_id", school_id)
      .eq("student_id", bill.student_id)
      .eq("term_fee_id", lineRow.term_fee_id);
  }

  // ── 4) Audit adjustment (fee_removed) ──
  await supabase.from("financial_adjustments").insert({
    school_id,
    student_id: bill.student_id,
    bill_id: billId,
    bill_line_id: lineDeleted ? null : lineRow.id,
    term_id: bill.term_id,
    fee_head_id: lineRow.fee_head_id,
    adjustment_type: "fee_removed",
    before_amount: beforeAmount,
    after_amount: 0,
    reason: removalReason || `Optional fee removed: ${feeName}`,
    actor_id: userId || null,
  });

  // ── 5) Recompute bill totals + derived status ──
  const { data: remainingLines } = await supabase
    .from("student_bill_lines")
    .select("id, amount, waived_amount")
    .eq("bill_id", billId);
  const afterLines = (remainingLines || []) as { id: string; amount: number; waived_amount: number }[];
  const grossAfter = round2(afterLines.reduce((s, l) => s + Number(l.amount), 0));
  const waiverAmount = round2(Number(bill.waiver_amount || 0));
  const netAfter = round2(Math.max(0, grossAfter - waiverAmount));

  const afterLineIds = afterLines.map((l) => l.id);
  let covered = 0;
  if (afterLineIds.length > 0) {
    const { data: allocsAfter } = await supabase
      .from("fee_allocations")
      .select("amount, converted_to_credit, payments(status)")
      .eq("school_id", school_id)
      .in("bill_line_id", afterLineIds);
    for (const a of (allocsAfter || []) as { amount: number; converted_to_credit: boolean | null; payments: { status: string } | { status: string }[] | null }[]) {
      if (a.converted_to_credit === true) continue;
      const raw = a.payments as { status: string } | { status: string }[] | null;
      const st = Array.isArray(raw) ? raw[0]?.status : raw?.status;
      if (st === "active") covered += Number(a.amount);
    }
  }
  covered = round2(covered);
  const statusAfter = deriveStatusAfter(netAfter, covered);
  await supabase
    .from("student_bills")
    .update({ gross_amount: grossAfter, net_amount: netAfter, status: statusAfter })
    .eq("id", billId)
    .eq("school_id", school_id);

  return NextResponse.json({
    ok: true,
    line_deleted: lineDeleted,
    removed_amount: beforeAmount,
    credit_amount: creditAmount,
    gross_amount: grossAfter,
    net_amount: netAfter,
    status: statusAfter,
  });
}
