/**
 * Step Result — the execution contract, and the rules that keep it honest.
 *
 * WHY THIS MODULE EXISTS
 * ----------------------
 * The dangerous failure mode is silent: a capability is dispatched, nothing
 * usable comes back, and the engine records "completed" anyway. The assistant
 * then reports a save that never happened. Three rules close that hole, and
 * they live here as pure functions so they can be tested without a database:
 *
 *   1. One contract. Every capability resolves into a `StepResult` — a
 *      capability does not get to invent its own success shape.
 *   2. An empty/undefined return is NOT success. It is `unknown`, with code
 *      `MISSING_EXECUTION_RESULT`.
 *   3. A step that does not return within its timeout is `unknown`, NOT
 *      `completed`. The mutation may well have landed; we simply do not know,
 *      and saying we do would be a lie.
 *
 * `unknown` is a real, terminal state. Nothing here ever converts it to
 * `success` — that conversion is exactly the bug this file exists to prevent.
 */

import type { StepResult } from "./types";

/** How long a single capability may run before its outcome is `unknown`. */
export const DEFAULT_STEP_TIMEOUT_MS = 30_000;

/**
 * A capability raised an error the engine can classify. `code` is the
 * machine-readable reason (e.g. `UNKNOWN_CAPABILITY`) that survives into the
 * `StepResult` and the audit log.
 */
export class StepExecutionError extends Error {
  readonly code: string;
  readonly details?: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = "StepExecutionError";
    this.code = code;
    this.details = details;
  }
}

/**
 * A unique execution request id, `req_…`.
 *
 * This is deliberately NOT the same thing as `operation_id` or `step_id`:
 * those identify *rows*, this identifies *one dispatch*. The same step can be
 * retried and produce a new request id; that is what makes a lost response
 * distinguishable from a successful one.
 */
export function newRequestId(): string {
  const uuid =
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  return `req_${uuid.replace(/-/g, "")}`;
}

/** Everything the contract needs to describe one execution, minus the outcome. */
export interface StepMeta {
  capability: string;
  /** Defaults to the capability name. */
  operation?: string;
  tenantId: string;
  requestId: string;
  /** Epoch ms when execution started, for `meta.duration_ms`. */
  startedAtMs: number;
  /** Injectable clock so tests get deterministic timestamps/durations. */
  nowMs?: () => number;
}

/** The three ways a `runWithTimeout` call can end. */
export type StepOutcome =
  | { kind: "resolved"; value: unknown }
  | { kind: "rejected"; error: unknown }
  | { kind: "timeout" };

function envelope(meta: StepMeta) {
  const now = meta.nowMs ? meta.nowMs() : Date.now();
  return {
    request_id: meta.requestId,
    operation: meta.operation ?? meta.capability,
    capability: meta.capability,
    tenant_id: meta.tenantId,
    meta: {
      timestamp: new Date(now).toISOString(),
      duration_ms: Math.max(0, now - meta.startedAtMs),
    },
  };
}

/** Best-effort entity id: a stored record exposes its primary key as `id`. */
function entityIdOf(data: unknown): string | undefined {
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const id = (data as Record<string, unknown>).id;
    if (typeof id === "string") return id;
  }
  return undefined;
}

/** Best-effort affected fields: website handlers report them as `changed[]`. */
function affectedOf(data: unknown): string[] | undefined {
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const changed = (data as Record<string, unknown>).changed;
    if (Array.isArray(changed)) {
      const names = changed.filter((c): c is string => typeof c === "string");
      return names.length > 0 ? names : undefined;
    }
  }
  return undefined;
}

/** A verified-good result. The only path to `status: "success"`. */
export function successResult(data: unknown, meta: StepMeta): StepResult {
  return {
    status: "success",
    ...envelope(meta),
    entity_id: entityIdOf(data),
    affected: affectedOf(data),
    data,
  };
}

/** A capability raised — classified where possible, generic otherwise. */
export function errorResult(error: unknown, meta: StepMeta): StepResult {
  let code = "EXECUTION_ERROR";
  let message: string;
  let details: unknown;

  if (error instanceof StepExecutionError) {
    code = error.code;
    message = error.message;
    details = error.details;
  } else if (error instanceof Error) {
    message = error.message;
  } else {
    message = String(error ?? "Unknown error");
  }

  return { status: "error", ...envelope(meta), error: { code, message, details } };
}

/**
 * The outcome could not be established. Deliberately NOT success.
 * Note it still carries an `error` — an unknown is something the reader must
 * see, not a silent gap.
 */
export function unknownResult(
  code: string,
  message: string,
  meta: StepMeta,
  details?: unknown,
): StepResult {
  return { status: "unknown", ...envelope(meta), error: { code, message, details } };
}

/**
 * Turn a raw capability return into a contract result.
 *
 * `undefined`/`null` means the capability gave us nothing to stand on. That is
 * `unknown` — never `completed`. An empty array or an empty object is a real
 * answer (an empty list is a valid read) and stays a success.
 */
export function normalizeStepResult(raw: unknown, meta: StepMeta): StepResult {
  if (raw === undefined || raw === null) {
    return unknownResult(
      "MISSING_EXECUTION_RESULT",
      "The capability did not return an authoritative execution result.",
      meta,
    );
  }
  return successResult(raw, meta);
}

/** Map a `runWithTimeout` outcome straight to a contract result. */
export function outcomeToStepResult(outcome: StepOutcome, meta: StepMeta): StepResult {
  switch (outcome.kind) {
    case "resolved":
      return normalizeStepResult(outcome.value, meta);
    case "rejected":
      return errorResult(outcome.error, meta);
    case "timeout":
      return unknownResult(
        "EXECUTION_TIMEOUT",
        "The capability did not return a result within its execution timeout; the mutation may or may not have completed.",
        meta,
      );
  }
}

/** The database status a `StepResult` maps onto. */
export function stepStatusFor(result: StepResult): "completed" | "failed" | "unknown" {
  if (result.status === "success") return "completed";
  if (result.status === "error") return "failed";
  return "unknown";
}

/**
 * Run `run()` but never wait forever. The losing branch is left attached so a
 * late resolve/reject cannot surface as an unhandled rejection.
 *
 * A timeout is not a cancellation: a database write cannot be recalled, which
 * is precisely why the correct answer is `unknown` rather than `failed`.
 */
export function runWithTimeout<T>(
  run: () => Promise<T>,
  timeoutMs: number,
): Promise<StepOutcome> {
  return new Promise<StepOutcome>((resolve) => {
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve({ kind: "timeout" });
    }, timeoutMs);

    const settle = (outcome: StepOutcome) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(outcome);
    };

    let promise: Promise<T>;
    try {
      promise = run();
    } catch (error) {
      settle({ kind: "rejected", error });
      return;
    }

    promise.then(
      (value) => settle({ kind: "resolved", value }),
      (error) => settle({ kind: "rejected", error }),
    );
  });
}
