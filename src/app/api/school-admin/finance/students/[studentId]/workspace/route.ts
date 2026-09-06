import { NextResponse } from "next/server";
import { verifySchoolAdmin } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";
import { round2 } from "@/lib/finance/billing";
import { listCredits } from "@/lib/finance/credits";
import { termStatus } from "@/lib/finance/workspace";

// Phase A — Student Finance Workspace (per session/term)
//   GET /finance/students/[studentId]/workspace?term_id=
// One payload for the whole screen: identity, summary, fee breakdown,
// optional fees available, payment accounts, term payment history.
// Every figure is derived from the canonical records.

type ObjJoin<T> = T | T[] | null;
const firstOf = <T,>(join: ObjJoin<T>): T | null => (Array.isArray(join) ? join[0] ?? null : join ?? null);

export async function GET(request: Request, { params }: { params: Promise<{ studentId: string }> }) {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized || !school_id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { studentId } = await params;
  const termId = new URL(request.url).searchParams.get("term_id");
  if (!termId) return NextResponse.json({ error: "term_id is required" }, { status: 400 });

  const supabase = getServiceClient();

  const [{ data: termRow }, { data: studentRow }] = await Promise.all([
    supabase
      .from("academic_terms")
      .select("id, name, academic_sessions(name)")
      .eq("id", termId)
      .eq("school_id", school_id)
      .maybeSingle(),
    supabase
      .from("students")
      .select("id, first_name, last_name, gender, parent_name, parent_phone, class_id, classes(id, name)")
      .eq("id", studentId)
      .eq("school_id", school_id)
      .maybeSingle(),
  ]);
  if (!termRow) return NextResponse.json({ error: "term_id does not belong to this school" }, { status: 400 });
  if (!studentRow) return NextResponse.json({ error: "Student not found in this school" }, { status: 404 });

  const sessionName = firstOf((termRow as { academic_sessions: { name: string } | { name: string }[] | null }).academic_sessions)?.name || null;
  const rawClass = (studentRow as { classes: { id: string; name: string } | { id: string; name: string }[] | null }).classes;
  const classRow = firstOf(rawClass);

  // ── Bill for this term ──
  const { data: bill } = await supabase
    .from("student_bills")
    .select("id, gross_amount, waiver_amount, net_amount, status, class_id")
    .eq("school_id", school_id)
    .eq("student_id", studentId)
    .eq("term_id", termId)
    .maybeSingle();

  const student = {
    id: (studentRow as { id: string }).id,
    name: [((studentRow as { first_name: string | null }).first_name || ""), ((studentRow as { last_name: string | null }).last_name || "")].filter(Boolean).join(" ") || "Unknown",
    gender: (studentRow as { gender: string | null }).gender,
    class_id: (studentRow as { class_id: string | null }).class_id,
    class_name: classRow?.name || null,
    parent_name: (studentRow as { parent_name: string | null }).parent_name,
    parent_phone: (studentRow as { parent_phone: string | null }).parent_phone,
  };

  const term = {
    id: (termRow as { id: string }).id,
    name: (termRow as { name: string }).name,
    session_name: sessionName,
  };

  // ── Active school payment accounts (for the payment form + receipts) ──
  const { data: accounts } = await supabase
    .from("school_bank_accounts")
    .select("*")
    .eq("school_id", school_id)
    .eq("is_active", true)
    .order("display_order")
    .order("bank_name");

  // ── Open credits (available to apply) ──
  const credits = await listCredits(supabase, school_id, { student_id: studentId });
  const availableCredit = round2(credits.filter((c) => c.status === "open").reduce((s, c) => s + c.remaining, 0));

  let fees: { fee_head_id: string; fee_name: string; amount: number; waived: number; paid: number; outstanding: number }[] = [];
  let expected = 0;
  let paid = 0;
  let appliedCredit = 0;
  let billId: string | null = bill ? (bill.id as string) : null;
  let billStatus: string | null = bill ? (bill.status as string) : null;
  let optionalFees: { id: string; name: string; amount: number }[] = [];
  let payments: {
    id: string;
    paid_at: string;
    amount: number;
    method: string | null;
    reference: string | null;
    paid_into: string | null;
    status: string;
    receipt_number: string | null;
    receipt_id: string | null;
    breakdown: { fee: string; amount: number }[];
  }[] = [];

  if (bill) {
    const [{ data: lines }, { data: appRows }, { data: payRows }] = await Promise.all([
      supabase
        .from("student_bill_lines")
        .select("id, fee_head_id, amount, waived_amount, fee_heads(id, name)")
        .eq("bill_id", bill.id),
      supabase.from("credit_applications").select("amount").eq("school_id", school_id).eq("bill_id", bill.id),
      supabase
        .from("payments")
        .select("id, paid_at, amount, method, reference, paid_into, status, receipts(id, receipt_number)")
        .eq("school_id", school_id)
        .eq("student_id", studentId)
        .eq("term_id", termId)
        .order("paid_at", { ascending: false }),
    ]);

    appliedCredit = round2((appRows || []).reduce((s: number, a: { amount: number }) => s + Number(a.amount), 0));

    const lineRows = (lines || []) as {
      id: string;
      fee_head_id: string;
      amount: number;
      waived_amount: number;
      fee_heads: { id: string; name: string } | { id: string; name: string }[] | null;
    }[];
    const lineIds = lineRows.map((l) => l.id);

    // Paid per line (posted + non-converted)
    const paidByLine = new Map<string, number>();
    const allocsByPayment = new Map<string, { lineId: string; amount: number }[]>();
    if (lineIds.length > 0) {
      const { data: allocs } = await supabase
        .from("fee_allocations")
        .select("amount, converted_to_credit, bill_line_id, payment_id, payments(status)")
        .eq("school_id", school_id)
        .in("bill_line_id", lineIds);
      for (const a of (allocs || []) as {
        amount: number;
        converted_to_credit: boolean | null;
        bill_line_id: string;
        payment_id: string;
        payments: { status: string } | { status: string }[] | null;
      }[]) {
        if (a.converted_to_credit === true) continue;
        const raw = a.payments as { status: string } | { status: string }[] | null;
        const st = Array.isArray(raw) ? raw[0]?.status : raw?.status;
        if (st !== "active") continue;
        paidByLine.set(a.bill_line_id, round2((paidByLine.get(a.bill_line_id) || 0) + Number(a.amount)));
        const list = allocsByPayment.get(a.payment_id) || [];
        list.push({ lineId: a.bill_line_id, amount: Number(a.amount) });
        allocsByPayment.set(a.payment_id, list);
      }
    }

    fees = lineRows.map((l) => {
      const fh = firstOf(l.fee_heads as ObjJoin<{ id: string; name: string }>);
      const linePaid = round2(paidByLine.get(l.id) || 0);
      const net = round2(Math.max(0, Number(l.amount) - Number(l.waived_amount)));
      return {
        fee_head_id: l.fee_head_id,
        fee_name: fh?.name || "Fee",
        amount: Number(l.amount),
        waived: Number(l.waived_amount),
        paid: linePaid,
        outstanding: round2(Math.max(0, net - linePaid)),
      };
    });

    expected = round2(Number(bill.net_amount));
    paid = round2(fees.reduce((s, f) => s + f.paid, 0));

    // Payment rows + per-payment fee breakdown
    const payRowsTyped = (payRows || []) as {
      id: string;
      paid_at: string;
      amount: number;
      method: string | null;
      reference: string | null;
      paid_into: string | null;
      status: string;
      receipts: { id: string; receipt_number: string } | { id: string; receipt_number: string }[] | null;
    }[];
    const lineName = new Map(lineRows.map((l) => [l.id, firstOf(l.fee_heads as ObjJoin<{ id: string; name: string }>)?.name || "Fee"]));
    payments = payRowsTyped.map((p) => {
      const receipt = firstOf(p.receipts as ObjJoin<{ id: string; receipt_number: string }>);
      const breakdown = (allocsByPayment.get(p.id) || [])
        .map((a) => ({ fee: lineName.get(a.lineId) || "Fee", amount: round2(a.amount) }))
        .filter((b) => b.amount > 0);
      return {
        id: p.id,
        paid_at: p.paid_at,
        amount: Number(p.amount),
        method: p.method,
        reference: p.reference,
        paid_into: p.paid_into,
        status: p.status,
        receipt_number: receipt?.receipt_number || null,
        receipt_id: receipt?.id || null,
        breakdown,
      };
    });

    // Optional fees not yet on this bill (from the term-aware config, optional only)
    const existingHeadIds = new Set(lineRows.map((l) => l.fee_head_id));
    const classAtBill = (bill as { class_id: string | null }).class_id ?? (studentRow as { class_id: string | null }).class_id;
    const { data: optTf } = await supabase
      .from("term_fees")
      .select("id, fee_head_id, default_amount, academic_section_id, fee_type, fee_heads(id, name, is_compulsory)")
      .eq("school_id", school_id)
      .or(`term_id.eq.${termId},term_id.is.null`);
    const tfList = (optTf || []) as {
      id: string;
      fee_head_id: string;
      default_amount: number;
      academic_section_id: string | null;
      fee_type: string;
      fee_heads: { id: string; name: string; is_compulsory: boolean } | { id: string; name: string; is_compulsory: boolean }[] | null;
    }[];
    // class override amounts for these term fees
    const { data: cfRows } = await supabase
      .from("class_fees")
      .select("term_fee_id, amount")
      .eq("school_id", school_id)
      .eq("class_id", classAtBill ?? "");
    const cfMap = new Map((cfRows || []).map((r: { term_fee_id: string; amount: number }) => [r.term_fee_id, Number(r.amount)]));

    const seen = new Map<string, { name: string; amount: number; is_optional: boolean }>();
    for (const tf of tfList) {
      const fh = firstOf(tf.fee_heads as ObjJoin<{ id: string; name: string; is_compulsory: boolean }>);
      if (!fh) continue;
      if (tf.fee_type !== "Not Required") continue; // optional only
      const amount = cfMap.has(tf.id) ? cfMap.get(tf.id)! : Number(tf.default_amount);
      if (amount <= 0) continue;
      const cur = seen.get(tf.fee_head_id);
      if (!cur || amount > cur.amount) seen.set(tf.fee_head_id, { name: fh.name, amount, is_optional: fh.is_compulsory === false });
    }
    optionalFees = Array.from(seen.entries())
      .filter(([id]) => !existingHeadIds.has(id))
      .map(([id, v]) => ({ id, name: v.name, amount: round2(v.amount) }));
  }

  const outstanding = round2(Math.max(0, expected - paid - appliedCredit));
  const statusLabel = termStatus(expected, paid, appliedCredit);

  return NextResponse.json({
    student,
    term,
    bill: bill
      ? {
          id: billId,
          status: billStatus,
          expected,
          paid,
          applied_credit: appliedCredit,
          outstanding,
        }
      : null,
    summary: { expected, paid, applied_credit: appliedCredit, outstanding, available_credit: availableCredit, status: statusLabel },
    fees,
    optional_fees: optionalFees,
    accounts: accounts || [],
    payments,
    credits: credits.filter((c) => c.status === "open"),
  });
}
