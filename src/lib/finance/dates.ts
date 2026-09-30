// ============================================================================
// Finance — school-local (Africa/Lagos) calendar dates (pure, client-safe)
// Nigeria is UTC+1 year-round with no DST, so the shift is a constant.
// "Today" for a school must be its local day, not UTC — a payment recorded at
// 23:30 Lagos is 22:30 UTC the SAME day, while 00:30 Lagos is 23:30 UTC the
// PREVIOUS day. paid_on stores the Lagos calendar date once at recording time.
// ============================================================================

const LAGOS_OFFSET_MS = 60 * 60 * 1000; // UTC+1

/** Convert any parseable timestamp to the Africa/Lagos calendar date (YYYY-MM-DD). */
export function lagosDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return todayLocal();
  return new Date(d.getTime() + LAGOS_OFFSET_MS).toISOString().slice(0, 10);
}

/** Today's school-local date (YYYY-MM-DD). */
export function todayLocal(): string {
  return new Date(Date.now() + LAGOS_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * The paid_on value for a payment being recorded.
 *  - A date-only picker value ("2026-09-06") keeps that exact calendar date
 *    (the day the finance officer selected).
 *  - A full timestamp is converted to the school-local calendar date.
 *  - Missing/invalid input falls back to the school-local today.
 */
export function paidOnDate(rawPaidAt?: string | null): string {
  const raw = (rawPaidAt || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  if (!raw) return todayLocal();
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return todayLocal();
  return new Date(d.getTime() + LAGOS_OFFSET_MS).toISOString().slice(0, 10);
}
