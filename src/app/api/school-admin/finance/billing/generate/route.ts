import { NextResponse } from "next/server";
import { verifySchoolAdmin } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";
import { loadFeeConfig, resolveBillLines, round2 } from "@/lib/finance/billing";

// Phase 3 — bill generation with preview (dry_run).
// NEVER overwrites existing bills (immutable history).
//   body: { term_id, section_id?, class_id?, dry_run? }

type StudentRow = { id: string; class_id: string | null };

export async function POST(request: Request) {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized || !school_id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { term_id, section_id, class_id, dry_run } = body;

  if (!term_id) return NextResponse.json({ error: "term_id is required" }, { status: 400 });

  const supabase = getServiceClient();

  // ── Tenant isolation: term must belong to this school ──
  const { data: term } = await supabase
    .from("academic_terms")
    .select("id, name")
    .eq("id", term_id)
    .eq("school_id", school_id)
    .maybeSingle();
  if (!term) return NextResponse.json({ error: "term_id does not belong to this school" }, { status: 400 });

  // Target students (active, optional class/section filter)
  let studentsQuery = supabase
    .from("students")
    .select("id, class_id")
    .eq("school_id", school_id)
    .neq("is_active", false);
  if (class_id) studentsQuery = studentsQuery.eq("class_id", class_id);

  const { data: students } = await studentsQuery;
  if (!students || students.length === 0) {
    return NextResponse.json({ error: "No students found for this selection" }, { status: 404 });
  }

  // Section filter: restrict to students whose class belongs to the section
  let classIdsForSection: Set<string> | null = null;
  if (section_id && !class_id) {
    const { data: section } = await supabase
      .from("academic_sections")
      .select("id")
      .eq("id", section_id)
      .eq("school_id", school_id)
      .maybeSingle();
    if (!section) return NextResponse.json({ error: "section_id does not belong to this school" }, { status: 400 });
    const { data: classesInSection } = await supabase
      .from("classes")
      .select("id")
      .eq("school_id", school_id)
      .eq("section_id", section_id);
    classIdsForSection = new Set((classesInSection || []).map((c: { id: string }) => c.id));
  }

  const eligible = (students as StudentRow[]).filter(
    (s) => !classIdsForSection || (s.class_id && classIdsForSection.has(s.class_id)),
  );

  // Existing bills for this term — never duplicate
  const { data: existingBills } = await supabase
    .from("student_bills")
    .select("student_id")
    .eq("school_id", school_id)
    .eq("term_id", term_id);
  const existingSet = new Set((existingBills || []).map((b: { student_id: string }) => b.student_id));

  // Resolve bills in memory (single config load)
  const config = await loadFeeConfig(supabase, school_id);
  const toCreate: { student: StudentRow; bill: ReturnType<typeof resolveBillLines> }[] = [];
  const skippedExisting: string[] = [];
  const skippedNoFees: string[] = [];

  for (const s of eligible) {
    if (existingSet.has(s.id)) {
      skippedExisting.push(s.id);
      continue;
    }
    const bill = resolveBillLines(config, s, term_id);
    if (bill.lines.length === 0) {
      skippedNoFees.push(s.id);
    } else {
      toCreate.push({ student: s, bill });
    }
  }

  // Preview totals by fee head
  const byFee = new Map<string, { fee_name: string; count: number; total: number }>();
  for (const { bill } of toCreate) {
    for (const line of bill.lines) {
      const cur = byFee.get(line.fee_head_id) || { fee_name: line.fee_name, count: 0, total: 0 };
      cur.count += 1;
      cur.total += line.amount;
      byFee.set(line.fee_head_id, cur);
    }
  }
  const expectedTotal = toCreate.reduce((s, t) => s + t.bill.gross_amount, 0);

  if (dry_run) {
    return NextResponse.json({
      dry_run: true,
      term: term.name,
      students_total: eligible.length,
      students_with_bills: skippedExisting.length,
      students_missing: toCreate.length,
      students_no_fees: skippedNoFees.length,
      expected_by_fee: Array.from(byFee.values()).map((f) => ({
        fee: f.fee_name,
        students: f.count,
        total: round2(f.total),
      })),
      expected_total: round2(expectedTotal),
    });
  }

  // ── Generate (insert bills + lines) ──
  const created: string[] = [];
  for (const { student, bill } of toCreate) {
    const { data: billRow, error: billErr } = await supabase
      .from("student_bills")
      .insert({
        school_id,
        student_id: student.id,
        term_id,
        class_id: student.class_id,
        gross_amount: bill.gross_amount,
        waiver_amount: 0,
        net_amount: bill.gross_amount,
        status: "pending",
      })
      .select("id")
      .single();
    if (billErr) continue;
    const lines = bill.lines.map((l) => ({
      bill_id: billRow.id,
      school_id,
      fee_head_id: l.fee_head_id,
      term_fee_id: l.term_fee_id,
      class_fee_id: l.class_fee_id,
      description: l.description,
      amount: l.amount,
      waived_amount: 0,
      is_compulsory: l.is_compulsory,
    }));
    const { error: linesErr } = await supabase.from("student_bill_lines").insert(lines);
    if (linesErr) continue;
    created.push(billRow.id);
  }

  return NextResponse.json({
    dry_run: false,
    term: term.name,
    created: created.length,
    skipped_existing: skippedExisting.length,
    skipped_no_fees: skippedNoFees.length,
    expected_total: round2(expectedTotal),
  });
}
