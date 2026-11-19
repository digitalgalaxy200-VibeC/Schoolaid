// ============================================================
// Session → term date spans
//
// A session runs from September to July; its three terms are CONSECUTIVE
// slices of that range, not three copies of it. Creating a session used to give
// every default term the session's own start and end, so First, Second and
// Third Term all read "07/Sep/26 — 21/Dec/26" with no way to tell them apart.
//
// Everything here is pure and works on calendar dates (`YYYY-MM-DD`) in UTC, so
// no timezone can move a term boundary by a day.
// ============================================================

const DAY_MS = 86_400_000;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export interface DateSpan {
  start: string;
  end: string;
}

/** `YYYY-MM-DD` → UTC midnight, or null if it is not a real calendar date. */
function parseDate(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = ISO_DATE.exec(value.trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const stamp = Date.UTC(year, month - 1, day);
  const check = new Date(stamp);

  // "2026-02-30" round-trips to March; that is a typo, not a date.
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    return null;
  }
  return stamp;
}

function toISO(stamp: number): string {
  return new Date(stamp).toISOString().slice(0, 10);
}

/**
 * The session's range cut into `count` consecutive, non-overlapping spans.
 *
 * The spans always cover exactly the same first and last day as the session, and
 * share the days as evenly as whole days allow (a 314-day year in three gives
 * 104, 105 and 105). Returns an empty list when the inputs cannot describe a
 * range — the caller then leaves the terms undated rather than inventing dates.
 */
export function splitSpan(startISO: unknown, endISO: unknown, count = 3): DateSpan[] {
  const start = parseDate(startISO);
  const end = parseDate(endISO);
  if (start === null || end === null || end < start) return [];
  if (!Number.isInteger(count) || count < 1) return [];

  const days = Math.round((end - start) / DAY_MS) + 1;
  if (days < count) return [];

  // Share the days as evenly as whole days allow: the remainder goes to the
  // first spans, one day each. Every span gets at least one day because
  // `days >= count`.
  const base = Math.floor(days / count);
  const remainder = days % count;

  const spans: DateSpan[] = [];
  let cursor = start;

  for (let index = 0; index < count; index++) {
    const size = base + (index < remainder ? 1 : 0);
    const last = cursor + (size - 1) * DAY_MS;
    spans.push({ start: toISO(cursor), end: toISO(last) });
    cursor = last + DAY_MS;
  }

  return spans;
}

/** Whole weeks covered by the range, inclusive of both end days. */
export function durationInWeeks(startISO: unknown, endISO: unknown): number | null {
  const start = parseDate(startISO);
  const end = parseDate(endISO);
  if (start === null || end === null || end < start) return null;
  const days = Math.round((end - start) / DAY_MS) + 1;
  return Math.max(1, Math.round(days / 7));
}

/**
 * A sentence for a range that cannot be saved, or null when it is fine.
 * Used by both the session and term forms, so the wording is the same.
 */
export function dateRangeError(startISO: unknown, endISO: unknown): string | null {
  const start = parseDate(startISO);
  const end = parseDate(endISO);

  if (typeof startISO === "string" && startISO.trim() !== "" && start === null) {
    return "The start date is not a valid date.";
  }
  if (typeof endISO === "string" && endISO.trim() !== "" && end === null) {
    return "The end date is not a valid date.";
  }
  if (start !== null && end !== null && end < start) {
    return "The end date cannot be before the start date.";
  }
  return null;
}
