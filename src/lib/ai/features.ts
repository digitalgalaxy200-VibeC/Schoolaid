/**
 * School-level AI entitlement — "may THIS school use AI at all?"
 *
 * WHY A GATE, AND WHY IT IS HERE
 * ------------------------------
 * Two different questions get confused, and they are answered in different
 * places:
 *
 *   "Is an AI provider configured?"   platform-level — `ai_providers` (Super Admin)
 *   "May this school use AI?"         tenant-level  — here
 *   "Can this school afford it?"      tenant-level  — the credit ledger
 *
 * If the tenant question were answered per route, every AI feature would answer
 * it slightly differently and one of them would forget. So it is answered once,
 * in the gateway, through this module.
 *
 * WHY `school_features` AND NOT A NEW TABLE
 * -----------------------------------------
 * `school_features` already exists and is already the answer to "is feature X on
 * for school Y" — `ai_import` uses it today, and the Super Admin schools screen
 * already has a toggle writing it. A second mechanism for the same question would
 * be two places to look and two ways to be wrong.
 *
 * RELATIONSHIP TO THE EXISTING `ai_import` FLAG
 * ---------------------------------------------
 * `ai_import` gates that one legacy feature and is left exactly as it is — it is
 * a working V1 flag and removing it would change behaviour. This key (`ai`) is
 * the MASTER switch for the AI gateway, so a feature that goes through
 * `runAiCall` needs `ai`; the legacy route needs `ai_import`. Both can be on; the
 * master one is what the gateway enforces.
 *
 * DEFAULT IS DENY
 * ---------------
 * No row means off. A new school gets no AI until someone deliberately grants it,
 * which is the same posture as migration 049 seeding every provider disabled: the
 * platform does not hand out AI by accident.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/** The `school_features.feature_key` that unlocks the AI gateway for a school. */
export const AI_FEATURE_KEY = "ai";

/**
 * The legacy per-feature flag the Super Admin schools screen still writes.
 *
 * It is what the "AI Import" switch flips, and it predates the gateway. Kept
 * exported because the entitlement rule below has to name it, and because
 * callers that report on the flag should not retype the string.
 */
export const LEGACY_AI_IMPORT_KEY = "ai_import";

export type AiEntitlement = {
  enabled: boolean;
  /** Set when the check itself could not be performed. */
  error: string | null;
};

/**
 * Pure: resolve "may this school use AI?" from `school_features` rows.
 *
 * PRECEDENCE IS MASTER-THEN-LEGACY, and the order is the whole point:
 *
 *   - an `ai` row, ONCE IT EXISTS, is the answer — even when it says false.
 *     That is what makes the AI page's per-school switch a real kill switch;
 *     an OR of both flags would leave AI on for a school the platform admin
 *     had just switched off, because the old `ai_import` row is still there.
 *   - only when no `ai` row exists at all does the legacy `ai_import` grant
 *     count. An admin who flips "AI Import" on the schools screen has granted
 *     AI import, and the CBT import IS an AI import — expecting a second,
 *     differently-named switch to be found first is the bug this fixes.
 *
 * Exported so the setup report and the entitlement check agree by construction
 * instead of each re-deriving the rule.
 */
export function resolveAiEntitlement(
  rows: { feature_key: string; is_enabled: boolean | null }[],
): boolean {
  const master = rows.find((r) => r.feature_key === AI_FEATURE_KEY);
  if (master) return master.is_enabled === true;
  return rows.some((r) => r.feature_key === LEGACY_AI_IMPORT_KEY && r.is_enabled === true);
}

/**
 * Reads the master AI flag for one school.
 *
 * FAILS CLOSED: a read that errors returns `enabled: false` rather than
 * proceeding. An entitlement check that cannot be performed is not permission,
 * and the caller reports the error separately so the cause stays visible in the
 * usage record instead of looking like an ordinary "switched off".
 */
export async function readAiEntitlement(
  supabase: SupabaseClient,
  schoolId: string,
): Promise<AiEntitlement> {
  const { data, error } = await supabase
    .from("school_features")
    .select("feature_key, is_enabled")
    .eq("school_id", schoolId)
    .in("feature_key", [AI_FEATURE_KEY, LEGACY_AI_IMPORT_KEY]);

  if (error) {
    return { enabled: false, error: `Could not read the school's AI entitlement: ${error.message}` };
  }

  return {
    enabled: resolveAiEntitlement(
      (data ?? []) as { feature_key: string; is_enabled: boolean | null }[],
    ),
    error: null,
  };
}
