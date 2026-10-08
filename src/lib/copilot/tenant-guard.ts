import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Write preflight: referenced IDs come from a model-authored plan, and the
 * execution engine uses the service client, which bypasses RLS.
 *
 * Injecting `ctx.schoolId` keeps the row being WRITTEN inside the right tenant,
 * but nothing stops a plan from pointing `class_id` / `session_id` /
 * `teacher_id` / `subject_id` at ANOTHER school's record — the foreign keys are
 * global. These checks close that gap: every referenced id must belong to the
 * acting school before a write may use it.
 */

type RefTable = "classes" | "academic_sessions" | "academic_terms" | "academic_levels" | "teachers" | "subjects";

export async function assertInSchool(
  supabase: SupabaseClient,
  table: RefTable,
  id: unknown,
  schoolId: string,
  label: string,
): Promise<string> {
  if (typeof id !== "string" || id.trim() === "") {
    throw new Error(`A ${label} id is required`);
  }
  const { data, error } = await supabase
    .from(table)
    .select("id")
    .eq("id", id)
    .eq("school_id", schoolId)
    .maybeSingle();

  if (error) throw new Error(`Could not verify the ${label}: ${error.message}`);
  if (!data) {
    throw new Error(`Reference check failed: ${label} ${id} does not belong to this school`);
  }
  return id;
}

export const assertClassInSchool = (supabase: SupabaseClient, id: unknown, schoolId: string) =>
  assertInSchool(supabase, "classes", id, schoolId, "class");

export const assertSessionInSchool = (supabase: SupabaseClient, id: unknown, schoolId: string) =>
  assertInSchool(supabase, "academic_sessions", id, schoolId, "session");

export const assertTermInSchool = (supabase: SupabaseClient, id: unknown, schoolId: string) =>
  assertInSchool(supabase, "academic_terms", id, schoolId, "term");

export const assertTeacherInSchool = (supabase: SupabaseClient, id: unknown, schoolId: string) =>
  assertInSchool(supabase, "teachers", id, schoolId, "teacher");

export const assertSubjectInSchool = (supabase: SupabaseClient, id: unknown, schoolId: string) =>
  assertInSchool(supabase, "subjects", id, schoolId, "subject");

export const assertAcademicLevelInSchool = (supabase: SupabaseClient, id: unknown, schoolId: string) =>
  assertInSchool(supabase, "academic_levels", id, schoolId, "academic level");

/**
 * A user email must be free before an auth account is created for it. Without
 * this, a collision surfaced as an opaque provider error mid-step; with it, the
 * step fails with a sentence the operator can act on.
 */
export async function assertEmailUnused(
  supabase: SupabaseClient,
  email: string,
): Promise<void> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("email", email)
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Could not check whether ${email} is already in use: ${error.message}`);
  if (data) {
    throw new Error(`A user account with the email ${email} already exists`);
  }
}
