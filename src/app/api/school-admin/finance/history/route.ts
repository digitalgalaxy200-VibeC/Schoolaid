import { NextResponse } from "next/server";
import { verifySchoolAdmin } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";
import { loadHistory } from "@/lib/finance/history";

// Phase 4 — financial history feed
//   GET /finance/history?kind=&student_id=&term_id=&limit=
// Read-only audit view over the dedicated financial records (payments, voids,
// waivers, adjustments, credits, applications, recalc runs, fee changes).

const KINDS = new Set(["fee_change", "payment", "void", "adjustment", "waiver", "credit", "credit_applied", "recalc"]);

export async function GET(request: Request) {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized || !school_id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const kind = searchParams.get("kind") || undefined;
  const studentId = searchParams.get("student_id") || undefined;
  const termId = searchParams.get("term_id") || undefined;
  const rawLimit = Number(searchParams.get("limit") || 150);

  if (kind && !KINDS.has(kind)) return NextResponse.json({ error: `Unknown kind: ${kind}` }, { status: 400 });

  const supabase = getServiceClient();
  const events = await loadHistory(supabase, school_id, {
    kind,
    student_id: studentId,
    term_id: termId,
    limit: Number.isFinite(rawLimit) ? Math.min(500, Math.max(1, rawLimit)) : 150,
  });

  return NextResponse.json(events);
}
