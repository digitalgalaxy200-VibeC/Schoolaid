import { NextResponse } from "next/server";
import { verifySchoolAdmin } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";
import { round2 } from "@/lib/finance/billing";
import { renderReceiptPdf } from "@/lib/finance/receipts";

// Phase 5 — download a receipt as PDF

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized || !school_id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const supabase = getServiceClient();

  const { data: receipt, error: recErr } = await supabase
    .from("receipts")
    .select("*")
    .eq("id", id)
    .eq("school_id", school_id)
    .maybeSingle();
  if (recErr) return NextResponse.json({ error: recErr.message }, { status: 500 });
  if (!receipt) return NextResponse.json({ error: "Receipt not found" }, { status: 404 });

  const { data: payment } = await supabase
    .from("payments")
    .select("*, students(first_name, last_name), academic_terms(id, name)")
    .eq("id", receipt.payment_id)
    .eq("school_id", school_id)
    .maybeSingle();
  if (!payment) return NextResponse.json({ error: "Payment not found for this receipt" }, { status: 404 });

  const { data: school } = await supabase
    .from("schools")
    .select("name, address, contact_email, currency")
    .eq("id", school_id)
    .maybeSingle();

  // Student's bill for the payment's term (for balance-after computation)
  let balanceAfter: number | null = null;
  const { data: bill } = await supabase
    .from("student_bills")
    .select("id, net_amount")
    .eq("school_id", school_id)
    .eq("student_id", payment.student_id)
    .eq("term_id", payment.term_id)
    .maybeSingle();
  if (bill) {
    const { data: lines } = await supabase.from("student_bill_lines").select("id").eq("bill_id", bill.id);
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
    balanceAfter = round2(Math.max(0, Number(bill.net_amount) - paid));
  }

  const rawStudent = payment.students as { first_name: string | null; last_name: string | null } | { first_name: string | null; last_name: string | null }[] | null;
  const student = Array.isArray(rawStudent) ? rawStudent[0] : rawStudent;
  const rawTerm = payment.academic_terms as { id: string; name: string } | { id: string; name: string }[] | null;
  const term = Array.isArray(rawTerm) ? rawTerm[0] : rawTerm;
  const studentName = student ? `${student.first_name || ""} ${student.last_name || ""}`.trim() : "Unknown";

  const { data: cls } = await supabase
    .from("students")
    .select("class_id, classes(name)")
    .eq("id", payment.student_id)
    .maybeSingle();
  const rawCls = cls?.classes as { name: string } | { name: string }[] | null;
  const className = cls ? (Array.isArray(rawCls) ? rawCls[0]?.name : rawCls?.name) || null : null;

  const buffer = await renderReceiptPdf({
    school_name: school?.name || "School",
    school_address: school?.address || school?.contact_email || null,
    receipt_number: receipt.receipt_number,
    student_name: studentName,
    class_name: className,
    term_name: term?.name || null,
    amount: Number(payment.amount),
    method: payment.method || "—",
    reference: payment.reference,
    paid_at: payment.paid_at,
    balance_after: balanceAfter ?? 0,
    recorded_by: null,
    currency: school?.currency || "₦",
  });

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="receipt-${receipt.receipt_number}.pdf"`,
    },
  });
}
