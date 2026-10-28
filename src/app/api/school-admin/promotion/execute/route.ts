import { NextResponse } from "next/server";
import { verifySchoolAdmin } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";
import { getActiveTerm } from "@/lib/report-card";
import { executePromotion } from "@/lib/promotion/service";

/**
 * POST /api/school-admin/promotion/execute
 *
 * Body: { confirm: true, term_id?: string }
 *
 * Executes the SAVED mappings. The administrator must have reviewed the
 * preview and explicitly confirmed. `term_id` is the target academic term for
 * the promotion; when omitted the school's active term is used. If no term is
 * configured, the run still executes but no enrolment history row is written.
 */
export async function POST(request: Request) {
  const { authorized, school_id, userId } = await verifySchoolAdmin();
  if (!authorized || !school_id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as {
      confirm?: unknown;
      term_id?: unknown;
    };

    if (body.confirm !== true) {
      return NextResponse.json(
        { error: "Explicit confirmation is required before executing a promotion." },
        { status: 400 },
      );
    }

    const supabase = getServiceClient();

    let targetTermId =
      typeof body.term_id === "string" && body.term_id ? body.term_id : null;

    if (!targetTermId) {
      const activeTerm = await getActiveTerm(school_id);
      targetTermId = activeTerm?.id ?? null;
    } else {
      // Tenant guard: a caller-supplied term must belong to this school.
      const { data: term } = await supabase
        .from("academic_terms")
        .select("id")
        .eq("id", targetTermId)
        .eq("school_id", school_id)
        .maybeSingle();
      if (!term) {
        return NextResponse.json(
          { error: "term_id does not belong to this school" },
          { status: 400 },
        );
      }
    }

    const summary = await executePromotion(supabase, {
      schoolId: school_id,
      userId,
      targetTermId,
    });

    return NextResponse.json(summary);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Promotion failed." },
      { status: 500 },
    );
  }
}
