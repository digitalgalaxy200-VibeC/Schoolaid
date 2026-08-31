import { NextResponse } from "next/server";
import { verifySchoolAdmin } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";

// Finance dashboard — migrated-schema aggregates:
//   expected    = SUM(student_bills.net_amount)
//   collected   = SUM(fee_allocations.amount)  (allocated payments only)
//   outstanding = expected − collected
// NOTE: legacy migrated payments (47 rows) predate allocations; they are
// counted separately as "legacy_collected" until reconciliation runs.

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

type BillRow = { net_amount: number | null };
type AllocRow = { amount: number | null };
type PaymentRow = { amount: number | null };
type SectionRow = { id: string };

export async function GET(request: Request) {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized || !school_id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const termId = searchParams.get("term_id");

  const supabase = getServiceClient();

  let billsQuery = supabase
    .from("student_bills")
    .select("net_amount")
    .eq("school_id", school_id);
  const allocQuery = supabase
    .from("fee_allocations")
    .select("amount")
    .eq("school_id", school_id);
  let legacyQuery = supabase
    .from("payments")
    .select("amount")
    .eq("school_id", school_id);

  if (termId) {
    billsQuery = billsQuery.eq("term_id", termId);
    const { data: sectionRows } = await supabase
      .from("academic_sections")
      .select("id")
      .eq("school_id", school_id)
      .eq("term_id", termId);
    const sectionIds = ((sectionRows || []) as SectionRow[]).map((s) => s.id);
    legacyQuery = legacyQuery.in("academic_section_id", sectionIds);
  }

  const [{ data: bills, error: billErr }, { data: allocations, error: allocErr }, { data: legacy, error: legacyErr }] =
    await Promise.all([billsQuery, allocQuery, legacyQuery]);

  if (billErr) return NextResponse.json({ error: billErr.message }, { status: 500 });
  if (allocErr) return NextResponse.json({ error: allocErr.message }, { status: 500 });
  if (legacyErr) return NextResponse.json({ error: legacyErr.message }, { status: 500 });

  const expected = ((bills || []) as BillRow[]).reduce((s, b) => s + (Number(b.net_amount) || 0), 0);
  const collected = ((allocations || []) as AllocRow[]).reduce((s, a) => s + (Number(a.amount) || 0), 0);
  const legacyCollected = ((legacy || []) as PaymentRow[]).reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const totalCollected = collected + legacyCollected;
  const outstanding = Math.max(0, round2(expected - collected));
  const collectionRate = expected > 0 ? Math.round((totalCollected / expected) * 100) : 0;

  return NextResponse.json({
    totalCharged: `₦${round2(expected).toLocaleString()}`,
    totalCollected: `₦${round2(totalCollected).toLocaleString()}`,
    outstanding: `₦${outstanding.toLocaleString()}`,
    collectionRate,
    legacyCollected: `₦${round2(legacyCollected).toLocaleString()}`,
  });
}
