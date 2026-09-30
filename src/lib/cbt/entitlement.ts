import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * School-level CBT entitlement — "may THIS school see CBT at all?"
 *
 * WHY A GATE, AND WHY IT IS HERE
 * ------------------------------
 * CBT has not been released. Deploying the code must not hand it to every
 * school at once, so the question "is CBT on for this school?" is answered in
 * one place and defaulted to NO.
 *
 * WHY `school_features` AND NOT A NEW TABLE
 * -----------------------------------------
 * `school_features` already answers "is feature X on for school Y" — the AI
 * gateway (`src/lib/ai/features.ts`) and the Website Engine
 * (`src/lib/site/entitlement.ts`) both read it, and the Super Admin features
 * endpoint already writes arbitrary keys. A second mechanism for the same
 * question would be two places to look and two ways to be wrong. The platform
 * rule is one question, one answer.
 *
 * DEFAULT IS DENY
 * ---------------
 * No row means off. Deploying CBT grants nobody anything; a school gets it only
 * when somebody deliberately enables the flag for that school. That is the same
 * posture the Website Engine uses, and it is what makes shipping untested
 * features safe.
 *
 * FAILS CLOSED: a read that errors is not permission. The caller reports the
 * error separately so the cause stays visible instead of looking like an
 * ordinary "switched off".
 */

/** The `school_features.feature_key` that unlocks CBT for a school. */
export const CBT_FEATURE_KEY = "cbt";

export type CbtEntitlement = {
  enabled: boolean;
  /** Set when the check itself could not be performed. */
  error: string | null;
};

export async function readCbtEntitlement(
  supabase: SupabaseClient,
  schoolId: string,
): Promise<CbtEntitlement> {
  const { data, error } = await supabase
    .from("school_features")
    .select("is_enabled")
    .eq("school_id", schoolId)
    .eq("feature_key", CBT_FEATURE_KEY)
    .maybeSingle();

  if (error) {
    return {
      enabled: false,
      error: `Could not read the school's CBT entitlement: ${error.message}`,
    };
  }

  return { enabled: data?.is_enabled === true, error: null };
}
