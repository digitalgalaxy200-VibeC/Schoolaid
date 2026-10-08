/**
 * Parameter references — a later step may consume an earlier step's output.
 *
 * WHY THIS EXISTS
 * ---------------
 * Several plans only work if step 2 can use what step 1 created — create a
 * class, then a student assigned to THAT class. Before this, `resolveParams`
 * was a stub that handed params through untouched, so dependent steps could
 * not actually use the result they depended on.
 *
 * SYNTAX
 * ------
 *   "$1"          → the whole `data` of step 1
 *   "$1.id"       → a dotted path into step 1's `data`
 *
 * An unresolvable reference (missing step, a step that did not succeed, or a
 * missing path) raises a `StepExecutionError`, so the step fails with a reason
 * instead of writing a literal "$1.id" into the database.
 */

import type { StepResult } from "./types";
import { StepExecutionError } from "./step-result";

const REF_PATTERN = /^\$(\d+)(?:\.(.+))?$/;

function resolveValue(value: unknown, results: Map<number, StepResult>): unknown {
  if (typeof value === "string") {
    const match = value.match(REF_PATTERN);
    if (!match) return value;

    const order = Number(match[1]);
    const path = match[2];
    const result = results.get(order);

    if (!result) {
      throw new StepExecutionError(
        "UNRESOLVED_REFERENCE",
        `Reference ${value} points at step ${order}, which has not produced a result.`,
      );
    }
    if (result.status !== "success") {
      throw new StepExecutionError(
        "UNRESOLVED_REFERENCE",
        `Reference ${value} points at step ${order}, whose outcome was ${result.status}.`,
      );
    }

    let current: unknown = result.data;
    if (path) {
      for (const key of path.split(".")) {
        if (
          current &&
          typeof current === "object" &&
          !Array.isArray(current) &&
          key in (current as Record<string, unknown>)
        ) {
          current = (current as Record<string, unknown>)[key];
        } else {
          throw new StepExecutionError(
            "UNRESOLVED_REFERENCE",
            `Reference ${value} could not be resolved: "${key}" is missing.`,
          );
        }
      }
    }
    return current;
  }

  if (Array.isArray(value)) return value.map((v) => resolveValue(v, results));

  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      out[key] = resolveValue(v, results);
    }
    return out;
  }

  return value;
}

/** Resolve every `$ref` in a step's params against earlier step results. */
export function resolveRefs(
  params: Record<string, unknown>,
  results: Map<number, StepResult>,
): Record<string, unknown> {
  return resolveValue(params, results) as Record<string, unknown>;
}
