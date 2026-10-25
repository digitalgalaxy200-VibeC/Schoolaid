import { NextResponse } from "next/server";
import { verifySchoolAdmin } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";
import { loadStudentAcademicRecords } from "@/lib/students/academic-records";
import { ValidationErrors, uuid } from "@/lib/validate";

/**
 * GET /api/school-admin/students/{id}/academic-records
 *
 * Read-only academic history for one student of this school. Admin access is
 * school-scoped: the student must belong to the session's school before any
 * result is read. Archived students are included on purpose — their history is
 * preserved by archiving and must stay reviewable.
 */

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized || !school_id) {
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
    console.error("[students] academic records error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not load academic records" },
      { status: 500 },
    );
  }
}
