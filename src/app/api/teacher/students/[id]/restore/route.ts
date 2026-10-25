import { NextResponse } from "next/server";
import { verifyTeacher } from "@/lib/school-auth";
import { getActiveTerm } from "@/lib/report-card";
import { getServiceClient } from "@/lib/supabase/service";
import { getTeacherClassAccess } from "@/lib/students/teacher-class-access";
import { ValidationErrors, uuid } from "@/lib/validate";

/**
 * POST /api/teacher/students/{id}/restore — reactivates an ARCHIVED student.
 *
 * Restoration reuses the original record: the student id, admission number,
 * results, report cards, payments and receipts stay exactly as they were, and
 * the profile only flips `is_active` back to true. A new record is never
 * created, so restoring cannot duplicate the child's history.
 *
 * The caller may pass `class_id` to place the returning student in their class.
 * Permission follows the same rule as the rest of the roster:
 *
 *   - the caller must be the FORM teacher of the student's existing class, and
 *     of the destination class when it is different; or
 *   - an `all_classes` impersonation session may act on any class.
 *
 * A record archived from another class is therefore NOT restorable by a teacher
 * who does not teach that class — they see it in the duplicate warning and are
 * told to ask the school admin, rather than silently taking it over.
 */

type Params = { params: Promise<{ id: string }> };

type ProfileJoin = { full_name: string | null; is_active: boolean | null };

export async function POST(request: Request, { params }: Params) {
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
  const requestedClass =
    typeof body.class_id === "string" && body.class_id.trim() !== "" ? body.class_id.trim() : null;
  if (requestedClass) {
    const classErrors = new ValidationErrors();
    if (!uuid({ class_id: requestedClass }, "class_id", classErrors)) {
      return NextResponse.json({ error: "a valid class_id is required" }, { status: 400 });
    }
  }

  const supabase = getServiceClient();
  const { data: student } = await supabase
    .from("students")
    .select("id, profile_id, class_id, profiles(full_name, is_active)")
    .eq("id", id)
    .eq("school_id", school_id)
    .maybeSingle();
  if (!student) return NextResponse.json({ error: "Student not found" }, { status: 404 });

  const profile = Array.isArray(student.profiles) ? student.profiles[0] : student.profiles;
  const profileRow = profile as ProfileJoin | null;
  if (!student.profile_id || !profileRow) {
    return NextResponse.json(
      { error: "This student does not have a profile to restore." },
      { status: 400 },
    );
  }
  if (profileRow.is_active) {
    return NextResponse.json({ error: "This student is already active." }, { status: 409 });
  }

  const destinationClass = requestedClass || student.class_id || null;
  if (!destinationClass) {
    return NextResponse.json(
      { error: "Choose the class to restore this student into." },
      { status: 400 },
    );
  }

  if (!all_classes) {
    // The existing class must be one this teacher owns…
    if (student.class_id && student.class_id !== destinationClass) {
      const source = await getTeacherClassAccess(supabase, {
        school_id,
        user_id: userId,
        class_id: student.class_id,
      });
      if (!source.classTeacher) {
        return NextResponse.json(
          { error: "This student belongs to another class. Ask the school admin to restore them." },
          { status: 403 },
        );
      }
    }
    // …and so must the class they are being restored into.
    const destination = await getTeacherClassAccess(supabase, {
      school_id,
      user_id: userId,
      class_id: destinationClass,
    });
    if (!destination.classTeacher) {
      return NextResponse.json(
        { error: "You are not the class teacher for that class" },
        { status: 403 },
      );
    }
  }

  // Tenant guard: the destination class must belong to this school.
  const { data: cls } = await supabase
    .from("classes")
    .select("id")
    .eq("id", destinationClass)
    .eq("school_id", school_id)
    .maybeSingle();
  if (!cls) {
    return NextResponse.json({ error: "class_id does not belong to this school" }, { status: 400 });
  }

  if (student.class_id !== destinationClass) {
    const { error: moveError } = await supabase
      .from("students")
      .update({ class_id: destinationClass })
      .eq("id", id)
      .eq("school_id", school_id);
    if (moveError) {
      return NextResponse.json(
        { error: `Could not restore student: ${moveError.message}` },
        { status: 500 },
      );
    }
  }

  const { error: restoreError } = await supabase
    .from("profiles")
    .update({ is_active: true })
    .eq("id", student.profile_id)
    .eq("school_id", school_id);
  if (restoreError) {
    return NextResponse.json(
      { error: `Could not restore student: ${restoreError.message}` },
      { status: 500 },
    );
  }

  // The finance mirror of the archive flag (see students.is_active). Best-effort:
  // the roster flag above is the one every screen reads.
  const { error: mirrorError } = await supabase
    .from("students")
    .update({ is_active: true })
    .eq("id", id)
    .eq("school_id", school_id);
  if (mirrorError) {
    console.warn("[teacher/students] finance restore flag sync failed:", mirrorError.message);
  }

  const term = await getActiveTerm(school_id);
  if (term) {
    const { error: auditError } = await supabase.from("report_card_audit_logs").insert({
      school_id,
      class_id: destinationClass,
      term_id: term.id,
      user_id: userId,
      action: "restore_student",
      details: { student_id: id, class_id: destinationClass, source: "teacher" },
    });
    if (auditError) console.error("[teacher/students] restore audit failed:", auditError.message);
  } else {
    console.warn("[teacher/students] restore audit skipped — no active term");
  }

  return NextResponse.json({
    success: true,
    restored: true,
    student: {
      id: student.id,
      class_id: destinationClass,
      full_name: profileRow.full_name || "this student",
    },
  });
}
