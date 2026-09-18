import { getServiceClient } from "@/lib/supabase/service";

/**
 * Shared throttling for login and other callers.
 *
 * State lives in Postgres (`rate_limits`) and the increment-and-check happens
 * inside the `bump_rate_limit` SECURITY DEFINER function, so concurrent
 * requests across different serverless instances cannot race past the limit.
 *
 * Previously this did a read-modify-write in application code against a table
 * that did not exist, and silently fell back to a per-instance in-memory Map —
 * on serverless every instance had its own counter, so the limit was
 * effectively unenforced and login brute-force protection did not work.
 *
 * The database is now the single source of truth. If it is unreachable we fail
 * CLOSED rather than allowing the request.
 */
export async function checkRateLimit(
  ip: string,
  limit: number = 5,
  windowMs: number = 60000,
): Promise<boolean> {
  try {
    const supabase = getServiceClient();

    const { data, error } = await supabase.rpc("bump_rate_limit", {
      p_ip: ip,
      p_limit: limit,
      p_window_ms: windowMs,
    });

    if (error) throw error;

    return data === true;
  } catch (err) {
    console.error("[rate-limit] check failed — denying request:", err);
    return false;
  }
}
