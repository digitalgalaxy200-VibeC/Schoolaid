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

/** Generic class→school template row resolution (components/grading/psychomotor/affective). */
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
  if (!templateId) {
    const { data: t } = await supabase.from(templateTable).select("id").eq("school_id", school_id).limit(1).maybeSingle();
    templateId = t?.id;
  }
  if (!templateId) return [];
  const { data: rows } = await supabase.from(rowsTable).select("*").eq("template_id", templateId).order(orderBy);
  return rows || [];
}

/** Submission lock check. */
export function isLocked(status: string | null | undefined) {
  return status === "pending_approval" || status === "approved";
}
