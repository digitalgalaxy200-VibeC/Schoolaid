import { getServiceClient } from "@/lib/supabase/service";

/**
 * The database half of class assignment.
 *
 * WHY BOTH HALVES EXIST
 * ---------------------
 * `class-change.ts` decides what the form should show. This module is what the
 * server trusts: before a `class_id` from a request body is written, it must be
 * a class belonging to the authenticated school.
 *
 * The dropdown only offers the school's own classes, but the dropdown is a
 * client — the route is the boundary. Every other admin route (class-teachers,
 * class-subjects, finance/class-fees) already checks this; the student update
 * route was the one that did not, so a crafted or stale id could point a student
 * at another tenant's class. Nothing then failed: the student simply vanished
 * from every roster of their own school, because rosters filter by school AND
 * class.
 *
 * Service-role access means RLS is not a backstop here. This check is.
 */

type Db = ReturnType<typeof getServiceClient>;

/** The `action` written to `report_card_audit_logs` for a class change. */
export const CLASS_CHANGE_ACTION = "student_class_change";

export type ClassRef = { id: string; name: string };

export type ClassLookup =
  | { ok: true; klass: ClassRef | null }
  | { ok: false; status: number; error: string };

/**
 * Resolve a class id to a class of THIS school.
 *
 * An empty id is not an error — "not assigned" is a supported state — and is
 * returned as `klass: null` without a query.
 *
 * A database failure is reported as 500 rather than as a validation error, so a
 * transient outage can never be mistaken for "that class is not yours".
 */
export async function loadSchoolClass(
  db: Db,
  schoolId: string,
  classId: string | null,
): Promise<ClassLookup> {
  if (!classId) return { ok: true, klass: null };

  const { data, error } = await db
    .from("classes")
    .select("id, name")
    .eq("id", classId)
    .eq("school_id", schoolId)
    .maybeSingle();

  if (error) {
    return { ok: false, status: 500, error: `Could not verify the class: ${error.message}` };
  }
  if (!data) {
    return { ok: false, status: 400, error: "class_id does not belong to this school" };
  }
  return { ok: true, klass: data as ClassRef };
}

/**
 * Best-effort names for a set of class ids, scoped to the school.
 *
 * Used to name the class a student is leaving. It deliberately does not fail:
 * the audit trail is worth having without a pretty label, and a missing name
 * must never block the move. An id that belongs to another tenant simply does
 * not resolve, which is the correct answer here.
 */
export async function loadClassNames(
  db: Db,
  schoolId: string,
  ids: readonly string[],
): Promise<Map<string, string>> {
  const wanted = Array.from(new Set(ids.filter(Boolean)));
  if (wanted.length === 0) return new Map();

  const { data } = await db
    .from("classes")
    .select("id, name")
    .in("id", wanted)
    .eq("school_id", schoolId);

  const names = new Map<string, string>();
  for (const row of (data as ClassRef[] | null) ?? []) {
    if (row?.id && row?.name) names.set(row.id, row.name);
  }
  return names;
}

export type ClassChangeRecord = {
  school_id: string;
  /** The acting admin. `report_card_audit_logs.user_id` is NOT NULL. */
  user_id: string | null;
  student_id: string;
  from: ClassRef | null;
  to: ClassRef | null;
  /** The active term, when the school has one. */
  term_id: string | null;
};

/**
 * Write the class change into the existing audit table.
 *
 * Returns whether a row was written, and NEVER throws: a valid student update
 * must not fail because the audit trail could not be appended. The reasons a row
 * is skipped are logged, because "no audit entry" should be explainable.
 *
 * `class_id` on that table is NOT NULL, so the change is attributed to the class
 * the student is moving INTO, falling back to the one they are leaving.
 */
export async function recordClassChange(
  db: Db,
  change: ClassChangeRecord,
): Promise<boolean> {
  const classId = change.to?.id ?? change.from?.id ?? null;
  if (!classId) {
    console.warn(
      "[students] class-change audit skipped — student has neither an old nor a new class",
    );
    return false;
  }
  if (!change.term_id) {
    console.warn("[students] class-change audit skipped — school has no active term");
    return false;
  }
  if (!change.user_id) {
    console.warn("[students] class-change audit skipped — no acting user on the session");
    return false;
  }

  const { error } = await db.from("report_card_audit_logs").insert({
    school_id: change.school_id,
    class_id: classId,
    term_id: change.term_id,
    user_id: change.user_id,
    action: CLASS_CHANGE_ACTION,
    details: {
      student_id: change.student_id,
      from_class_id: change.from?.id ?? null,
      from_class_name: change.from?.name ?? null,
      to_class_id: change.to?.id ?? null,
      to_class_name: change.to?.name ?? null,
    },
  });

  if (error) {
    console.error("[students] class-change audit failed:", error.message);
    return false;
  }
  return true;
}

