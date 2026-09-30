// ============================================================================
// Dates — the platform's ONE display format: dd/MMM/yy  (e.g. 30/Sep/26)
// ============================================================================
// This module formats dates FOR PEOPLE. It never produces a value that is
// stored or sent to an API — storage stays ISO (`YYYY-MM-DD`), and form inputs
// (`<input type="date">`) keep their ISO value, because that is what browsers
// require. The storage-side helpers live in `src/lib/finance/dates.ts`.
//
// WHY ONE MODULE
// --------------
// Dates used to render through `toLocaleDateString()` / `toLocaleString()`,
// whose output depends on the RUNTIME LOCALE — the server renders English-US,
// a visitor's browser renders whatever they use, and the same row could read
// "9/30/2026" in one place and "30/09/2026" in another. Worse, a server-rendered
// and a hydrated value could disagree. One format, one function, one result.
//
// TIMES ARE SCHOOL-LOCAL (Africa/Lagos)
// -------------------------------------
// The platform's calendar is Africa/Lagos (`finance/dates.ts`), so a timestamp
// is rendered in that zone. A payment recorded at 23:30 Lagos time is the 30th
// to the school, and it shows as the 30th here too.
//
// DATE-ONLY STRINGS ARE PARSED VERBATIM
// -------------------------------------
// `"2026-09-06"` — what the database stores for a Lagos calendar date — is read
// as that exact day, with no `Date` object and no timezone arithmetic, so it
// can never shift a day in either direction.
// ============================================================================

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

/** What a missing or unreadable value renders as — the platform's placeholder. */
const NOTHING = "—";

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

type Parts = { year: number; month: number; day: number; hour: number; minute: number; hasTime: boolean };

/**
 * The Lagos-local parts of a timestamp. Module-level so the formatter is built
 * once, not per render — and pinned to a named timezone so server and browser
 * always agree (a hydration mismatch on a date is a bug nobody can reproduce).
 */
const LAGOS_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Africa/Lagos",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function partsOf(value: string | number | Date | null | undefined): Parts | null {
  if (value === null || value === undefined || value === "") return null;

  if (typeof value === "string") {
    const dateOnly = DATE_ONLY.exec(value.trim());
    if (dateOnly) {
      const year = Number(dateOnly[1]);
      const month = Number(dateOnly[2]);
      const day = Number(dateOnly[3]);

      // The date-only path bypasses the Date parser, so it must not bypass the
      // calendar either: "2026-13-01" and "2026-02-30" are unreadable, not days.
      const check = new Date(Date.UTC(year, month - 1, day));
      if (
        check.getUTCFullYear() !== year ||
        check.getUTCMonth() !== month - 1 ||
        check.getUTCDate() !== day
      ) {
        return null;
      }

      return {
        year,
        month,
        day,
        hour: 0,
        minute: 0,
        // A calendar date carries no time; nothing may invent one for it.
        hasTime: false,
      };
    }
  }

  const date = value instanceof Date ? value : new Date(value as string | number);
  if (Number.isNaN(date.getTime())) return null;

  const parts: Record<string, number> = {};
  for (const part of LAGOS_FORMATTER.formatToParts(date)) {
    if (part.type !== "literal") parts[part.type] = Number(part.value);
  }

  const { year, month, day, hour, minute } = parts;
  if (![year, month, day, hour, minute].every((n) => Number.isFinite(n))) return null;
  if (month < 1 || month > 12) return null;

  return { year, month, day, hour, minute, hasTime: true };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** `30/Sep/26` — the platform's date format. Missing/unreadable renders as `—`. */
export function formatDate(value: string | number | Date | null | undefined): string {
  const parts = partsOf(value);
  if (!parts) return NOTHING;
  return `${pad(parts.day)}/${MONTHS[parts.month - 1]}/${pad(parts.year % 100)}`;
}

/** `14:05` — 24-hour, Lagos-local, seconds dropped. A date-only value has no time. */
export function formatTime(value: string | number | Date | null | undefined): string {
  const parts = partsOf(value);
  if (!parts || !parts.hasTime) return NOTHING;
  return `${pad(parts.hour)}:${pad(parts.minute)}`;
}

/**
 * `30/Sep/26, 14:05` — the date and time together, where both matter.
 * A date-only value renders as just the date: an invented `00:00` would be a
 * precise-looking claim about something that was never recorded.
 */
export function formatDateTime(value: string | number | Date | null | undefined): string {
  const parts = partsOf(value);
  if (!parts) return NOTHING;
  if (!parts.hasTime) return formatDate(value);
  return `${formatDate(value)}, ${pad(parts.hour)}:${pad(parts.minute)}`;
}
