import { NextResponse } from "next/server";
import { verifySchoolAdmin } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";
import { round2 } from "@/lib/finance/billing";
import { renderInvoicePdf } from "@/lib/finance/invoice";

// Phase B — invoice PDF (what the student is expected to pay).
//   GET /finance/billing/[billId]/invoice
// Status is derived; nothing here mutates records.

const oneOf = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);

export async function GET(request: Request, { params }: { params: Promise<{ billId: string }> }) {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized || !school_id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { billId } = await params;
  const supabase = getServiceClient();

  const { data: bill } = await supabase
    .from("student_bills")
    .select("*, students(first_name, last_name, gender), classes(id, name), academic_terms(id, name, academic_sessions(name))")
    .eq("id", billId)
    .eq("school_id", school_id)
    .maybeSingle();
  if (!bill) return NextResponse.json({ error: "Bill not found" }, { status: 404 });

  const [{ data: school }, { data: lines }, { data: lineRows }] = await Promise.all([
    supabase.from("schools").select("name, address, phone, email, motto, currency").eq("id", school_id).maybeSingle(),
    supabase
      .from("student_bill_lines")
      .select("amount, waived_amount, fee_heads(id, name)")
      .eq("bill_id", billId)
      .order("created_at"),
    supabase.from("student_bill_lines").select("id").eq("bill_id", billId),
  ]);

  // Paid = posted, non-converted allocations
  const lineIds = (lineRows || []).map((l: { id: string }) => l.id);
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
  }
  const { data: appRows } = await supabase.from("credit_applications").select("amount").eq("school_id", school_id).eq("bill_id", billId);
  const applied = round2((appRows || []).reduce((s: number, a: { amount: number }) => s + Number(a.amount), 0));
  paid = round2(paid);

  const rawStudent = bill.students as { first_name: string | null; last_name: string | null } | { first_name: string | null; last_name: string | null }[] | null;
  const student = oneOf(rawStudent);
  const classRow = oneOf(bill.classes as { id: string; name: string } | { id: string; name: string }[] | null);
  const termRow = oneOf(bill.academic_terms as { id: string; name: string; academic_sessions: { name: string } | { name: string }[] | null } | { id: string; name: string; academic_sessions: { name: string } | { name: string }[] | null }[] | null);
  const session = oneOf(termRow?.academic_sessions ?? null);

  const net = round2(Number(bill.net_amount));
  const outstanding = round2(Math.max(0, net - paid - applied));
  const status = net <= 0 ? "PAID" : outstanding <= 0 ? "PAID" : paid > 0 || applied > 0 ? "PARTIALLY PAID" : "NOT PAID";

  const lineList = ((lines || []) as { amount: number; waived_amount: number; fee_heads: { id: string; name: string } | { id: string; name: string }[] | null }[])
    .filter((l) => Number(l.amount) > 0 || Number(l.waived_amount) > 0)
    .map((l) => {
      const fh = oneOf(l.fee_heads);
      return { fee: fh?.name || "Fee", amount: round2(Math.max(0, Number(l.amount) - Number(l.waived_amount))) };
    });

  const buffer = await renderInvoicePdf({
    school_name: (school as { name: string } | null)?.name || "School",
    school_motto: (school as { motto: string | null } | null)?.motto,
    school_address: (school as { address: string | null } | null)?.address,
    school_contacts: [((school as { phone: string | null } | null)?.phone || null), ((school as { email: string | null } | null)?.email || null)]
      .filter(Boolean)
      .join(" · ") || null,
    term_label: termRow ? `${termRow.name}${session ? ` · ${session.name} Session` : ""}` : null,
    student_name: student ? `${student.first_name || ""} ${student.last_name || ""}`.trim() : "Unknown",
    class_name: classRow?.name || null,
    lines: lineList,
    gross: round2(Number(bill.gross_amount)),
    waiver: round2(Number(bill.waiver_amount)),
    net,
    paid,
    applied_credit: applied,
    outstanding,
    status,
    currency: (school as { currency?: string | null } | null)?.currency || "NGN",
  });

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="invoice-${billId.slice(0, 8)}.pdf"`,
    },
  });
}
