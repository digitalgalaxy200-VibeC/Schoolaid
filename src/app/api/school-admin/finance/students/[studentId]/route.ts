import { NextResponse } from "next/server";
import { verifySchoolAdmin } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";
import { round2 } from "@/lib/finance/billing";

// Phase 5 — student finance view: summary + bills + payment history

export async function GET(request: Request, { params }: { params: Promise<{ studentId: string }> }) {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized || !school_id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { studentId } = await params;
  const supabase = getServiceClient();

  const { data: student } = await supabase
    .from("students")
    .select("id, first_name, last_name, class_id, classes(id, name)")
    .eq("id", studentId)
    .eq("school_id", school_id)
    .maybeSingle();
  if (!student) return NextResponse.json({ error: "Student not found in this school" }, { status: 404 });

  const { data: bills } = await supabase
    .from("student_bills")
    .select("*, academic_terms(id, name)")
    .eq("school_id", school_id)
    .eq("student_id", studentId)
    .order("created_at", { ascending: false });

  // Paid per bill from posted allocations
  type BillRow = {
    id: string;
    gross_amount: number;
    waiver_amount: number;
    net_amount: number;
    status: string;
    term_id: string;
    academic_terms: { id: string; name: string } | { id: string; name: string }[] | null;
  };
  const billList: {
    id: string;
    term_id: string;
    term_name: string | null;
    gross_amount: number;
    waiver_amount: number;
    net_amount: number;
    paid: number;
    outstanding: number;
    status: string;
  }[] = [];
  let totalGross = 0;
  let totalWaiver = 0;
  let totalNet = 0;
  let totalPaid = 0;

  for (const b of (bills || []) as BillRow[]) {
    const { data: lines } = await supabase
      .from("student_bill_lines")
      .select("id")
      .eq("bill_id", b.id);
    const ids = (lines || []).map((l: { id: string }) => l.id);
    let paid = 0;
    if (ids.length > 0) {
      const { data: allocs } = await supabase
        .from("fee_allocations")
        .select("amount, payments(status)")
        .in("bill_line_id", ids);
      for (const a of (allocs || []) as { amount: number; payments: { status: string } | { status: string }[] | null }[]) {
        const raw = a.payments as { status: string } | { status: string }[] | null;
        const st = Array.isArray(raw) ? raw[0]?.status : raw?.status;
        if (st === "active") paid += Number(a.amount);
      }
    }
    paid = round2(paid);
    const net = round2(Number(b.net_amount));
    const rawTerm = b.academic_terms as { id: string; name: string } | { id: string; name: string }[] | null;
    const term = Array.isArray(rawTerm) ? rawTerm[0] : rawTerm;
    totalGross += Number(b.gross_amount);
    totalWaiver += Number(b.waiver_amount);
    totalNet += net;
    totalPaid += paid;
    billList.push({
      id: b.id,
      term_id: b.term_id,
      term_name: term?.name || null,
      gross_amount: b.gross_amount,
      waiver_amount: b.waiver_amount,
      net_amount: net,
      paid,
      outstanding: round2(Math.max(0, net - paid)),
      status: b.status,
    });
  }

  const { data: payments } = await supabase
    .from("payments")
    .select("*, receipts(id, receipt_number)")
    .eq("school_id", school_id)
    .eq("student_id", studentId)
    .order("paid_at", { ascending: false });

  const rawClass = student.classes as { id: string; name: string } | { id: string; name: string }[] | null;
  const cls = Array.isArray(rawClass) ? rawClass[0] : rawClass;

  return NextResponse.json({
    student: {
      id: student.id,
      name: `${student.first_name || ""} ${student.last_name || ""}`.trim() || "Unknown",
      class_id: student.class_id,
      class_name: cls?.name || null,
    },
    summary: {
      total_billed: round2(totalGross),
      total_discount: round2(totalWaiver),
      net_obligation: round2(totalNet),
      total_paid: round2(totalPaid),
      outstanding: round2(Math.max(0, totalNet - totalPaid)),
    },
    bills: billList,
    payment_history: ((payments || []) as {
      id: string;
      amount: number;
      method: string | null;
      reference: string | null;
      receipt_number: string | null;
      paid_at: string;
      status: string;
      notes: string | null;
      receipts: { id: string; receipt_number: string } | { id: string; receipt_number: string }[] | null;
    }[]).map((p) => {
      const rawReceipt = p.receipts as { id: string; receipt_number: string } | { id: string; receipt_number: string }[] | null;
      const receipt = Array.isArray(rawReceipt) ? rawReceipt[0] : rawReceipt;
      return {
        id: p.id,
        amount: p.amount,
        method: p.method,
        reference: p.reference,
        receipt_number: p.receipt_number,
        receipt_id: receipt?.id || null,
        paid_at: p.paid_at,
        status: p.status,
        notes: p.notes,
      };
    }),
  });
}
