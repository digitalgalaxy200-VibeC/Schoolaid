import { NextResponse } from "next/server";
import { verifyTeacher } from "@/lib/school-auth";
import { getActiveTerm } from "@/lib/report-card";
import { getServiceClient } from "@/lib/supabase/service";
import { generateUniquePassword } from "@/lib/password";
import { setAuthUserPassword, authResetErrorMessage } from "@/lib/supabase/auth-users";
import { ValidationErrors, uuid } from "@/lib/validate";

/**
 * POST /api/teacher/students/{id}/reset-password — a teacher issues a new
 * temporary password for one of their own students.
 *
 * AUTHORIZATION mirrors the view and edit rules exactly (class teacher, or a
 * teacher assigned to that class; an `all_classes` impersonation session may
 * use any class). A teacher can only reset a password for a student whose
 * record they can already see — never another school's and never a class they
 * do not teach. Every lookup and write is scoped by the session's school.
 *
 * The password is returned ONCE, to the teacher who asked for it. The stored
 * copy is cleared the moment the student first signs in (see api/auth/login),
 * and the teacher UI presents it as "shown once, wiped when this window
 * closes". The auth update itself is the same shared code path the school-admin
 * reset uses, so the two can never drift apart.
 */

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  const { authorized, school_id, userId, all_classes } = await verifyTeacher();
  if (!authorized || !school_id || !userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const idErrors = new ValidationErrors();
  if (!uuid({ id }, "id", idErrors)) {
    return NextResponse.json({ error: "a valid student id is required" }, { status: 400 });
  }

  const supabase = getServiceClient();

  const { data: student } = await supabase
    .from("students")
    .select("id, profile_id, class_id")
    .eq("id", id)
    .eq("school_id", school_id)
    .maybeSingle();
  if (!student) return NextResponse.json({ error: "Student not found" }, { status: 404 });
  if (!student.profile_id) {
    return NextResponse.json({ error: "This student does not have a login account." }, { status: 400 });
  }

  // Same rule as GET/PATCH /api/teacher/students: the class teacher, or a
  // teacher assigned to that class. An `all_classes` session may use any class.
  if (!all_classes) {
    if (!student.class_id) {
      return NextResponse.json(
        { error: "You are not assigned to this student's class" },
        { status: 403 },
      );
    }
    const { data: teacher } = await supabase
      .from("teachers")
      .select("id")
      .eq("profile_id", userId)
      .eq("school_id", school_id)
      .maybeSingle();
    if (!teacher) return NextResponse.json({ error: "Teacher not found" }, { status: 404 });

    const { data: classTeacher } = await supabase
      .from("class_teachers")
      .select("id")
      .eq("school_id", school_id)
      .eq("class_id", student.class_id)
      .eq("teacher_id", teacher.id)
      .eq("is_active", true)
      .maybeSingle();
    if (!classTeacher) {
      const { data: assignment } = await supabase
        .from("teacher_subjects")
        .select("id")
        .eq("school_id", school_id)
        .eq("teacher_id", teacher.id)
        .eq("class_id", student.class_id)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();
      if (!assignment) {
        return NextResponse.json({ error: "You are not assigned to this class" }, { status: 403 });
      }
    }
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("email")
    .eq("id", student.profile_id)
    .eq("school_id", school_id)
    .maybeSingle();
  if (!profile?.email) {
    return NextResponse.json({ error: "This student's login account was not found." }, { status: 404 });
  }

  const { data: school } = await supabase.from("schools").select("name").eq("id", school_id).single();
  if (!school) return NextResponse.json({ error: "School not found" }, { status: 404 });

  const password = await generateUniquePassword(school.name, "student");
  const reset = await setAuthUserPassword({
    userId: student.profile_id,
    email: profile.email,
    password,
  });
  if (!reset.ok) {
    return NextResponse.json({ error: authResetErrorMessage(reset.reason) }, { status: 500 });
  }

  // Save generated_password and flag for forced change — the same columns the
  // school-admin reset writes, so both flows stay interchangeable.
  const { error: saveError } = await supabase
    .from("students")
    .update({ must_change_password: true, generated_password: password })
    .eq("id", id)
    .eq("school_id", school_id);
  if (saveError) console.error("[teacher/students] password flags save failed:", saveError.message);

  // WHO reset WHOSE password, in the same trail the edit and delete actions use.
  // `report_card_audit_logs` requires a class and a term, so a student without
  // either is logged to the server console rather than failing the reset.
  const term = await getActiveTerm(school_id);
  if (student.class_id && term) {
    const { error: auditError } = await supabase.from("report_card_audit_logs").insert({
      school_id,
      class_id: student.class_id,
      term_id: term.id,
      user_id: userId,
      action: "student_password_reset",
      details: { student_id: id },
    });
    if (auditError) console.error("[teacher/students] reset audit failed:", auditError.message);
  } else {
    console.warn("[teacher/students] reset audit skipped — student has no class or no active term");
  }

  return NextResponse.json({ password });
}
