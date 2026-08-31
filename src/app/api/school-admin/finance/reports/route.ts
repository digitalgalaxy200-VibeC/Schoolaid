import { NextResponse } from "next/server";
import { verifySchoolAdmin } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";
import { round2, deriveBillStatus, buildSectionSummaries, buildFeeBreakdown } from "@/lib/finance/reports";

// Phase 5 — reports
//   GET /finance/reports?type=outstanding|classes|fees&term_id=&section_id=&class_id=&status=

type BillRow = { id: string; net_amount: number; gross_amount: number; waiver_amount: number; term_id: string; class_id: string | null; student_id: string; students: { first_name: string | null; last_name: string | null } | { first_name: string | null; last_name: string | null }[] | null; classes: { id: string; name: string } | { id: string; name: string }[] | null };
type LineRow = { id: string; bill_id: string; fee_head_id: string; amount: number; fee_heads: { id: string; name: string } | { id: string; name: string }[] | null };
type AllocRow = { amount: number; bill_line_id: string; payments: { status: string } | { status: string }[] | null };

const isPosted = (payments: { status: string } | { status: string }[] | null): boolean => {
  const st = Array.isArray(payments) ? payments[0]?.status : payments?.status;
  return st === "active";
};

export async function GET(request: Request) {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized || !school_id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") || "outstanding";
  const termId = searchParams.get("term_id");
  const sectionId = searchParams.get("section_id");
  const classId = searchParams.get("class_id");
  const status = searchParams.get("status");

  const supabase = getServiceClient();

  let billsQuery = supabase
    .from("student_bills")
    .select("id, net_amount, gross_amount, waiver_amount, term_id, class_id, student_id, students(first_name, last_name), classes(id, name)")
    .eq("school_id", school_id);
  if (termId) billsQuery = billsQuery.eq("term_id", termId);
  if (classId) billsQuery = billsQuery.eq("class_id", classId);

  const { data: bills } = await billsQuery.order("created_at", { ascending: false });
  const { data: classes } = await supabase.from("classes").select("id, name, section_id").eq("school_id", school_id);
  const { data: sections } = await supabase.from("academic_sections").select("id, name").eq("school_id", school_id);

  let billRows = (bills || []) as BillRow[];
  if (sectionId) {
    const classIdsInSection = new Set(
      ((classes || []) as { id: string; section_id: string | null }[]).filter((c) => c.section_id === sectionId).map((c) => c.id),
    );
    billRows = billRows.filter((b) => b.class_id && classIdsInSection.has(b.class_id));
  }

  const billIds = billRows.map((b) => b.id);
  const { data: lines } =
    billIds.length > 0
      ? await supabase
          .from("student_bill_lines")
          .select("id, bill_id, fee_head_id, amount, fee_heads(id, name)")
          .in("bill_id", billIds)
      : { data: [] };
  const lineRows = (lines || []) as LineRow[];

  const lineIds = lineRows.map((l) => l.id);
  const { data: allocs } =
    lineIds.length > 0
      ? await supabase
          .from("fee_allocations")
          .select("amount, bill_line_id, payments(status)")
          .eq("school_id", school_id)
          .in("bill_line_id", lineIds)
      : { data: [] };
  const allocRows = (allocs || []) as AllocRow[];

  const paidByBill = new Map<string, number>();
  const paidByLine = new Map<string, number>();
  for (const a of allocRows) {
    if (!isPosted(a.payments)) continue;
    const billId = lineRows.find((l) => l.id === a.bill_line_id)?.bill_id;
    paidByLine.set(a.bill_line_id, (paidByLine.get(a.bill_line_id) || 0) + Number(a.amount));
    if (billId) paidByBill.set(billId, (paidByBill.get(billId) || 0) + Number(a.amount));
  }

  if (type === "classes") {
    const { classes: classSummaries } = buildSectionSummaries(
      billRows,
      paidByBill,
      (classes || []) as { id: string; name: string; section_id: string | null }[],
      (sections || []) as { id: string; name: string }[],
    );
    return NextResponse.json(classSummaries);
  }

  if (type === "fees") {
    return NextResponse.json(buildFeeBreakdown(lineRows, paidByLine));
  }

  // type === "outstanding"
  const result = billRows
    .map((b) => {
      const paid = paidByBill.get(b.id) || 0;
      const net = round2(Number(b.net_amount));
      const outstanding = round2(Math.max(0, net - paid));
      const rawStudent = b.students as { first_name: string | null; last_name: string | null } | { first_name: string | null; last_name: string | null }[] | null;
      const student = Array.isArray(rawStudent) ? rawStudent[0] : rawStudent;
      const rawClass = b.classes as { id: string; name: string } | { id: string; name: string }[] | null;
      const cls = Array.isArray(rawClass) ? rawClass[0] : rawClass;
      return {
        bill_id: b.id,
        student_id: b.student_id,
        student_name: student ? `${student.first_name || ""} ${student.last_name || ""}`.trim() : "Unknown",
        class_id: b.class_id,
        class_name: cls?.name || null,
        term_id: b.term_id,
        expected: net,
        paid: round2(paid),
        outstanding,
        status: deriveBillStatus(net, paid),
      };
    })
    .filter((r) => r.outstanding > 0);

  const filtered = status ? result.filter((r) => r.status === status) : result;
  return NextResponse.json(filtered);
}
