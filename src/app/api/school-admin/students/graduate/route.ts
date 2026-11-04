import { NextResponse } from "next/server";
import { verifySchoolAdmin } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";
import { getActiveTerm } from "@/lib/report-card";
import { graduateStudents } from "@/lib/promotion/service";

/**
 * POST /api/school-admin/students/graduate
 *
 * Body: { student_ids: string[], confirm: true, term_id?: string }
 *
 * Graduates one student or an explicit group. This is the same graduation path
 * the class-mapping promotion uses: the student record is kept, the current
 * class is cleared, `status` becomes `graduated`, and the graduation
 * year/class/date are recorded. The actor is recorded on the run
 * (`promotion_runs.created_by`) and in `audit_logs`.
 *
 * Authorization is SERVER-SIDE and school-scoped: a School Admin can only
 * graduate students in their own school. A Super Admin reaches this route
 * through impersonation, whose token carries the target school and the Super
 * Admin's own user id.
 */
export async function POST(request: Request) {
  const { authorized, school_id, userId } = await verifySchoolAdmin();
  if (!authorized || !school_id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as {
      student_ids?: unknown;
      confirm?: unknown;
      term_id?: unknown;
    };

    if (body.confirm !== true) {
      return NextResponse.json(
        { error: "Explicit confirmation is required before graduating students." },
        { status: 400 },
      );
    }

    const studentIds = Array.isArray(body.student_ids)
      ? body.student_ids.filter(
          (id): id is string => typeof id === "string" && id.length > 0,
        )
      : [];
    if (studentIds.length === 0) {
      return NextResponse.json(
        { error: "Select at least one student to graduate." },
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

    const summary = await graduateStudents(supabase, {
      schoolId: school_id,
      userId,
      studentIds,
      targetTermId,
    });

    return NextResponse.json(summary);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Graduation failed." },
      { status: 500 },
    );
  }
}
