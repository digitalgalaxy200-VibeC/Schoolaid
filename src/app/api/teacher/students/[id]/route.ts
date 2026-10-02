import { NextResponse } from "next/server";
import { verifyTeacher } from "@/lib/school-auth";
import { getActiveTerm } from "@/lib/report-card";
import { getServiceClient } from "@/lib/supabase/service";
import { composeFullName, parseTeacherStudentEdit } from "@/lib/students/teacher-editable";
import { ValidationErrors, uuid } from "@/lib/validate";

/**
 * PATCH /api/teacher/students/{id} — a teacher corrects one of their own
 * students' details.
 *
 * WHAT A TEACHER MAY CHANGE is the allow-list in `teacher-editable.ts` and
 * nothing else: names, date of birth, gender and the parent/guardian WhatsApp
 * number. Registration, class transfer, admission numbers and account state are
 * administrative acts and are not reachable from here even with a crafted body —
 * the parser only reads those six keys, so extra ones are ignored rather than
 * trusted.
 *
 * AUTHORIZATION mirrors the view rule exactly (class teacher, or a teacher
 * assigned to that class): a teacher can correct the records they can already
 * read, and no others. Every read and write is scoped by school.
 *
 * The parent/guardian number is the SAME `students.parent_phone` column the
 * school already reaches parents through (finance builds wa.me links from it);
 * the form simply presents it as the WhatsApp number.
 */

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { authorized, school_id, userId, all_classes } = await verifyTeacher();
  if (!authorized || !school_id || !userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const idErrors = new ValidationErrors();
  if (!uuid({ id }, "id", idErrors)) {
    return NextResponse.json({ error: "a valid student id is required" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const errors = new ValidationErrors();
  const edit = parseTeacherStudentEdit(body, errors);
  if (!edit) return NextResponse.json({ error: errors.summary() }, { status: 400 });

  const supabase = getServiceClient();

  const { data: student } = await supabase
    .from("students")
    .select(
      "id, profile_id, class_id, first_name, middle_name, last_name, date_of_birth, gender, parent_phone",
    )
    .eq("id", id)
    .eq("school_id", school_id)
    .maybeSingle();
  if (!student) return NextResponse.json({ error: "Student not found" }, { status: 404 });

  // Same rule as GET /api/teacher/students: the class teacher, or a teacher
  // assigned to that class. An `all_classes` session may correct any class.
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

  const fullName = composeFullName(edit);

  // The students table carries the flat name columns; profiles carries the
  // display `full_name` every other screen (marks, finance, receipts) reads.
  // Both are written, so a corrected name shows everywhere — and ONLY the
  // allow-listed fields are touched.
  const { error: studentError } = await supabase
    .from("students")
    .update({
      first_name: edit.first_name || null,
      middle_name: edit.middle_name,
      last_name: edit.last_name || null,
      date_of_birth: edit.date_of_birth,
      gender: edit.gender,
      parent_phone: edit.parent_phone,
    })
    .eq("id", id)
    .eq("school_id", school_id);
  if (studentError) return NextResponse.json({ error: studentError.message }, { status: 500 });

  if (student.profile_id) {
    const { error: profileError } = await supabase
      .from("profiles")
      .update({
        full_name: fullName,
        first_name: edit.first_name || null,
        middle_name: edit.middle_name,
        last_name: edit.last_name || null,
      })
      .eq("id", student.profile_id)
      .eq("school_id", school_id);
    if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  // WHO changed WHAT, in the same trail the delete-student action uses.
  // `report_card_audit_logs` requires a class and a term, so a student without
  // either is logged to the server console rather than failing the correction.
  const term = await getActiveTerm(school_id);
  if (student.class_id && term) {
    const { error: auditError } = await supabase.from("report_card_audit_logs").insert({
      school_id,
      class_id: student.class_id,
      term_id: term.id,
      user_id: userId,
      action: "student_detail_update",
      details: {
        student_id: id,
        before: {
          first_name: student.first_name ?? null,
          middle_name: student.middle_name ?? null,
          last_name: student.last_name ?? null,
          date_of_birth: student.date_of_birth ?? null,
          gender: student.gender ?? null,
          parent_phone: student.parent_phone ?? null,
        },
        after: {
          first_name: edit.first_name || null,
          middle_name: edit.middle_name,
          last_name: edit.last_name || null,
          date_of_birth: edit.date_of_birth,
          gender: edit.gender,
          parent_phone: edit.parent_phone,
        },
      },
    });
    if (auditError) console.error("[teacher/students] edit audit failed:", auditError.message);
  } else {
    console.warn(
      "[teacher/students] edit audit skipped — student has no class or no active term",
    );
  }

  return NextResponse.json({ ok: true, full_name: fullName });
}
