import { NextResponse } from "next/server";
import { verifySchoolAdmin } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";
import { round2 } from "@/lib/finance/billing";

// Phase 3 — CREDIT LEDGER (read side)
//   GET /finance/credits?status=open|closed
// Remaining credit is DERIVED from applications (never stored), exactly like
// the apply route and the credits page expect. Previously this route did not
// exist, so the Credits page and the bill page's credit panel both 404'd.

export async function GET(request: Request) {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized || !school_id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getServiceClient();
  const status = new URL(request.url).searchParams.get("status");

  let query = supabase
    .from("credits")
    .select(
      "id, student_id, amount, reason, source, status, created_at, fee_heads(name), students(profiles(full_name))",
    )
    .eq("school_id", school_id)
    .order("created_at", { ascending: false });
  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const creditIds = (data || []).map((c: { id: string }) => c.id);
  const applications = creditIds.length
    ? (
        await supabase
          .from("credit_applications")
          .select("credit_id, amount")
          .eq("school_id", school_id)
          .in("credit_id", creditIds)
      ).data || []
    : [];

  const appliedByCredit = new Map<string, number>();
  for (const a of applications as { credit_id: string; amount: number }[]) {
    appliedByCredit.set(a.credit_id, round2((appliedByCredit.get(a.credit_id) || 0) + Number(a.amount)));
  }

  const rows = (data || []).map((c: any) => {
    const applied = appliedByCredit.get(c.id) || 0;
    const remaining = round2(Math.max(0, Number(c.amount) - applied));
    const profile = Array.isArray(c.students?.profiles) ? c.students.profiles[0] : c.students?.profiles;
    return {
      id: c.id,
      student_id: c.student_id,
      student_name: profile?.full_name || "Unknown Student",
      amount: Number(c.amount),
      applied_amount: applied,
      remaining,
      status: c.status,
      reason: c.reason,
      source: c.source,
      source_fee_name: c.fee_heads?.name || null,
      created_at: c.created_at,
    };
  });

  return NextResponse.json(rows);
}
