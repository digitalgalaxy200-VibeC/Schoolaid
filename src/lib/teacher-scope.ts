import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Resolves the `teachers.id` row for a given auth/profile id (the JWT `sub`
 * claim, i.e. `profiles.id`). Assignment tables (`teacher_subjects`,
 * `class_teachers`) reference `teachers.id`, not the profile id directly, so
 * this lookup is required before any assignment check.
 */
export async function resolveTeacherRowId(
  supabase: SupabaseClient,
  profileId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("teachers")
    .select("id")
    .eq("profile_id", profileId)
    .single();
  return data?.id ?? null;
}

/**
 * Returns true if the teacher is actually assigned to the given class —
 * either as a class teacher (homeroom, `class_teachers`) or as a
 * subject teacher for that class (`teacher_subjects`). If `subjectId` is
 * provided, the `teacher_subjects` check is narrowed to that specific
 * subject.
 *
 * Added as part of the security fixes in docs/CORRECTIONS_SECURITE.md:
 * previously, `/api/teacher/students`, `/api/teacher/scores`, and
 * `/api/teacher/publish` only checked that the caller was *a* teacher at
 * the school, and accepted any `class_id`/`subject_id` supplied by the
 * client — meaning any teacher could view or write scores for any class in
 * their school, not just their own. This function is the fix; call it
 * before returning student/score data or accepting a write.
 */
export async function isTeacherAssignedToClass(
  supabase: SupabaseClient,
  schoolId: string,
  teacherRowId: string,
  classId: string,
  subjectId?: string | null,
): Promise<boolean> {
  let subjectQuery = supabase
    .from("teacher_subjects")
    .select("id")
    .eq("school_id", schoolId)
    .eq("teacher_id", teacherRowId)
    .eq("class_id", classId);
  if (subjectId) subjectQuery = subjectQuery.eq("subject_id", subjectId);

  const { data: subjectAssignment } = await subjectQuery.limit(1).maybeSingle();
  if (subjectAssignment) return true;

  const { data: classTeacherAssignment } = await supabase
    .from("class_teachers")
    .select("id")
    .eq("school_id", schoolId)
    .eq("teacher_id", teacherRowId)
    .eq("class_id", classId)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  return !!classTeacherAssignment;
}

/**
 * Combined check for write endpoints that receive a `student_id` directly
 * (scores, attendance, psychomotor/affective ratings, comments) rather than
 * a `class_id`. Resolves the student's school and class, confirms the
 * student actually belongs to the teacher's school (previously unchecked —
 * a student_id from another school would have been accepted as-is), and
 * confirms the teacher is assigned to that class/subject.
 */
export async function verifyTeacherCanAccessStudent(
  supabase: SupabaseClient,
  schoolId: string,
  teacherRowId: string,
  studentId: string,
  subjectId?: string | null,
): Promise<{ ok: boolean; classId: string | null }> {
  const { data: student } = await supabase
    .from("students")
    .select("school_id, class_id")
    .eq("id", studentId)
    .single();

  if (!student || student.school_id !== schoolId || !student.class_id) {
    return { ok: false, classId: null };
  }

  const assigned = await isTeacherAssignedToClass(
    supabase,
    schoolId,
    teacherRowId,
    student.class_id,
    subjectId,
  );
  return { ok: assigned, classId: student.class_id };
}
