import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Tenant ownership verification for client-supplied foreign keys.
 *
 * A foreign key proves a referenced row EXISTS; it proves nothing about who owns
 * it. Every write path that trusts an ID from the request body must confirm that
 * row belongs to the caller's school, otherwise a user can attach their data to
 * another school's row (or read another school's row back through a join).
 *
 * This is deliberately one shared helper rather than per-route checks, so the
 * same rule is applied everywhere and only has to be right once.
 */

export type OwnershipCheck = {
  /** Table the id refers to. */
  table: string;
  /** The client-supplied id. `null`/`undefined` is skipped. */
  id: string | null | undefined;
  /** Human label used in the error message. */
  label: string;
};

export type OwnershipResult = {
  ok: boolean;
  /** Human-readable descriptions of anything that failed. */
  violations: string[];
};

/**
 * Verifies each id exists and belongs to `schoolId`.
 */
export async function verifySchoolOwnership(
  supabase: SupabaseClient,
  schoolId: string,
  checks: OwnershipCheck[],
): Promise<OwnershipResult> {
  const violations: string[] = [];

  for (const check of checks) {
    if (!check.id) continue;

    const { data, error } = await supabase
      .from(check.table)
      .select("id, school_id")
      .eq("id", check.id)
      .maybeSingle();

    if (error) {
      violations.push(`${check.label}: lookup failed`);
      continue;
    }
    if (!data) {
      violations.push(`${check.label} does not exist`);
      continue;
    }
    if (data.school_id !== schoolId) {
      violations.push(`${check.label} belongs to a different school`);
    }
  }

  return { ok: violations.length === 0, violations };
}

/**
 * Resolves an assessment component's owning school.
 *
 * `components_rows` carries no `school_id` — it is owned through its template —
 * so ownership has to be resolved in two hops. A single-hop check against
 * `components_rows` would always fail and is a common source of bugs.
 */
export async function componentBelongsToSchool(
  supabase: SupabaseClient,
  schoolId: string,
  componentId: string,
): Promise<boolean> {
  const { data: row } = await supabase
    .from("components_rows")
    .select("template_id")
    .eq("id", componentId)
    .maybeSingle();

  if (!row?.template_id) return false;

  const { data: template } = await supabase
    .from("components_templates")
    .select("school_id")
    .eq("id", row.template_id)
    .maybeSingle();

  return template?.school_id === schoolId;
}
