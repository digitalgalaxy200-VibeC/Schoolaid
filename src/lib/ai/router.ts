/**
 * Router (Phase 21) — tries routes in order, with fallback.
 *
 * WHAT FALLBACK IS FOR, AND WHAT IT IS NOT
 * ---------------------------------------
 * It is for the failure the platform cannot prevent: a provider is down,
 * throttling, or has a key that has been revoked. Those are properties of one
 * provider, and the answer is to ask another one.
 *
 * It is NOT for masking a caller's mistake. A malformed request fails
 * identically everywhere, so it is surfaced at once instead of being re-sent to
 * three providers who will each reject it. `isRetryableStatus` in the adapter
 * draws that line; this file only acts on it.
 *
 * WHY THE FAILURE OF EVERY PROVIDER IS RETURNED IN FULL
 * ----------------------------------------------------
 * "AI is unavailable" is not a diagnosis. The attempt list says which providers
 * were tried, what each returned and how long each took — which is the
 * difference between an operator fixing it in a minute and guessing.
 */

import {
  AiProviderError,
  type AiAttempt,
  type AiRoute,
} from "./types";

export type TryResult<T> =
  | { ok: true; value: T; route: AiRoute; attempts: AiAttempt[] }
  | { ok: false; error: Error; attempts: AiAttempt[] };

/**
 * Decides whether a thrown thing is worth another provider.
 *
 * An `AiProviderError` already carries the adapter's judgement. Anything else —
 * a socket reset, a DNS failure, a bug in a transport — is treated as retryable,
 * because an unexplained transport failure is precisely the case a fallback
 * exists for. The exception is a genuine programming error, which will simply
 * fail on the next provider too, at the cost of a little latency and nothing
 * else (providers bill on success).
 */
export function classifyError(err: unknown): {
  retryable: boolean;
  message: string;
  status: number | null;
} {
  if (err instanceof AiProviderError) {
    return { retryable: err.retryable, message: err.message, status: err.status };
  }
  return {
    retryable: true,
    message: err instanceof Error ? err.message : String(err),
    status: null,
  };
}

/** One line per attempt, for the usage record. Compact: it goes in a text column. */
export function describeAttempts(attempts: AiAttempt[]): string {
  if (attempts.length === 0) return "no provider was tried";
  return attempts
    .map((a) => {
      const status = a.status === undefined || a.status === null ? "" : ` HTTP ${a.status}`;
      const outcome = a.ok ? "ok" : `${a.retryable === false ? "fatal" : "retryable"}: ${a.error ?? "failed"}`;
      return `${a.provider}/${a.model}${status} — ${outcome} (${a.latencyMs}ms)`;
    })
    .join("; ");
}

/**
 * Runs `attempt` against each route until one succeeds.
 *
 * Stops early on a non-retryable failure — that failure would be identical at
 * the next provider, and continuing would turn one clear error into three
 * confusing ones.
 */
export async function tryRoutes<T>(args: {
  routes: AiRoute[];
  attempt: (route: AiRoute, index: number) => Promise<T>;
}): Promise<TryResult<T>> {
  const attempts: AiAttempt[] = [];
  let lastError: Error = new AiProviderError({
    provider: "none",
    message: "No AI provider is configured for this capability",
    status: null,
    retryable: false,
  });

  for (let i = 0; i < args.routes.length; i++) {
    const route = args.routes[i];
    const startedAt = Date.now();

    try {
      const value = await args.attempt(route, i);
      attempts.push({
        provider: route.provider.name,
        model: route.model.model,
        ok: true,
        latencyMs: Date.now() - startedAt,
      });
      return { ok: true, value, route, attempts };
    } catch (err) {
      const verdict = classifyError(err);
      lastError = err instanceof Error ? err : new Error(verdict.message);

      attempts.push({
        provider: route.provider.name,
        model: route.model.model,
        ok: false,
        status: verdict.status ?? undefined,
        error: verdict.message,
        retryable: verdict.retryable,
        latencyMs: Date.now() - startedAt,
      });

      if (!verdict.retryable) break;
    }
  }

  return { ok: false, error: lastError, attempts };
}
