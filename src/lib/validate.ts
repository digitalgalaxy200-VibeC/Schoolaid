/**
 * Minimal runtime input validation (reusability item R11).
 *
 * WHY THIS EXISTS
 * ---------------
 * The codebase validates request bodies by hand, differently in every route:
 * some cast, some check truthiness, some check nothing. That is how a numeric
 * field ends up as the string "12", how `undefined` becomes `null` in one place
 * and `0` in another, and how an unvalidated id reaches a query.
 *
 * TypeScript cannot help here. `await request.json()` returns `any`, so the
 * declared type of a request body is a claim about data that has not been
 * checked. Everything crossing that boundary has to be verified at runtime, and
 * this is the single place that does it.
 *
 * DESIGN
 *   - Errors ACCUMULATE rather than throwing on the first problem, so a caller
 *     learns every bad field at once instead of one per round trip.
 *   - Coercion is explicit and strict: a numeric string is NOT a number, and a
 *     missing field is `null`, never `undefined` or a silent default.
 *   - Nothing here is clever. A validator that surprises its caller is worse
 *     than no validator.
 *
 * Deliberately not using a schema library: this is a small, dependency-free
 * surface, and the repo has no validation library today (adding one is a
 * separate, deliberate decision).
 */

export type FieldError = { field: string; message: string };

/**
 * Accumulates field errors. `child()` produces a namespaced collector that
 * SHARES this one's list, so nested validation (`options[2].option_text`) lands
 * in the same place without every call site re-threading a prefix string.
 */
export class ValidationErrors {
  readonly list: FieldError[];

  constructor(
    private readonly prefix = "",
    shared?: FieldError[],
  ) {
    this.list = shared ?? [];
  }

  add(field: string, message: string): void {
    this.list.push({
      field: this.prefix ? `${this.prefix}.${field}` : field,
      message,
    });
  }

  get ok(): boolean {
    return this.list.length === 0;
  }

  /** A collector for a nested object or list item. */
  child(prefix: string): ValidationErrors {
    return new ValidationErrors(
      this.prefix ? `${this.prefix}.${prefix}` : prefix,
      this.list,
    );
  }

  /** One-line summary for an API error response. */
  summary(): string {
    return this.list.map((e) => `${e.field}: ${e.message}`).join("; ");
  }
}

function source(body: unknown): Record<string, unknown> {
  return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
}

/** A trimmed string. Empty/whitespace-only counts as absent. */
export function text(
  body: unknown,
  field: string,
  errors: ValidationErrors,
  opts: { required?: boolean; max?: number; min?: number } = {},
): string | null {
  const raw = source(body)[field];

  if (raw === undefined || raw === null || raw === "") {
    if (opts.required) errors.add(field, "is required");
    return null;
  }

  if (typeof raw !== "string") {
    errors.add(field, "must be a string");
    return null;
  }

  const value = raw.trim();

  if (value === "") {
    if (opts.required) errors.add(field, "is required");
    return null;
  }
  if (opts.min !== undefined && value.length < opts.min) {
    errors.add(field, `must be at least ${opts.min} characters`);
    return null;
  }
  if (opts.max !== undefined && value.length > opts.max) {
    errors.add(field, `must be at most ${opts.max} characters`);
    return null;
  }

  return value;
}

/**
 * A finite number. Strings are rejected rather than coerced — `"12"` arriving
 * where a number was promised means the client is wrong, and silently accepting
 * it hides that.
 */
export function number(
  body: unknown,
  field: string,
  errors: ValidationErrors,
  opts: { required?: boolean; min?: number; max?: number; integer?: boolean } = {},
): number | null {
  const raw = source(body)[field];

  if (raw === undefined || raw === null || raw === "") {
    if (opts.required) errors.add(field, "is required");
    return null;
  }

  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    errors.add(field, "must be a number");
    return null;
  }
  if (opts.integer && !Number.isInteger(raw)) {
    errors.add(field, "must be a whole number");
    return null;
  }
  if (opts.min !== undefined && raw < opts.min) {
    errors.add(field, `must be at least ${opts.min}`);
    return null;
  }
  if (opts.max !== undefined && raw > opts.max) {
    errors.add(field, `must be at most ${opts.max}`);
    return null;
  }

  return raw;
}

/** A boolean, strictly. `"true"` is not `true`. */
export function bool(
  body: unknown,
  field: string,
  errors: ValidationErrors,
  opts: { required?: boolean } = {},
): boolean | null {
  const raw = source(body)[field];

  if (raw === undefined || raw === null) {
    if (opts.required) errors.add(field, "is required");
    return null;
  }
  if (typeof raw !== "boolean") {
    errors.add(field, "must be true or false");
    return null;
  }
  return raw;
}

/** One of a fixed set of values. */
export function oneOf<T extends string>(
  body: unknown,
  field: string,
  allowed: readonly T[],
  errors: ValidationErrors,
  opts: { required?: boolean } = {},
): T | null {
  const raw = source(body)[field];

  if (raw === undefined || raw === null || raw === "") {
    if (opts.required) errors.add(field, "is required");
    return null;
  }
  if (typeof raw !== "string" || !(allowed as readonly string[]).includes(raw)) {
    errors.add(field, `must be one of: ${allowed.join(", ")}`);
    return null;
  }
  return raw as T;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A UUID, or null when absent. Shape-checked so a malformed id is rejected
 * before it reaches Postgres (where it would surface as a cast error from a
 * different layer entirely).
 */
export function uuid(
  body: unknown,
  field: string,
  errors: ValidationErrors,
  opts: { required?: boolean } = {},
): string | null {
  const raw = source(body)[field];

  if (raw === undefined || raw === null || raw === "") {
    if (opts.required) errors.add(field, "is required");
    return null;
  }
  if (typeof raw !== "string" || !UUID_RE.test(raw)) {
    errors.add(field, "must be a valid id");
    return null;
  }
  return raw;
}

/** An array of plain objects, for nested collections. */
export function objectList(
  body: unknown,
  field: string,
  errors: ValidationErrors,
  opts: { required?: boolean; min?: number; max?: number } = {},
): Record<string, unknown>[] | null {
  const raw = source(body)[field];

  if (raw === undefined || raw === null) {
    if (opts.required) errors.add(field, "is required");
    return null;
  }
  if (!Array.isArray(raw)) {
    errors.add(field, "must be a list");
    return null;
  }
  if (opts.min !== undefined && raw.length < opts.min) {
    errors.add(field, `must contain at least ${opts.min} item(s)`);
    return null;
  }
  if (opts.max !== undefined && raw.length > opts.max) {
    errors.add(field, `must contain at most ${opts.max} item(s)`);
    return null;
  }

  const out: Record<string, unknown>[] = [];
  raw.forEach((item, i) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      errors.add(`${field}[${i}]`, "must be an object");
      return;
    }
    out.push(item as Record<string, unknown>);
  });

  return out;
}
