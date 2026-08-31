import { NextResponse } from "next/server";
import { verifySchoolAdmin } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";
import { round2 } from "@/lib/finance/billing";

// Phase 3 — list student bills for the school (term/class/search filters)

type BillListRow = {
  id: string;
  student_id: string;
  class_id: string | null;
  term_id: string;
  gross_amount: number;
  waiver_amount: number;
  net_amount: number;
  status: string;
  created_at: string;
  students: { first_name: string | null; last_name: string | null } | { first_name: string | null; last_name: string | null }[] | null;
  classes: { id: string; name: string } | { id: string; name: string }[] | null;
};
type AllocRow = { amount: number; student_bill_lines: { bill_id: string } | { bill_id: string }[] | null };

export async function GET(request: Request) {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized || !school_id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const termId = searchParams.get("term_id");
  const classId = searchParams.get("class_id");
  const search = searchParams.get("search");

  const supabase = getServiceClient();

  let query = supabase
    .from("student_bills")
    .select("*, students(first_name, last_name), classes(id, name)")
    .eq("school_id", school_id);

  if (termId) query = query.eq("term_id", termId);
  if (classId) query = query.eq("class_id", classId);

  const { data: bills, error } = await query.order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Paid totals per bill from allocations (Phase 4 wiring; 0 today)
  const billIds = (bills || []).map((b: { id: string }) => b.id);
  const paidByBill = new Map<string, number>();
  if (billIds.length > 0) {
    const { data: lineRows } = await supabase
      .from("student_bill_lines")
      .select("id")
      .in("bill_id", billIds);
    const lineIds = (lineRows || []).map((l: { id: string }) => l.id);
    if (lineIds.length > 0) {
      const { data: allocs } = await supabase
        .from("fee_allocations")
        .select("amount, student_bill_lines(bill_id)")
        .eq("school_id", school_id)
        .in("bill_line_id", lineIds);
      for (const a of (allocs || []) as AllocRow[]) {
        const raw = a.student_bill_lines as { bill_id: string } | { bill_id: string }[] | null;
        const bid = Array.isArray(raw) ? raw[0]?.bill_id : raw?.bill_id;
        if (bid) paidByBill.set(bid, (paidByBill.get(bid) || 0) + Number(a.amount));
      }
    }
  }

  const result = ((bills || []) as BillListRow[]).map((b) => {
    const rawStudent = b.students as { first_name: string | null; last_name: string | null } | { first_name: string | null; last_name: string | null }[] | null;
    const student = Array.isArray(rawStudent) ? rawStudent[0] : rawStudent;
    const name = student ? `${student.first_name || ""} ${student.last_name || ""}`.trim() : "Unknown";
    const paid = round2(paidByBill.get(b.id) || 0);
    return {
      id: b.id,
      student_id: b.student_id,
      student_name: name,
      class_id: b.class_id,
      class_name: (Array.isArray(b.classes) ? b.classes[0] : b.classes)?.name || null,
      term_id: b.term_id,
      gross_amount: b.gross_amount,
      waiver_amount: b.waiver_amount,
      net_amount: b.net_amount,
      paid,
      outstanding: round2(Math.max(0, Number(b.net_amount) - paid)),
      status: b.status,
      created_at: b.created_at,
    };
  });

  const filtered = search
    ? result.filter((b) => (b.student_name || "").toLowerCase().includes(search.toLowerCase()))
    : result;

  return NextResponse.json(filtered);
}
