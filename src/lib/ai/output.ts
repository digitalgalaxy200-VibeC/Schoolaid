/**
 * Output validation (Phase 23) — turning a model's reply into something a
 * feature may safely use.
 *
 * WHY A REPLY NEEDS VALIDATING AT ALL
 * -----------------------------------
 * A model's output is attacker-influenced text, not a value. It is shaped by
 * everything in the prompt, including the untrusted parts, so a reply that looks
 * like `{"marks": 30}` may be a 30 an injected instruction produced. Two rules
 * follow from that and neither is negotiable:
 *
 *   1. A reply is PARSED AND CHECKED, never trusted. If it does not conform, the
 *      call fails — a feature must not fall back to "use it anyway".
 *   2. A reply is TEXT. It is never `eval`'d, never compiled, never sent as SQL,
 *      and never dispatched as an operation. The only execution surface in this
 *      codebase is the copilot's capability registry, which is an allow-list,
 *      blocks high-risk capabilities in code, and requires human approval.
 *      Nothing in `src/lib/ai/` executes anything at all.
 *
 * WHY NOT A SCHEMA LIBRARY
 * ------------------------
 * Field-level validation already exists — `src/lib/validate.ts`, with its
 * accumulating errors. Duplicating it here would mean two validators to keep
 * aligned. So this module does the part that library cannot: getting a JSON
 * OBJECT out of a chat reply, safely, and refusing when it cannot.
 *
 * Usage:
 *
 *     const parsed = parseModelJson(reply);
 *     if (!parsed.ok) return fail(parsed.reason);
 *     const errors = new ValidationErrors();
 *     const marks = number(parsed.value, "marks", errors, { min: 0 });
 */

/** A cap before parsing. A runaway reply is a cost and a CPU problem. */
export const MAX_MODEL_OUTPUT_CHARS = 200_000;

/**
 * Keys that must never appear in a parsed reply.
 *
 * `Object.assign(target, parsed)` uses [[Set]], and assigning `__proto__` through
 * [[Set]] invokes the prototype setter — so merging attacker-shaped model output
 * into an object can silently rewrite that object's prototype. No caller does
 * that today. This check exists because the mitigation is three lines now and a
 * subtle, hard-to-find bug later.
 */
const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);

export type ParseResult =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; reason: string };

/** True for a plain object: not null, not an array, not a scalar. */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Removes a surrounding markdown code fence, if the whole reply is wrapped in one.
 *
 * Models add these constantly when asked for JSON. Only a fence that wraps the
 * entire trimmed reply is removed, so a fence that is part of the content (a
 * student's essay quoting code, say) is left alone.
 */
export function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(/^(?:```|~~~)(?:json|JSON)?\s*\n([\s\S]*?)\n?(?:```|~~~)\s*$/);
  return match ? match[1].trim() : trimmed;
}

/**
 * The first `{` to the last `}`, when the reply is prose with JSON inside it.
 *
 * A heuristic, and it is only ever a FALLBACK: the straight parse and the fenced
 * parse are tried first. If the result does not parse either, the call fails. It
 * never tries to repair, complete or coerce malformed JSON — a model that
 * produced invalid JSON produced something we do not understand, and guessing at
 * its intent is how a wrong mark gets recorded.
 */
function outerObject(text: string): string | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return text.slice(start, end + 1);
}

/** Scans for a dangerous key at any depth, iteratively so nesting cannot blow the stack. */
function findDangerousKey(root: unknown): string | null {
  const stack: unknown[] = [root];

  while (stack.length > 0) {
    const value = stack.pop();
    if (!value || typeof value !== "object") continue;

    if (Array.isArray(value)) {
      for (const item of value) stack.push(item);
      continue;
    }

    for (const key of Object.keys(value as Record<string, unknown>)) {
      if (DANGEROUS_KEYS.has(key)) return key;
      stack.push((value as Record<string, unknown>)[key]);
    }
  }

  return null;
}

/**
 * Parses a reply into a plain object, or explains why it could not.
 *
 * Fails closed on every axis: wrong type, too long, not JSON, JSON that is not an
 * object, or JSON carrying a dangerous key.
 */
export function parseModelJson(
  text: unknown,
  options: { maxChars?: number } = {},
): ParseResult {
  if (typeof text !== "string") {
    return { ok: false, reason: "the reply was not text" };
  }

  const limit = options.maxChars ?? MAX_MODEL_OUTPUT_CHARS;
  if (text.length > limit) {
    return {
      ok: false,
      reason: `the reply was ${text.length} characters, over the ${limit} limit`,
    };
  }

  if (text.trim() === "") {
    return { ok: false, reason: "the reply was empty" };
  }

  const unfenced = stripCodeFences(text);
  const candidates = [text.trim(), unfenced];
  const outer = outerObject(unfenced);
  if (outer) candidates.push(outer);

  for (const candidate of candidates) {
    if (!candidate) continue;

    let value: unknown;
    try {
      value = JSON.parse(candidate);
    } catch {
      continue;
    }

    if (!isPlainObject(value)) {
      // Valid JSON, wrong shape: an array, a string, a number. Callers expect an
      // object, and silently wrapping it would hide a prompt that is wrong.
      return { ok: false, reason: "the reply was valid JSON but not a JSON object" };
    }

    const dangerous = findDangerousKey(value);
    if (dangerous) {
      return { ok: false, reason: `the reply contained a forbidden key: ${dangerous}` };
    }

    return { ok: true, value };
  }

  return { ok: false, reason: "the reply did not contain a JSON object" };
}

export type TextResult =
  | { ok: true; value: string }
  | { ok: false; reason: string };

/**
 * Checks that a reply is usable prose.
 *
 * Every text feature needs the same three checks — present, non-empty, bounded —
 * and each doing its own slightly different version is how one of them ends up
 * storing a whitespace-only string.
 */
export function parseModelText(
  text: unknown,
  options: { maxChars?: number; minChars?: number } = {},
): TextResult {
  if (typeof text !== "string") {
    return { ok: false, reason: "the reply was not text" };
  }

  const value = text.trim();
  const min = options.minChars ?? 1;

  if (value.length < min) {
    return { ok: false, reason: "the reply was empty" };
  }

  const limit = options.maxChars ?? MAX_MODEL_OUTPUT_CHARS;
  if (value.length > limit) {
    return {
      ok: false,
      reason: `the reply was ${value.length} characters, over the ${limit} limit`,
    };
  }

  return { ok: true, value };
}
