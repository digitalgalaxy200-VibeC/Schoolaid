import { NextResponse } from "next/server";
import { verifySchoolAdmin } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";
import { round2 } from "@/lib/finance/billing";

// Phase 3 — bill detail: header + lines + waivers + payment totals

export async function GET(request: Request, { params }: { params: Promise<{ billId: string }> }) {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized || !school_id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { billId } = await params;
  const supabase = getServiceClient();

  const { data: bill, error } = await supabase
    .from("student_bills")
    .select("*, students(first_name, last_name, class_id), classes(id, name), academic_terms(id, name)")
    .eq("id", billId)
    .eq("school_id", school_id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!bill) return NextResponse.json({ error: "Bill not found" }, { status: 404 });

  const { data: lines } = await supabase
    .from("student_bill_lines")
    .select("*, fee_heads(id, name)")
    .eq("bill_id", billId)
    .order("created_at");

  const { data: waivers } = await supabase
    .from("student_waivers")
    .select("*")
    .eq("school_id", school_id)
    .eq("student_id", bill.student_id)
    .eq("term_id", bill.term_id)
    .order("created_at", { ascending: false });

  // Allocations for this bill's lines (posted + non-converted only)
  const lineIds = (lines || []).map((l: { id: string }) => l.id);
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
    paid = round2(paid);
  }

  // Explicitly applied credits on this bill
  const { data: appliedRows } = await supabase.from("credit_applications").select("amount").eq("school_id", school_id).eq("bill_id", billId);
  const appliedCredit = round2((appliedRows || []).reduce((s: number, a: { amount: number }) => s + Number(a.amount), 0));

  const rawStudent = bill.students as { first_name: string | null; last_name: string | null } | { first_name: string | null; last_name: string | null }[] | null;
  const student = Array.isArray(rawStudent) ? rawStudent[0] : rawStudent;
  const rawClass = bill.classes as { id: string; name: string } | { id: string; name: string }[] | null;
  const cls = Array.isArray(rawClass) ? rawClass[0] : rawClass;
  const rawTerm = bill.academic_terms as { id: string; name: string } | { id: string; name: string }[] | null;
  const term = Array.isArray(rawTerm) ? rawTerm[0] : rawTerm;

  const outstanding = round2(Math.max(0, Number(bill.net_amount) - paid - appliedCredit));

  type LineRow = {
    id: string;
    fee_head_id: string;
    amount: number;
    waived_amount: number;
    is_compulsory: boolean;
    term_fee_id: string | null;
    class_fee_id: string | null;
    fee_heads: { id: string; name: string } | { id: string; name: string }[] | null;
  };
  type WaiverRow = {
    id: string;
    amount: number;
    waiver_type: string | null;
    fee_head_id: string | null;
    reason: string | null;
    created_at: string;
  };

  return NextResponse.json({
    id: bill.id,
    student: {
      id: bill.student_id,
      name: `${student?.first_name || ""} ${student?.last_name || ""}`.trim() || "Unknown",
    },
    class: cls ? { id: cls.id, name: cls.name } : null,
    term: term ? { id: term.id, name: term.name } : null,
    gross_amount: bill.gross_amount,
    waiver_amount: bill.waiver_amount,
    net_amount: bill.net_amount,
    paid,
    applied_credit: appliedCredit,
    outstanding,
    status: bill.status,
    generated_at: bill.created_at,
    lines: ((lines || []) as LineRow[]).map((l) => {
      const rawFh = l.fee_heads as { id: string; name: string } | { id: string; name: string }[] | null;
      const fh = Array.isArray(rawFh) ? rawFh[0] : rawFh;
      return {
        id: l.id,
        fee_head_id: l.fee_head_id,
        fee_name: fh?.name || "Fee",
        amount: l.amount,
        waived_amount: l.waived_amount,
        net_amount: round2(Number(l.amount) - Number(l.waived_amount)),
        is_compulsory: l.is_compulsory,
        term_fee_id: l.term_fee_id,
        class_fee_id: l.class_fee_id,
      };
    }),
    waivers: ((waivers || []) as WaiverRow[]).map((w) => ({
      id: w.id,
      amount: w.amount,
      waiver_type: w.waiver_type || "fixed",
      fee_head_id: w.fee_head_id,
      reason: w.reason,
      created_at: w.created_at,
    })),
  });
}
