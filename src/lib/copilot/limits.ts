/**
 * Payload limits — refuse an oversized plan instead of truncating it.
 *
 * WHY THIS EXISTS
 * ---------------
 * A plan too large to transport was previously a silent risk: it could arrive
 * cut off and be parsed as though it were the whole thing. A truncated plan is
 * not a smaller plan — it is a different one. So the engine measures the plan
 * BEFORE execution and refuses it with `PAYLOAD_TOO_LARGE`. Nothing runs.
 */

/** Refuse a plan whose serialised form exceeds this many UTF-8 bytes. */
export const MAX_PLAN_BYTES = 50_000;

export interface PayloadCheck {
  ok: boolean;
  bytes: number;
  maxBytes: number;
}

/** UTF-8 byte length, without depending on Node's Buffer. */
export function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).length;
}

/**
 * Byte size of a plan as it would be transported. A value that cannot be
 * serialised is treated as infinite, so it is refused rather than allowed.
 */
export function planPayloadBytes(plan: unknown): number {
  try {
    return utf8Bytes(JSON.stringify(plan ?? null));
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

export function checkPlanPayload(
  plan: unknown,
  maxBytes: number = MAX_PLAN_BYTES,
): PayloadCheck {
  const bytes = planPayloadBytes(plan);
  return { ok: bytes <= maxBytes, bytes, maxBytes };
}
