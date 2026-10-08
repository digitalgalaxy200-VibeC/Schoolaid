/**
 * Idempotency — a retry must not perform the same write twice.
 *
 * WHY THIS EXISTS
 * ---------------
 * Once the engine is trustworthy enough to say "I don't know whether that
 * landed", the honest next move is to RETRY. That is only safe if a retry
 * cannot double-apply. So every write carries an idempotency key, and the
 * engine returns the ORIGINAL result when it sees the same key again.
 *
 * WHERE THE KEY COMES FROM
 * ------------------------
 *   * an explicit `idempotencyKey` on the step, when the caller supplies one; or
 *   * a deterministic key derived from tenant + capability + params.
 *
 * The derived form is stable across retries and ORDER-INSENSITIVE within the
 * params object, so `{a,b}` and `{b,a}` do not produce two different keys.
 */

import type { ExecutionStep } from "./types";

/** A stable, key-sorted serialisation, so equal objects hash equally. */
export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value ?? null);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(obj[k])}`).join(",")}}`;
}

/** djb2, rendered as 8 hex chars. Small, deterministic, dependency-free. */
export function stableHash(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/**
 * The idempotency key for a write step. Deterministic: the same tenant,
 * capability and params always yield the same key.
 */
export function idempotencyKeyFor(
  tenantId: string,
  step: Pick<ExecutionStep, "capability" | "params" | "idempotencyKey">,
): string {
  const explicit = step.idempotencyKey?.trim();
  if (explicit) return `idem_${stableHash(explicit)}`;
  return `idem_${stableHash(`${tenantId}|${step.capability}|${canonicalize(step.params ?? {})}`)}`;
}
