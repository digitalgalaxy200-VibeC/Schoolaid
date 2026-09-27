import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * School-level Website Engine entitlement — "may THIS school have a public site?"
 *
 * Same question, same mechanism, same posture as the AI entitlement in
 * `src/lib/ai/features.ts`: `school_features` already answers "is feature X on
 * for school Y", the Super Admin features screen already writes arbitrary keys,
 * and the platform's rule is that a second mechanism for the same question is
 * two places to look and two ways to be wrong.
 *
 * DEFAULT IS DENY — no row means no website, so deploying the engine grants
 * nobody a public page. A school gets one only when somebody deliberately
 * enables the flag for it.
 *
 * FAILS CLOSED: a read that errors is not permission, and the caller reports the
 * error separately so the cause stays visible instead of looking like an
 * ordinary "switched off".
 */

/** The `school_features.feature_key` that unlocks the public website for a school. */
export const WEBSITE_FEATURE_KEY = "website";

export type WebsiteEntitlement = {
  enabled: boolean;
  /** Set when the check itself could not be performed. */
  error: string | null;
};

export async function readWebsiteEntitlement(
  supabase: SupabaseClient,
  schoolId: string,
): Promise<WebsiteEntitlement> {
  const { data, error } = await supabase
    .from("school_features")
    .select("is_enabled")
    .eq("school_id", schoolId)
    .eq("feature_key", WEBSITE_FEATURE_KEY)
    .maybeSingle();

  if (error) {
    return {
      enabled: false,
      error: `Could not read the school's website entitlement: ${error.message}`,
    };
  }

  return { enabled: data?.is_enabled === true, error: null };
}
