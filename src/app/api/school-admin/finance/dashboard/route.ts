import { NextResponse } from "next/server";
import { verifySchoolAdmin } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";
import {
  round2,
  safeRate,
  deriveBillStatus,
  buildSectionSummaries,
  buildFeeBreakdown,
} from "@/lib/finance/reports";

// Phase 5 — Finance overview: Expected / Collected / Outstanding with
// section, class and fee-level drill-down. All figures derived from bills
// + POSTED allocations. Legacy payments (pre-billing) are reported
// separately as legacy_collected and never merged into bill-based figures.

type BillRow = { id: string; net_amount: number; gross_amount: number; waiver_amount: number; term_id: string; class_id: string | null; academic_section_id: string | null; student_id: string };
type LineRow = { id: string; bill_id: string; fee_head_id: string; amount: number; fee_heads: { id: string; name: string } | { id: string; name: string }[] | null };
type AllocRow = { amount: number; bill_line_id: string; converted_to_credit: boolean | null; payments: { status: string } | { status: string }[] | null };
type ClassRow = { id: string; name: string; section_id: string | null };
type SectionRow = { id: string; name: string };
type PaymentRow = { amount: number | null };

export async function GET(request: Request) {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized || !school_id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const termId = searchParams.get("term_id");
  const sectionId = searchParams.get("section_id");
  const classId = searchParams.get("class_id");

  const supabase = getServiceClient();

  let billsQuery = supabase
    .from("student_bills")
    .select("id, net_amount, gross_amount, waiver_amount, term_id, class_id, academic_section_id, student_id")
    .eq("school_id", school_id);
  if (termId) billsQuery = billsQuery.eq("term_id", termId);
  if (classId) billsQuery = billsQuery.eq("class_id", classId);

  const [{ data: bills, error: billErr }, { data: classes }, { data: sections }, { data: legacy, error: legacyErr }] =
    await Promise.all([
      billsQuery,
      supabase.from("classes").select("id, name, section_id").eq("school_id", school_id),
      supabase.from("academic_sections").select("id, name").eq("school_id", school_id),
      supabase.from("payments").select("amount").eq("school_id", school_id).eq("status", "active"),
    ]);

  if (billErr) return NextResponse.json({ error: billErr.message }, { status: 500 });
  if (legacyErr) return NextResponse.json({ error: legacyErr.message }, { status: 500 });

  const billRows = (bills || []) as BillRow[];

  // Section filter on bills via their class
  let billRowsFiltered = billRows;
  if (sectionId) {
    const classIdsInSection = new Set(
      ((classes || []) as ClassRow[]).filter((c) => c.section_id === sectionId).map((c) => c.id),
    );
    billRowsFiltered = billRowsFiltered.filter((b) => b.class_id && classIdsInSection.has(b.class_id));
  }

  // Lines for the filtered bills
  const billIds = billRowsFiltered.map((b) => b.id);
  const { data: lines } =
    billIds.length > 0
      ? await supabase
          .from("student_bill_lines")
          .select("id, bill_id, fee_head_id, amount, fee_heads(id, name)")
          .in("bill_id", billIds)
      : { data: [] };
  const lineRows = (lines || []) as LineRow[];

  // Posted allocations for those lines (converted-to-credit rows excluded)
  const lineIds = lineRows.map((l) => l.id);
  const { data: allocs } =
    lineIds.length > 0
      ? await supabase
          .from("fee_allocations")
          .select("amount, bill_line_id, converted_to_credit, payments(status)")
          .eq("school_id", school_id)
          .in("bill_line_id", lineIds)
      : { data: [] };
  const allocRows = (allocs || []) as AllocRow[];

  // Per-bill + per-line paid totals (posted only)
  const paidByBill = new Map<string, number>();
  const paidByLine = new Map<string, number>();
  for (const a of allocRows) {
    if (a.converted_to_credit === true) continue;
    if (!isPostedPayment(a.payments)) continue;
    const lineId = a.bill_line_id;
    const billId = lineRows.find((l) => l.id === lineId)?.bill_id;
    paidByLine.set(lineId, (paidByLine.get(lineId) || 0) + Number(a.amount));
    if (billId) paidByBill.set(billId, (paidByBill.get(billId) || 0) + Number(a.amount));
  }

  // Explicitly applied credits reduce outstanding (Collected stays = payments)
  const { data: creditApps } = await supabase.from("credit_applications").select("bill_id, amount").eq("school_id", school_id).not("bill_id", "is", null);
  const appliedByBill = new Map<string, number>();
  let appliedTotal = 0;
  for (const a of (creditApps || []) as { bill_id: string; amount: number }[]) {
    appliedByBill.set(a.bill_id, round2((appliedByBill.get(a.bill_id) || 0) + Number(a.amount)));
    appliedTotal = round2(appliedTotal + Number(a.amount));
  }

  const expected = round2(billRowsFiltered.reduce((s, b) => s + Number(b.net_amount), 0));
  const collected = round2(Array.from(paidByBill.values()).reduce((s, v) => s + v, 0));
  const outstanding = round2(Math.max(0, expected - collected - appliedTotal));

  // Student counts (derived statuses: payments + applied credits)
  const counts = { total: billRowsFiltered.length, paid: 0, partial: 0, unpaid: 0 };
  for (const b of billRowsFiltered) {
    const covered = round2((paidByBill.get(b.id) || 0) + (appliedByBill.get(b.id) || 0));
    counts[deriveBillStatus(Number(b.net_amount), covered)] += 1;
  }

  // Section / class drill-down
  const { sections: sectionSummaries, classes: classSummaries } = buildSectionSummaries(
    billRowsFiltered,
    paidByBill,
    (classes || []) as ClassRow[],
    (sections || []) as SectionRow[],
    appliedByBill,
  );

  // Fee-level breakdown
  const feeBreakdown = buildFeeBreakdown(lineRows, paidByLine);

  const legacyCollected = round2(((legacy || []) as PaymentRow[]).reduce((s, p) => s + (Number(p.amount) || 0), 0));

  return NextResponse.json({
    totalCharged: `₦${expected.toLocaleString()}`,
    totalCollected: `₦${collected.toLocaleString()}`,
    outstanding: `₦${outstanding.toLocaleString()}`,
    collectionRate: safeRate(expected, collected),
    expected,
    collected,
    outstandingAmount: outstanding,
    legacy_collected: `₦${legacyCollected.toLocaleString()}`,
    student_counts: counts,
    sections: sectionSummaries,
    classes: classSummaries,
    fee_breakdown: feeBreakdown,
  });
}

function isPostedPayment(payments: { status: string } | { status: string }[] | null): boolean {
  const st = Array.isArray(payments) ? payments[0]?.status : payments?.status;
  return st === "active";
}
