import { NextResponse } from "next/server";
import { verifySchoolAdmin } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";
import { loadStaffReportCard } from "@/lib/students/staff-report-card";
import { ValidationErrors, uuid } from "@/lib/validate";

/**
 * GET /api/school-admin/students/{id}/report-card/{termId}
 *
 * The final report-card record for one student and term, used by the Academic
 * Records action to render a PDF. Read-only, school-scoped, and built from the
 * frozen `term_results` snapshot — never live scores.
 */

type Params = { params: Promise<{ id: string; termId: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized || !school_id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, termId } = await params;
  const errors = new ValidationErrors();
  const studentId = uuid({ id }, "id", errors);
  const term = uuid({ termId }, "termId", errors);
  if (!studentId || !term) {
    return NextResponse.json(
      { error: "a valid student id and term id are required" },
      { status: 400 },
    );
  }

  const result = await loadStaffReportCard(getServiceClient(), {
    school_id,
    student_id: studentId,
    term_id: term,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result.data);
}
