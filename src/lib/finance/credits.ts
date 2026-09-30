// ============================================================================
// Finance — credit ledger service (Phase 3)
// Credits are real records with sources; remaining is ALWAYS derived from
// credit_applications, never stored. Application is explicit (no auto-moves).
// ============================================================================

import { round2 } from "./billing";

export type CreditLedgerRow = {
  id: string;
  student_id: string;
  student_name: string;
  term_id: string | null;
  amount: number;
  applied_amount: number;
  remaining: number;
  status: string;
  reason: string | null;
  source: string;
  source_fee_name: string | null;
  source_payment_id: string | null;
  created_at: string;
};

type Supabase = ReturnType<typeof import("@/lib/supabase/service").getServiceClient>;

export type CreditListOptions = {
  student_id?: string;
  status?: string; // open | closed
};

// List the school's credits with student names, applied totals and remaining.
export async function listCredits(supabase: Supabase, school_id: string, opts: CreditListOptions = {}): Promise<CreditLedgerRow[]> {
  let q = supabase
    .from("credits")
    .select(
      "id, student_id, term_id, amount, status, reason, source, source_payment_id, source_fee_head_id, created_at, students(first_name, last_name), fee_heads(id, name)",
    )
    .eq("school_id", school_id)
    .order("created_at", { ascending: false });
  if (opts.student_id) q = q.eq("student_id", opts.student_id);
  if (opts.status) q = q.eq("status", opts.status);

  const { data: credits } = await q;
  const rows = (credits || []) as {
    id: string;
    student_id: string;
    term_id: string | null;
    amount: number;
    status: string;
    reason: string | null;
    source: string;
    source_payment_id: string | null;
    source_fee_head_id: string | null;
    created_at: string;
    students: { first_name: string | null; last_name: string | null } | { first_name: string | null; last_name: string | null }[] | null;
    fee_heads: { id: string; name: string } | { id: string; name: string }[] | null;
  }[];

  const creditIds = rows.map((r) => r.id);
  const appliedByCredit = new Map<string, number>();
  if (creditIds.length > 0) {
    const { data: apps } = await supabase.from("credit_applications").select("credit_id, amount").eq("school_id", school_id).in("credit_id", creditIds);
    for (const a of (apps || []) as { credit_id: string; amount: number }[]) {
      appliedByCredit.set(a.credit_id, round2((appliedByCredit.get(a.credit_id) || 0) + Number(a.amount)));
    }
  }

  return rows.map((c) => {
    const s = Array.isArray(c.students) ? c.students[0] : c.students;
    const fh = Array.isArray(c.fee_heads) ? c.fee_heads[0] : c.fee_heads;
    const applied = round2(appliedByCredit.get(c.id) || 0);
    return {
      id: c.id,
      student_id: c.student_id,
      student_name: s ? `${s.first_name || ""} ${s.last_name || ""}`.trim() : "Unknown",
      term_id: c.term_id,
      amount: round2(Number(c.amount)),
      applied_amount: applied,
      remaining: round2(Math.max(0, Number(c.amount) - applied)),
      status: c.status,
      reason: c.reason,
      source: c.source,
      source_fee_name: fh?.name || null,
      source_payment_id: c.source_payment_id,
      created_at: c.created_at,
    };
  });
}

// Applied credit totals per bill (the bill-level reduction of outstanding).
export async function loadAppliedByBill(supabase: Supabase, school_id: string): Promise<Map<string, number>> {
  const { data: apps } = await supabase.from("credit_applications").select("bill_id, amount").eq("school_id", school_id).not("bill_id", "is", null);
  const map = new Map<string, number>();
  for (const a of (apps || []) as { bill_id: string; amount: number }[]) {
    map.set(a.bill_id, round2((map.get(a.bill_id) || 0) + Number(a.amount)));
  }
  return map;
}
