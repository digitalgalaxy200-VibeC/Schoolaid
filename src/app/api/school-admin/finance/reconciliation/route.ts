import { NextResponse } from "next/server";
import { verifySchoolAdmin } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";
import { round2, isPostedPayment } from "@/lib/finance/reports";

// Phase 5 — reconciliation: flag suspicious/incomplete states for investigation.
// Nothing is silently corrected — the admin investigates.

type AllocRow = { id: string; amount: number; payment_id: string; bill_line_id: string; converted_to_credit: boolean | null; payments: { status: string; reference: string | null } | { status: string; reference: string | null }[] | null };
type LineRow = { id: string; amount: number; waived_amount: number; fee_head_id: string };
type PaymentRow = { id: string; amount: number; status: string; reference: string | null; receipt_number: string | null };

export async function GET() {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized || !school_id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getServiceClient();

  const { data: payments } = await supabase
    .from("payments")
    .select("id, amount, status, reference, receipt_number")
    .eq("school_id", school_id);
  const { data: allocs } = await supabase
    .from("fee_allocations")
    .select("id, amount, payment_id, bill_line_id, converted_to_credit, payments(status, reference)")
    .eq("school_id", school_id);
  const { data: lines } = await supabase
    .from("student_bill_lines")
    .select("id, amount, waived_amount, fee_head_id")
    .eq("school_id", school_id);
  const { data: receipts } = await supabase
    .from("receipts")
    .select("payment_id")
    .eq("school_id", school_id);

  const paymentRows = (payments || []) as PaymentRow[];
  const allocRows = (allocs || []) as AllocRow[];
  const lineRows = (lines || []) as LineRow[];
  const receiptPaymentIds = new Set((receipts || []).map((r: { payment_id: string }) => r.payment_id));

  const paymentMap = new Map(paymentRows.map((p) => [p.id, p]));

  const unallocated: { payment_id: string; amount: number; allocated: number; difference: number }[] = [];
  const overAllocatedPayments: { payment_id: string; amount: number; allocated: number }[] = [];
  const overAllocatedLines: { bill_line_id: string; amount: number; allocated: number }[] = [];
  const missingReceipts: { payment_id: string; amount: number }[] = [];
  const duplicateRefs: { reference: string; amount: number; count: number; payment_ids: string[] }[] = [];

  const allocatedByPayment = new Map<string, number>();
  const allocatedByLine = new Map<string, number>();
  const refGroups = new Map<string, { amount: number; ids: string[] }>();
  let convertedCount = 0;
  let convertedAmount = 0;

  for (const a of allocRows) {
    const payment = paymentMap.get(a.payment_id);
    if (payment && isPostedPayment(a.payments)) {
      // Payment-level allocation includes converted rows (the money WAS
      // allocated to this payment; its excess later became credit).
      allocatedByPayment.set(a.payment_id, (allocatedByPayment.get(a.payment_id) || 0) + Number(a.amount));
    }
    if (a.converted_to_credit === true) {
      // Credit-born rows no longer count as payment against the bill line.
      convertedCount += 1;
      convertedAmount += Number(a.amount);
      continue;
    }
    allocatedByLine.set(a.bill_line_id, (allocatedByLine.get(a.bill_line_id) || 0) + Number(a.amount));
  }

  for (const p of paymentRows) {
    if (p.status !== "active") continue;
    const allocated = round2(allocatedByPayment.get(p.id) || 0);
    const amount = round2(Number(p.amount));
    if (allocated < amount) {
      unallocated.push({ payment_id: p.id, amount, allocated, difference: round2(amount - allocated) });
    } else if (allocated > amount) {
      overAllocatedPayments.push({ payment_id: p.id, amount, allocated });
    }
    if (!receiptPaymentIds.has(p.id)) {
      missingReceipts.push({ payment_id: p.id, amount });
    }
    if (p.reference && p.reference !== "Manual Entry") {
      const key = `${p.reference}::${p.amount}`;
      const g = refGroups.get(key) || { amount: Number(p.amount), ids: [] };
      g.ids.push(p.id);
      refGroups.set(key, g);
    }
  }

  for (const [key, g] of refGroups) {
    if (g.ids.length > 1) {
      duplicateRefs.push({ reference: key.split("::")[0], amount: g.amount, count: g.ids.length, payment_ids: g.ids });
    }
  }

  for (const l of lineRows) {
    const allocated = round2(allocatedByLine.get(l.id) || 0);
    const payable = round2(Number(l.amount) - Number(l.waived_amount));
    if (allocated > payable) {
      overAllocatedLines.push({ bill_line_id: l.id, amount: payable, allocated });
    }
  }

  return NextResponse.json({
    unallocated_payments: unallocated,
    over_allocated_payments: overAllocatedPayments,
    over_allocated_lines: overAllocatedLines,
    payments_without_receipts: missingReceipts,
    duplicate_references: duplicateRefs,
    converted_allocations: {
      count: convertedCount,
      amount: round2(convertedAmount),
      note: "Allocations whose excess was converted to student credit (expected outcome of a fee reduction after payment)",
    },
    totals: {
      posted_payments: paymentRows.filter((p) => p.status === "active").length,
      posted_allocations: allocRows.filter((a) => isPostedPayment(a.payments)).length,
      issues: unallocated.length + overAllocatedPayments.length + overAllocatedLines.length + missingReceipts.length + duplicateRefs.length,
    },
  });
}
