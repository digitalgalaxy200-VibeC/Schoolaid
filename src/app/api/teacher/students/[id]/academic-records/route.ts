import { NextResponse } from "next/server";
import { verifyTeacher } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";
import { getTeacherClassAccess } from "@/lib/students/teacher-class-access";
import { loadStudentAcademicRecords } from "@/lib/students/academic-records";
import { ValidationErrors, uuid } from "@/lib/validate";

/**
 * GET /api/teacher/students/{id}/academic-records
 *
 * Read-only academic history for a student the caller teaches. Authorisation is
 * the same class-scope rule as the roster: the student must be in a class the
 * teacher is assigned to (form teacher or subject teacher), or the session must
 * be an `all_classes` impersonation. Archived students in that class remain
 * readable because archiving preserves their history.
 */

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { authorized, school_id, userId, all_classes } = await verifyTeacher();
  if (!authorized || !school_id || !userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const errors = new ValidationErrors();
  if (!uuid({ id }, "id", errors)) {
    return NextResponse.json({ error: "a valid student id is required" }, { status: 400 });
  }

  const supabase = getServiceClient();
  const { data: student } = await supabase
    .from("students")
    .select("id, student_id, class_id, profiles(full_name)")
    .eq("id", id)
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

  try {
    const terms = await loadStudentAcademicRecords(supabase, {
      school_id,
      student_id: id,
    });
    const profile = Array.isArray(student.profiles) ? student.profiles[0] : student.profiles;
    return NextResponse.json({
      student: {
        id: student.id,
        student_id: student.student_id,
        full_name: profile?.full_name ?? null,
      },
      terms,
    });
  } catch (err) {
    console.error("[teacher/students] academic records error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not load academic records" },
      { status: 500 },
    );
  }
}
