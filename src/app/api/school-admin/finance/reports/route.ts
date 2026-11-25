import { NextResponse } from "next/server";
import { verifySchoolAdmin } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";
import { chunkIds } from "@/lib/finance/chunk";
import { round2, deriveBillStatus, buildSectionSummaries, buildFeeBreakdown } from "@/lib/finance/reports";
import { loadAppliedByBill } from "@/lib/finance/credits";
import { computeArrears } from "@/lib/finance/arrears";

// Phase 5 — reports
//   GET /finance/reports?type=outstanding|classes|fees&term_id=&section_id=&class_id=&status=

type BillRow = { id: string; net_amount: number; gross_amount: number; waiver_amount: number; term_id: string; class_id: string | null; student_id: string; students: { first_name: string | null; last_name: string | null; parent_name: string | null; parent_phone: string | null } | { first_name: string | null; last_name: string | null; parent_name: string | null; parent_phone: string | null }[] | null; classes: { id: string; name: string } | { id: string; name: string }[] | null };
type LineRow = { id: string; bill_id: string; fee_head_id: string; amount: number; waived_amount: number; fee_heads: { id: string; name: string } | { id: string; name: string }[] | null };
type AllocRow = { amount: number; bill_line_id: string; converted_to_credit: boolean | null; payments: { status: string } | { status: string }[] | null };

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
    .select("id, net_amount, gross_amount, waiver_amount, term_id, class_id, student_id, students(first_name, last_name, parent_name, parent_phone), classes(id, name)")
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

  // Batched: these lists grow with the school — see src/lib/finance/chunk.ts.
  const billIds = billRows.map((b) => b.id);
  const lineRows: LineRow[] = [];
  for (const batch of chunkIds(billIds)) {
    const { data, error } = await supabase
      .from("student_bill_lines")
      .select("id, bill_id, fee_head_id, amount, waived_amount, fee_heads(id, name)")
      .in("bill_id", batch);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    lineRows.push(...((data || []) as LineRow[]));
  }

  const lineIds = lineRows.map((l) => l.id);
  const allocRows: AllocRow[] = [];
  for (const batch of chunkIds(lineIds)) {
    const { data, error } = await supabase
      .from("fee_allocations")
      .select("amount, bill_line_id, converted_to_credit, payments(status)")
      .eq("school_id", school_id)
      .in("bill_line_id", batch);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    allocRows.push(...((data || []) as AllocRow[]));
  }

  const paidByBill = new Map<string, number>();
  const paidByLine = new Map<string, number>();
  for (const a of allocRows) {
    if (a.converted_to_credit === true) continue;
    if (!isPosted(a.payments)) continue;
    const billId = lineRows.find((l) => l.id === a.bill_line_id)?.bill_id;
    paidByLine.set(a.bill_line_id, (paidByLine.get(a.bill_line_id) || 0) + Number(a.amount));
    if (billId) paidByBill.set(billId, (paidByBill.get(billId) || 0) + Number(a.amount));
  }

  const appliedByBill = await loadAppliedByBill(supabase, school_id);

  if (type === "classes") {
    const { classes: classSummaries } = buildSectionSummaries(
      billRows,
      paidByBill,
      (classes || []) as { id: string; name: string; section_id: string | null }[],
      (sections || []) as { id: string; name: string }[],
      appliedByBill,
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
      const applied = appliedByBill.get(b.id) || 0;
      const net = round2(Number(b.net_amount));
      const outstanding = round2(Math.max(0, net - paid - applied));
      const rawStudent = b.students as
        | { first_name: string | null; last_name: string | null; parent_name: string | null; parent_phone: string | null }
        | { first_name: string | null; last_name: string | null; parent_name: string | null; parent_phone: string | null }[]
        | null;
      const student = Array.isArray(rawStudent) ? rawStudent[0] : rawStudent;
      const rawClass = b.classes as { id: string; name: string } | { id: string; name: string }[] | null;
      const cls = Array.isArray(rawClass) ? rawClass[0] : rawClass;
      return {
        bill_id: b.id,
        student_id: b.student_id,
        student_name: student ? `${student.first_name || ""} ${student.last_name || ""}`.trim() : "Unknown",
        parent_name: student?.parent_name || null,
        parent_phone: student?.parent_phone || null,
        class_id: b.class_id,
        class_name: cls?.name || null,
        term_id: b.term_id,
        expected: net,
        paid: round2(paid),
        applied_credit: round2(applied),
        outstanding,
        status: deriveBillStatus(net, round2(paid + applied)),
      };
    })
    .filter((r) => r.outstanding > 0);

  const filtered = status ? result.filter((r) => r.status === status) : result;

  // Arrears: what each student still owes from terms before this one. Derived
  // from the bills that already exist — nothing is copied onto this term, so a
  // debt is never counted twice and an old void/waiver shows up immediately.
  const arrearsByStudent = await loadArrearsForStudents(
    supabase,
    school_id,
    termId,
    filtered.map((r) => r.student_id),
  );

  return NextResponse.json(
    filtered.map((r) => ({ ...r, arrears: arrearsByStudent.get(r.student_id) || 0 })),
  );
}

/**
 * Outstanding per student on bills from terms that started before `currentTermId`.
 *
 * Scoped to the students in the report, batched, and skipped entirely when the
 * report is not term-scoped. The arithmetic lives in `lib/finance/arrears`.
 */
async function loadArrearsForStudents(
  supabase: ReturnType<typeof getServiceClient>,
  school_id: string,
  currentTermId: string | null,
  studentIds: string[],
): Promise<Map<string, number>> {
  const none = new Map<string, number>();
  if (!currentTermId || studentIds.length === 0) return none;

  const { data: termRows } = await supabase
    .from("academic_terms")
    .select("id, name, start_date")
    .eq("school_id", school_id);
  const termStart = new Map((termRows || []).map((t: { id: string; start_date: string }) => [t.id, t.start_date]));
  const termName = new Map((termRows || []).map((t: { id: string; name: string }) => [t.id, t.name]));
  const currentStart = termStart.get(currentTermId);
  if (!currentStart) return none;

  const bills: { id: string; student_id: string; term_id: string; net_amount: number }[] = [];
  for (const batch of chunkIds(Array.from(new Set(studentIds)))) {
    const { data } = await supabase
      .from("student_bills")
      .select("id, student_id, term_id, net_amount")
      .eq("school_id", school_id)
      .in("student_id", batch);
    bills.push(...((data || []) as { id: string; student_id: string; term_id: string; net_amount: number }[]));
  }

  const prior = bills.filter((b) => {
    const start = termStart.get(b.term_id);
    return start !== undefined && start < currentStart;
  });
  if (prior.length === 0) return none;

  const billIds = prior.map((b) => b.id);
  const lines: { id: string; bill_id: string }[] = [];
  for (const batch of chunkIds(billIds)) {
    const { data } = await supabase
      .from("student_bill_lines")
      .select("id, bill_id")
      .eq("school_id", school_id)
      .in("bill_id", batch);
    lines.push(...((data || []) as { id: string; bill_id: string }[]));
  }
  const billByLine = new Map(lines.map((l) => [l.id, l.bill_id]));

  const paidByBill = new Map<string, number>();
  for (const batch of chunkIds(lines.map((l) => l.id))) {
    const { data } = await supabase
      .from("fee_allocations")
      .select("amount, bill_line_id, converted_to_credit, payments(status)")
      .eq("school_id", school_id)
      .in("bill_line_id", batch);
    for (const a of (data || []) as {
      amount: number;
      bill_line_id: string;
      converted_to_credit: boolean | null;
      payments: { status: string } | { status: string }[] | null;
    }[]) {
      if (a.converted_to_credit === true) continue;
      if (!isPosted(a.payments)) continue;
      const billId = billByLine.get(a.bill_line_id);
      if (billId) paidByBill.set(billId, round2((paidByBill.get(billId) || 0) + Number(a.amount)));
    }
  }

  const appliedByBill = new Map<string, number>();
  for (const batch of chunkIds(billIds)) {
    const { data } = await supabase
      .from("credit_applications")
      .select("bill_id, amount")
      .eq("school_id", school_id)
      .in("bill_id", batch);
    for (const a of (data || []) as { bill_id: string; amount: number }[]) {
      appliedByBill.set(a.bill_id, round2((appliedByBill.get(a.bill_id) || 0) + Number(a.amount)));
    }
  }

  return computeArrears({ bills: prior, currentTermId, termStart, termName, paidByBill, appliedByBill }).byStudent;
}
