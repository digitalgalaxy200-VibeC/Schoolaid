import { NextResponse } from "next/server";
import { verifySchoolAdmin } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";
import { round2 } from "@/lib/finance/billing";

// Phase 3 — payment plans (config only; allocation is Phase 4)
// POST body:
//   { bill_id, installments: [{ amount, due_date }] }   — explicit instalments
//   { bill_id, installment_count, due_dates? }           — auto-split evenly
// Total must be > 0 and ≤ bill.net_amount (partial plans allowed).

export async function GET(request: Request) {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized || !school_id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const studentId = searchParams.get("student_id");
  const billId = searchParams.get("bill_id");

  const supabase = getServiceClient();
  let query = supabase
    .from("payment_plans")
    .select("*, students(first_name, last_name), payment_plan_installments(*)")
    .eq("school_id", school_id);

  if (studentId) query = query.eq("student_id", studentId);
  if (billId) query = query.eq("bill_id", billId);

  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  type InstallmentRow = {
    id: string;
    installment_number: number;
    amount: number;
    due_date: string;
    is_paid: boolean;
    paid_date: string | null;
  };
  type PlanRow = {
    id: string;
    student_id: string;
    bill_id: string | null;
    term_id: string | null;
    total_amount: number;
    installment_count: number;
    status: string;
    created_at: string;
    students: { first_name: string | null; last_name: string | null } | { first_name: string | null; last_name: string | null }[] | null;
    payment_plan_installments: InstallmentRow[] | null;
  };

  const result = ((data || []) as PlanRow[]).map((p) => {
    const rawStudent = p.students as { first_name: string | null; last_name: string | null } | { first_name: string | null; last_name: string | null }[] | null;
    const student = Array.isArray(rawStudent) ? rawStudent[0] : rawStudent;
    const today = new Date().toISOString().slice(0, 10);
    const installments = (p.payment_plan_installments || [])
      .slice()
      .sort((a, b) => a.installment_number - b.installment_number)
      .map((i) => ({
        id: i.id,
        installment_number: i.installment_number,
        amount: i.amount,
        due_date: i.due_date,
        is_paid: i.is_paid,
        paid_date: i.paid_date,
        status: i.is_paid ? "paid" : i.due_date < today ? "overdue" : "pending",
      }));
    const paid = installments.filter((i) => i.is_paid).reduce((s: number, i) => s + Number(i.amount), 0);
    return {
      id: p.id,
      student_id: p.student_id,
      student_name: student ? `${student.first_name || ""} ${student.last_name || ""}`.trim() : "Unknown",
      bill_id: p.bill_id,
      term_id: p.term_id,
      total_amount: p.total_amount,
      installment_count: p.installment_count,
      status: p.status,
      paid_amount: round2(paid),
      remaining: round2(Math.max(0, Number(p.total_amount) - paid)),
      installments,
      created_at: p.created_at,
    };
  });

  return NextResponse.json(result);
}

export async function POST(request: Request) {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized || !school_id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { bill_id, installments, installment_count, due_dates } = body;
  if (!bill_id) return NextResponse.json({ error: "bill_id is required" }, { status: 400 });

  const supabase = getServiceClient();

  const { data: bill, error: billErr } = await supabase
    .from("student_bills")
    .select("id, student_id, term_id, net_amount")
    .eq("id", bill_id)
    .eq("school_id", school_id)
    .maybeSingle();
  if (billErr) return NextResponse.json({ error: billErr.message }, { status: 500 });
  if (!bill) return NextResponse.json({ error: "bill_id does not belong to this school" }, { status: 400 });

  const netAmount = Number(bill.net_amount);

  let rows: { amount: number; due_date: string }[];
  if (Array.isArray(installments) && installments.length > 0) {
    rows = (installments as { amount: number; due_date: string }[]).map((i) => {
      const amt = round2(Number(i.amount));
      if (!Number.isFinite(amt) || amt <= 0) {
        throw new Error("installment amount must be a positive number");
      }
      if (!i.due_date) throw new Error("installment due_date is required");
      return { amount: amt, due_date: String(i.due_date).slice(0, 10) };
    });
  } else {
    const count = Number(installment_count);
    if (!Number.isInteger(count) || count < 1 || count > 24) {
      return NextResponse.json({ error: "installment_count must be an integer between 1 and 24" }, { status: 400 });
    }
    const base = round2(Math.floor((netAmount / count) * 100) / 100);
    rows = Array.from({ length: count }, (_, idx) => {
      const amount = idx === count - 1 ? round2(netAmount - base * (count - 1)) : base;
      const due = due_dates?.[idx] ? String(due_dates[idx]).slice(0, 10) : new Date(Date.now() + (idx + 1) * 30 * 86400000).toISOString().slice(0, 10);
      return { amount, due_date: due };
    });
  }

  let total = 0;
  for (const r of rows) {
    total = round2(total + r.amount);
    if (r.amount <= 0) return NextResponse.json({ error: "installment amounts must be positive" }, { status: 400 });
  }
  if (total <= 0) return NextResponse.json({ error: "plan total must be positive" }, { status: 400 });
  if (total > netAmount) {
    return NextResponse.json({ error: `Plan total (${total}) exceeds bill amount (${netAmount})` }, { status: 400 });
  }

  const { data: plan, error: planErr } = await supabase
    .from("payment_plans")
    .insert({
      school_id,
      student_id: bill.student_id,
      bill_id: bill.id,
      term_id: bill.term_id,
      total_amount: total,
      installment_count: rows.length,
      status: "active",
    })
    .select()
    .single();
  if (planErr) return NextResponse.json({ error: planErr.message }, { status: 500 });

  const { error: insErr } = await supabase.from("payment_plan_installments").insert(
    rows.map((r, idx) => ({
      school_id,
      plan_id: plan.id,
      installment_number: idx + 1,
      amount: r.amount,
      due_date: r.due_date,
      is_paid: false,
    })),
  );
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

  const { data: withInstallments } = await supabase
    .from("payment_plans")
    .select("*, payment_plan_installments(*)")
    .eq("id", plan.id)
    .single();

  return NextResponse.json(withInstallments, { status: 201 });
}
