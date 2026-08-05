import { getServiceClient } from "@/lib/supabase/service";

/** Resolve the teachers.id row for a profile, or null. */
export async function getTeacherByProfile(userId: string) {
  const supabase = getServiceClient();
  const { data } = await supabase.from("teachers").select("id").eq("profile_id", userId).single();
  return data;
}

/** True if teacher is an active class teacher of class_id. */
export async function isClassTeacher(school_id: string, teacher_id: string, class_id: string) {
  const supabase = getServiceClient();
  const { data } = await supabase
    .from("class_teachers")
    .select("id")
    .eq("school_id", school_id)
    .eq("teacher_id", teacher_id)
    .eq("class_id", class_id)
    .eq("is_active", true)
    .maybeSingle();
  return !!data;
}

/** Active term + session name, or null. */
export async function getActiveTerm(school_id: string) {
  const supabase = getServiceClient();
  const { data: term } = await supabase
    .from("academic_terms")
    .select("id, name, session_id")
    .eq("school_id", school_id)
    .eq("is_active", true)
    .maybeSingle();
  if (!term) return null;
  let session_name = "";
  if (term.session_id) {
    const { data: s } = await supabase.from("academic_sessions").select("name").eq("id", term.session_id).single();
    session_name = s?.name || "";
  }
  return { id: term.id, name: term.name, session_name };
}

/** Generic class->school template row resolution (components/grading/psychomotor/affective). */
export async function resolveTemplateRows(
  school_id: string,
  class_id: string,
  linkTable: string,
  templateTable: string,
  rowsTable: string,
  orderBy = "display_order",
): Promise<Record<string, unknown>[]> {
  const supabase = getServiceClient();
  const { data: link } = await supabase.from(linkTable).select("template_id").eq("class_id", class_id).maybeSingle();
  let templateId = link?.template_id;

  // Academic Level fallback (between class-specific and school default)
  if (!templateId) {
    const { data: cls } = await supabase.from("classes").select("academic_level_id").eq("id", class_id).single();
    if (cls?.academic_level_id) {
      const levelLinkTable = linkTable.replace("class_", "level_");
      const { data: levelLink } = await supabase.from(levelLinkTable).select("template_id").eq("level_id", cls.academic_level_id).maybeSingle();
      templateId = levelLink?.template_id;
    }
  }

  if (!templateId) {
    const { data: t } = await supabase.from(templateTable).select("id").eq("school_id", school_id).limit(1).maybeSingle();
    templateId = t?.id;
  }
  if (!templateId) return [];
  const { data: rows } = await supabase.from(rowsTable).select("*").eq("template_id", templateId).order(orderBy);
  return rows || [];
}

/** Submission lock check — locked when pending_approval, approved, or published. */
export function isLocked(status: string | null | undefined) {
  return status === "pending_approval" || status === "approved" || status === "published";
}

/**
 * True only when the class the student's published term_results belong to
 * has a PUBLISHED report_card_submissions row for that term. Uses the class_id
 * frozen on term_results at publish time (not the student's current class_id),
 * so a later promotion doesn't hide already-published results.
 */
export async function isTermApprovedForStudent(
  student_id: string,
  term_id: string,
): Promise<{ approved: boolean; classId: string | null }> {
  const supabase = getServiceClient();
  const { data: results } = await supabase
    .from("term_results")
    .select("class_id")
    .eq("student_id", student_id)
    .eq("term_id", term_id)
    .eq("published", true)
    .limit(1);
  const classId = results?.[0]?.class_id ?? null;
  if (!classId) return { approved: false, classId: null };

  const { data: submission } = await supabase
    .from("report_card_submissions")
    .select("status")
    .eq("class_id", classId)
    .eq("term_id", term_id)
    .maybeSingle();

  // Only published results are visible to students
  return { approved: submission?.status === "published", classId };
}

/** Check if results are retracted — for friendly student messaging */
export async function isTermRetractedForStudent(
  student_id: string,
  term_id: string,
): Promise<{ retracted: boolean; reason: string | null }> {
  const supabase = getServiceClient();
  const { data: results } = await supabase
    .from("term_results")
    .select("class_id")
    .eq("student_id", student_id)
    .eq("term_id", term_id)
    .eq("published", true)
    .limit(1);
  const classId = results?.[0]?.class_id ?? null;
  if (!classId) return { retracted: false, reason: null };

  const { data: submission } = await supabase
    .from("report_card_submissions")
    .select("status, retraction_reason")
    .eq("class_id", classId)
    .eq("term_id", term_id)
    .maybeSingle();

  if (submission?.status === "retracted") {
    return { retracted: true, reason: submission.retraction_reason || null };
  }
  return { retracted: false, reason: null };
}

/** All statuses in the report card lifecycle */
export const SUBMISSION_STATUSES = ["draft", "pending_approval", "approved", "published", "retracted", "returned"] as const;
export type SubmissionStatus = typeof SUBMISSION_STATUSES[number];

/** Human-readable labels for each status */
export const STATUS_LABELS: Record<SubmissionStatus, string> = {
  draft: "Draft",
  pending_approval: "Submitted",
  approved: "Approved",
  published: "Published",
  retracted: "Retracted",
  returned: "Returned",
};

/** Badge variant mapping for UI */
export const STATUS_BADGE_VARIANT: Record<SubmissionStatus, string> = {
  draft: "draft",
  pending_approval: "info",
  approved: "success",
  published: "success",
  retracted: "error",
  returned: "warning",
};
