import { getServiceClient } from "@/lib/supabase/service";

/**
 * What a teacher may do in a class.
 *
 * Two different questions, deliberately kept apart:
 *
 *   - `assigned`   — the teacher teaches this class (form teacher OR subject
 *                    teacher). This is the read/edit rule the teacher API has
 *                    always used.
 *   - `classTeacher` — the teacher is the FORM teacher of the class. Only this
 *                    teacher owns the roster: adding students, archiving them
 *                    and restoring them. A subject teacher can correct
 *                    details of children they teach, but cannot change who is
 *                    in the class.
 *
 * Every lookup is scoped by school, so a teacher id from another tenant can
 * never satisfy the check.
 */

type Db = ReturnType<typeof getServiceClient>;

export type ClassAccess = {
  assigned: boolean;
  classTeacher: boolean;
};

const NO_ACCESS: ClassAccess = { assigned: false, classTeacher: false };

export async function getTeacherClassAccess(
  db: Db,
  params: { school_id: string; user_id: string; class_id: string | null | undefined },
): Promise<ClassAccess> {
  const { school_id, user_id, class_id } = params;
  if (!class_id) return NO_ACCESS;

  const { data: teacher } = await db
    .from("teachers")
    .select("id")
    .eq("profile_id", user_id)
    .eq("school_id", school_id)
    .maybeSingle();
  if (!teacher) return NO_ACCESS;

  const [classTeacher, subjectAssignment] = await Promise.all([
    db
      .from("class_teachers")
      .select("id")
      .eq("school_id", school_id)
      .eq("class_id", class_id)
      .eq("teacher_id", teacher.id)
      .eq("is_active", true)
      .maybeSingle(),
    db
      .from("teacher_subjects")
      .select("id")
      .eq("school_id", school_id)
      .eq("teacher_id", teacher.id)
      .eq("class_id", class_id)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle(),
  ]);

  return {
    assigned: !!classTeacher.data || !!subjectAssignment.data,
    classTeacher: !!classTeacher.data,
  };
}
