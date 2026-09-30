import { NextResponse } from "next/server";
import { verifySchoolAdmin } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";
import { todayLocal } from "@/lib/finance/dates";
import { round2 } from "@/lib/finance/billing";

// FIN-001 — Finance landing strip: what was collected TODAY (school-local).
// Grouping uses payments.paid_on (derived once at recording time in the
// Africa/Lagos calendar), never UTC paid_at, so 11:30pm collections land on
// the correct school day. Only valid (active) payments count.

type ObjJoin<T> = T | T[] | null;
const firstOf = <T,>(join: ObjJoin<T>): T | null => (Array.isArray(join) ? join[0] ?? null : join ?? null);

export async function GET(request: Request) {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized || !school_id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const termId = new URL(request.url).searchParams.get("term_id");
  const date = todayLocal();

  const supabase = getServiceClient();

  let query = supabase
    .from("payments")
    .select(
      "id, amount, method, sender_name, paid_at, receipt_number, status, students(first_name, last_name, classes(id, name))",
    )
    .eq("school_id", school_id)
    .eq("status", "active")
    .eq("paid_on", date);
  if (termId) query = query.eq("term_id", termId);
  query = query.order("paid_at", { ascending: false }).limit(100);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data || []) as {
    id: string;
    amount: number;
    method: string | null;
    sender_name: string | null;
    paid_at: string;
    receipt_number: string | null;
    students:
      | { first_name: string | null; last_name: string | null; classes: { name: string } | { name: string }[] | null }
      | { first_name: string | null; last_name: string | null; classes: { name: string } | { name: string }[] | null }[]
      | null;
  }[];

  let total = 0;
  const methodTotals = new Map<string, { total: number; count: number }>();
  for (const p of rows) {
    total = round2(total + Number(p.amount));
    const m = p.method || "Other";
    const cur = methodTotals.get(m) || { total: 0, count: 0 };
    methodTotals.set(m, { total: round2(cur.total + Number(p.amount)), count: cur.count + 1 });
  }

  const recent = rows.slice(0, 6).map((p) => {
    const student = firstOf(
      p.students as ObjJoin<{ first_name: string | null; last_name: string | null; classes: { name: string } | { name: string }[] | null }>,
    );
    const cls = student ? firstOf(student.classes as ObjJoin<{ name: string }>) : null;
    return {
      id: p.id,
      student_name: student ? `${student.first_name || ""} ${student.last_name || ""}`.trim() : "Unknown",
      class_name: cls?.name || null,
      amount: Number(p.amount),
      method: p.method,
      sender_name: p.sender_name,
      paid_at: p.paid_at,
      receipt_number: p.receipt_number,
    };
  });

  return NextResponse.json({
    date,
    total,
    count: rows.length,
    by_method: Array.from(methodTotals.entries()).map(([method, v]) => ({ method, ...v })),
    recent,
  });
}
