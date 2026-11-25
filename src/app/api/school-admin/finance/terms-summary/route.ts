import { NextResponse } from "next/server";
import { verifySchoolAdmin } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";
import { round2 } from "@/lib/finance/billing";

/**
 * GET /api/school-admin/finance/terms-summary
 *
 * Which terms actually have money attached. The Collect screen uses this to
 * avoid landing on the term flagged active when that term has never had a bill —
 * a bursar opening a wall of zeros has to guess which term to switch to.
 *
 * This is a small aggregate over `student_bills` and active `payments`, not a
 * second copy of the finance engine: counts and gross collected are enough to
 * choose a sensible starting term.
 */
export async function GET() {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized || !school_id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getServiceClient();

  const [billsRes, paymentsRes] = await Promise.all([
    supabase.from("student_bills").select("term_id, net_amount").eq("school_id", school_id),
    supabase
      .from("payments")
      .select("term_id, amount")
      .eq("school_id", school_id)
      .eq("status", "active"),
  ]);

  if (billsRes.error) {
    return NextResponse.json({ error: billsRes.error.message }, { status: 500 });
  }
  if (paymentsRes.error) {
    return NextResponse.json({ error: paymentsRes.error.message }, { status: 500 });
  }

  const byTerm = new Map<
    string,
    { term_id: string; bills: number; expected: number; payments: number; collected: number }
  >();

  const entryFor = (termId: string) => {
    let entry = byTerm.get(termId);
    if (!entry) {
      entry = { term_id: termId, bills: 0, expected: 0, payments: 0, collected: 0 };
      byTerm.set(termId, entry);
    }
    return entry;
  };

  for (const bill of (billsRes.data || []) as { term_id: string | null; net_amount: number }[]) {
    if (!bill.term_id) continue;
    const entry = entryFor(bill.term_id);
    entry.bills += 1;
    entry.expected = round2(entry.expected + Number(bill.net_amount || 0));
  }

  for (const payment of (paymentsRes.data || []) as { term_id: string | null; amount: number }[]) {
    if (!payment.term_id) continue;
    const entry = entryFor(payment.term_id);
    entry.payments += 1;
    entry.collected = round2(entry.collected + Number(payment.amount || 0));
  }

  return NextResponse.json({ terms: Array.from(byTerm.values()) });
}
