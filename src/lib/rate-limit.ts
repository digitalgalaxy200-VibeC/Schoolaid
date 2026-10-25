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
 *
 * TWO SHAPES, FOR TWO DIFFERENT QUESTIONS
 * ---------------------------------------
 * `checkRateLimit()` increments and answers "is this still allowed?" — right for
 * a resource where every request is work worth counting (an upload, a save).
 *
 * `rateLimitState()` only reads, so a caller can ask "am I already blocked?"
 * BEFORE doing anything, and record the attempt afterwards only if it failed.
 * That is what login needs: a correct password must not spend the budget, or
 * five teachers arriving at 8am lock out the sixth.
 */

export const DEFAULT_RATE_LIMIT_WINDOW_MS = 60_000;

/**
 * The client's address, as reported by the edge.
 *
 * `x-forwarded-for` may carry a chain ("client, proxy1, proxy2") when another
 * proxy sits in front of the platform; the whole string as a key would split one
 * client across several buckets, or lump everyone behind that proxy into one.
 * The first entry is the client. `x-real-ip` is the fallback some proxies set
 * instead, and `unknown` is the last resort — shared, but finite.
 */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return first || request.headers.get("x-real-ip")?.trim() || "unknown";
}

export type RateLimitState = {
  blocked: boolean;
  /** Seconds until the window ends. 0 when not blocked. */
  retryAfterSeconds: number;
};

/**
 * The decision, separated from the database so it can be tested directly.
 *
 * A missing row, an unparseable expiry, or an expiry in the past all mean "not
 * blocked": the window has ended, and the next write starts a fresh one.
 */
export function evaluateRateLimit(
  row: { attempts: number | string | null; expires_at: string | null } | null,
  limit: number,
  now: number,
): RateLimitState {
  if (!row) return { blocked: false, retryAfterSeconds: 0 };

  const expiresAt = row.expires_at ? new Date(row.expires_at).getTime() : NaN;
  if (!Number.isFinite(expiresAt) || expiresAt <= now) {
    return { blocked: false, retryAfterSeconds: 0 };
  }

  const attempts = Number(row.attempts) || 0;
  if (attempts < limit) return { blocked: false, retryAfterSeconds: 0 };

  return { blocked: true, retryAfterSeconds: Math.max(1, Math.ceil((expiresAt - now) / 1000)) };
}

/** The 429 every throttled route returns, with the wait the client should honour. */
export function tooManyAttemptsResponse(retryAfterSeconds: number): Response {
  return Response.json(
    { error: "Too many attempts.", retry_after_seconds: retryAfterSeconds },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
  );
}

export async function checkRateLimit(
  ip: string,
  limit: number = 5,
  windowMs: number = DEFAULT_RATE_LIMIT_WINDOW_MS,
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

/**
 * Whether `key` is currently blocked, without recording an attempt.
 *
 * Fails CLOSED, like `checkRateLimit`: if the table cannot be read we cannot
 * tell, and "cannot tell" must not become "allow" on an authentication path.
 */
export async function rateLimitState(
  key: string,
  limit: number,
  now: number = Date.now(),
  windowMs: number = DEFAULT_RATE_LIMIT_WINDOW_MS,
): Promise<RateLimitState> {
  try {
    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from("rate_limits")
      .select("attempts, expires_at")
      .eq("ip", key)
      .maybeSingle();

    if (error) throw error;

    return evaluateRateLimit(data, limit, now);
  } catch (err) {
    console.error("[rate-limit] state read failed — denying request:", err);
    return { blocked: true, retryAfterSeconds: Math.ceil(windowMs / 1000) };
  }
}

/**
 * Forgets a key. Used after a successful login, so previous typos do not count
 * against someone who has just proved they know the password.
 *
 * Best effort: a failed cleanup leaves a stale counter that expires on its own,
 * which is a worse experience than a deleted row but not a security problem —
 * so it must never fail the login.
 */
export async function clearRateLimit(key: string): Promise<void> {
  try {
    const supabase = getServiceClient();
    const { error } = await supabase.from("rate_limits").delete().eq("ip", key);
    if (error) throw error;
  } catch (err) {
    console.error("[rate-limit] could not clear a counter (it will expire):", err);
  }
}
