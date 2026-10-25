import { NextResponse } from "next/server";
import { verifyTeacher } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";
import { getTeacherClassAccess } from "@/lib/students/teacher-class-access";
import { loadStaffReportCard } from "@/lib/students/staff-report-card";
import { ValidationErrors, uuid } from "@/lib/validate";

/**
 * GET /api/teacher/students/{id}/report-card/{termId}
 *
 * The final report-card record for a student the caller teaches, used by the
 * Academic Records action to render a PDF. Authorisation mirrors the roster:
 * the student must be in a class the teacher is assigned to, or the session
 * must be an `all_classes` impersonation.
 */

type Params = { params: Promise<{ id: string; termId: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { authorized, school_id, userId, all_classes } = await verifyTeacher();
  if (!authorized || !school_id || !userId) {
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

  const supabase = getServiceClient();
  const { data: student } = await supabase
    .from("students")
    .select("class_id")
    .eq("id", studentId)
    .eq("school_id", school_id)
    .maybeSingle();
  if (!student) {
    return NextResponse.json({ error: "Student not found in this school" }, { status: 404 });
  }

  if (!all_classes) {
    const access = await getTeacherClassAccess(supabase, {
      school_id,
      user_id: userId,
      class_id: student.class_id,
    });
    if (!access.assigned) {
      return NextResponse.json(
        { error: "You are not assigned to this student's class" },
        { status: 403 },
      );
    }
  }

  const result = await loadStaffReportCard(supabase, {
    school_id,
    student_id: studentId,
    term_id: term,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result.data);
}
