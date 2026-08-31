import { NextResponse } from "next/server";
import { verifySchoolAdmin } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";
import { round2 } from "@/lib/finance/billing";
import { generateReceiptNumber } from "@/lib/finance/receipts";

// Phase 5 — record & list payments (migrated payments table + fee_allocations)
//
// POST body:
//   { student_id, amount, method?, reference?, notes?, bill_id?, term_id?,
//     allocations?: [{ bill_line_id, amount }] }
//   - No bill_id → uses the student's bill for term_id (or their latest bill)
//   - No allocations → auto-allocates across the bill's unpaid lines in order
//   - OVERPAYMENT IS REJECTED (documented decision: safer than credits for MVP)
//
// Method normalization happens HERE (application layer) — historical values
// ('Transfer', 'Cash') remain untouched.

const normalizeMethod = (raw: string): string => {
  const m = String(raw || "").trim().toLowerCase();
  if (m.includes("transfer")) return "Transfer";
  if (m === "cash") return "Cash";
  if (m.includes("pos")) return "POS";
  if (m.includes("cheque") || m.includes("check")) return "Cheque";
  if (m.includes("online")) return "Online";
  return "Other";
};

export async function GET(request: Request) {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized || !school_id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const studentId = searchParams.get("student_id");
  const termId = searchParams.get("term_id");
  const status = searchParams.get("status");
  const method = searchParams.get("method");
  const dateFrom = searchParams.get("date_from");
  const dateTo = searchParams.get("date_to");

  const supabase = getServiceClient();
  let query = supabase
    .from("payments")
    .select("*, students(first_name, last_name), receipts(id, receipt_number)")
    .eq("school_id", school_id);

  if (studentId) query = query.eq("student_id", studentId);
  if (termId) query = query.eq("term_id", termId);
  if (status) query = query.eq("status", status);
  if (method) query = query.eq("method", method);
  if (dateFrom) query = query.gte("paid_at", dateFrom);
  if (dateTo) query = query.lte("paid_at", dateTo);

  const { data, error } = await query.order("paid_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const result = (data || []).map((p: { id: string; student_id: string; amount: number; method: string | null; reference: string | null; receipt_number: string | null; paid_at: string; status: string; notes: string | null; created_at: string; students: { first_name: string | null; last_name: string | null } | { first_name: string | null; last_name: string | null }[] | null; receipts: { id: string; receipt_number: string } | { id: string; receipt_number: string }[] | null }) => {
    const rawStudent = p.students as { first_name: string | null; last_name: string | null } | { first_name: string | null; last_name: string | null }[] | null;
    const student = Array.isArray(rawStudent) ? rawStudent[0] : rawStudent;
    const rawReceipt = p.receipts as { id: string; receipt_number: string } | { id: string; receipt_number: string }[] | null;
    const receipt = Array.isArray(rawReceipt) ? rawReceipt[0] : rawReceipt;
    return {
      id: p.id,
      student_id: p.student_id,
      student_name: student ? `${student.first_name || ""} ${student.last_name || ""}`.trim() : "Unknown",
      amount: p.amount,
      method: p.method,
      reference: p.reference,
      receipt_number: p.receipt_number,
      receipt_id: receipt?.id || null,
      paid_at: p.paid_at,
      status: p.status,
      notes: p.notes,
      created_at: p.created_at,
    };
  });

  return NextResponse.json(result);
}

export async function POST(request: Request) {
  const { authorized, school_id, userId } = await verifySchoolAdmin();
  if (!authorized || !school_id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { student_id, amount, method, reference, notes, bill_id, term_id, allocations } = body;

  if (!student_id) return NextResponse.json({ error: "student_id is required" }, { status: 400 });
  const amt = round2(Number(amount));
  if (!Number.isFinite(amt) || amt <= 0) {
    return NextResponse.json({ error: "amount must be a positive number" }, { status: 400 });
  }

  const supabase = getServiceClient();

  // ── Tenant isolation: student must belong to this school ──
  const { data: student } = await supabase
    .from("students")
    .select("id, class_id")
    .eq("id", student_id)
    .eq("school_id", school_id)
    .maybeSingle();
  if (!student) return NextResponse.json({ error: "student_id does not belong to this school" }, { status: 400 });

  // ── Find the bill ──
  let billQuery = supabase
    .from("student_bills")
    .select("id, term_id, net_amount, status")
    .eq("school_id", school_id)
    .eq("student_id", student_id);
  if (bill_id) billQuery = billQuery.eq("id", bill_id);
  else if (term_id) billQuery = billQuery.eq("term_id", term_id);
  else billQuery = billQuery.order("created_at", { ascending: false });

  const { data: billRow } = await billQuery.limit(1).maybeSingle();
  if (!billRow) {
    return NextResponse.json({ error: "No bill found for this student — generate bills first" }, { status: 400 });
  }

  // ── Outstanding = net − posted allocations ──
  const { data: lineRows } = await supabase
    .from("student_bill_lines")
    .select("id")
    .eq("bill_id", billRow.id);
  const lineIds = (lineRows || []).map((l: { id: string }) => l.id);
  let paid = 0;
  if (lineIds.length > 0) {
    const { data: allocs } = await supabase
      .from("fee_allocations")
      .select("amount, payments(status)")
      .eq("school_id", school_id)
      .in("bill_line_id", lineIds);
    for (const a of (allocs || []) as { amount: number; payments: { status: string } | { status: string }[] | null }[]) {
      const raw = a.payments as { status: string } | { status: string }[] | null;
      const st = Array.isArray(raw) ? raw[0]?.status : raw?.status;
      if (st === "active") paid += Number(a.amount);
    }
    paid = round2(paid);
  }
  const net = round2(Number(billRow.net_amount));
  const outstanding = round2(Math.max(0, net - paid));

  // ── Overpayment guard (documented: reject for MVP) ──
  if (amt > outstanding) {
    return NextResponse.json({
      error: `Payment of ${amt} exceeds the outstanding balance of ${outstanding}`,
    }, { status: 400 });
  }

  // ── Allocations ──
  const allocRows: { bill_line_id: string; amount: number }[] = [];
  if (Array.isArray(allocations) && allocations.length > 0) {
    const lineIdSet = new Set(lineIds);
    let sum = 0;
    for (const a of allocations as { bill_line_id?: string; amount?: number }[]) {
      if (!a.bill_line_id || !lineIdSet.has(a.bill_line_id)) {
        return NextResponse.json({ error: "bill_line_id must belong to this bill" }, { status: 400 });
      }
      const v = round2(Number(a.amount));
      if (!Number.isFinite(v) || v <= 0) {
        return NextResponse.json({ error: "allocation amounts must be positive" }, { status: 400 });
      }
      sum = round2(sum + v);
      allocRows.push({ bill_line_id: a.bill_line_id, amount: v });
    }
    if (sum !== amt) {
      return NextResponse.json({ error: `Allocations (${sum}) must equal the payment amount (${amt})` }, { status: 400 });
    }
  } else {
    // Auto-allocate across unpaid lines in order
    const { data: lines } = await supabase
      .from("student_bill_lines")
      .select("id, amount, waived_amount")
      .eq("bill_id", billRow.id)
      .order("created_at");
    let remaining = amt;
    for (const l of (lines || []) as { id: string; amount: number; waived_amount: number }[]) {
      if (remaining <= 0) break;
      const lineNet = round2(Math.max(0, Number(l.amount) - Number(l.waived_amount)));
      if (lineNet <= 0) continue;
      const take = round2(Math.min(lineNet, remaining));
      allocRows.push({ bill_line_id: l.id, amount: take });
      remaining = round2(remaining - take);
    }
    if (remaining > 0) {
      return NextResponse.json({ error: "Payment could not be fully allocated — outstanding may have changed" }, { status: 409 });
    }
  }

  // ── Insert payment ──
  const receiptNumber = await generateReceiptNumber(supabase, school_id);
  const { data: payment, error: payErr } = await supabase
    .from("payments")
    .insert({
      school_id,
      student_id,
      term_id: billRow.term_id,
      amount: amt,
      method: normalizeMethod(method),
      reference: reference || null,
      receipt_number: receiptNumber,
      paid_at: new Date().toISOString(),
      recorded_by: userId,
      notes: notes || null,
      status: "active",
    })
    .select()
    .single();
  if (payErr) return NextResponse.json({ error: payErr.message }, { status: 500 });

  // ── Insert allocations ──
  const { error: allocErr } = await supabase.from("fee_allocations").insert(
    allocRows.map((r) => ({ school_id, payment_id: payment.id, bill_line_id: r.bill_line_id, amount: r.amount })),
  );
  if (allocErr) return NextResponse.json({ error: allocErr.message }, { status: 500 });

  // ── Create receipt record ──
  const { data: receipt } = await supabase
    .from("receipts")
    .insert({ payment_id: payment.id, school_id, receipt_number: receiptNumber, file_url: null })
    .select()
    .single();

  // ── Update bill status (derived, never a manually toggled source of truth) ──
  const newPaid = round2(paid + amt);
  const newStatus = newPaid >= net ? "paid" : "partial";
  await supabase.from("student_bills").update({ status: newStatus }).eq("id", billRow.id);

  return NextResponse.json({
    payment,
    receipt,
    allocations: allocRows,
    balance: {
      net_amount: net,
      paid: newPaid,
      outstanding: round2(Math.max(0, net - newPaid)),
      status: newStatus,
    },
  }, { status: 201 });
}
