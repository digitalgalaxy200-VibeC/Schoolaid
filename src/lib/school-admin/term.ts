/**
 * "Which term are we in, and what week is it?"
 *
 * Schools think in terms, not in months, so the admin shell shows the active
 * session/term and the week of term on every screen. The arithmetic is kept
 * here — pure, timezone-explicit and testable — because a week counter that is
 * one behind is the kind of bug nobody notices until a principal does.
 *
 * Dates are the database's date-only strings (`YYYY-MM-DD`). They are read as
 * UTC midnights so no local offset can shift the day, matching `src/lib/dates`.
 */

export type AcademicTerm = {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_active?: boolean;
};

export type AcademicSession = {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_active?: boolean;
  terms?: AcademicTerm[];
};

export type TermProgress = {
  /** 1-based week of term. */
  week: number;
  totalWeeks: number;
  /** Whole days left, inclusive of today. 0 once the term has ended. */
  daysRemaining: number;
  status: "upcoming" | "active" | "ended";
};

const DAY_MS = 86_400_000;
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})/;

/** UTC midnight for a date-only string, or null when it is unreadable. */
function toUtcDay(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = DATE_ONLY.exec(value.trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const stamp = Date.UTC(year, month - 1, day);
  const check = new Date(stamp);
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    return null;
  }
  return stamp;
}

/**
 * Today's date in the school's calendar (Africa/Lagos), as `YYYY-MM-DD`.
 *
 * The platform already treats Lagos as the school calendar; using the browser's
 * local date here would make a school on the wrong side of midnight see a
 * different week from the one the server reports.
 */
export function schoolTodayISO(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function getTermProgress(
  startDate: string,
  endDate: string,
  todayISO: string,
): TermProgress | null {
  const start = toUtcDay(startDate);
  const end = toUtcDay(endDate);
  const today = toUtcDay(todayISO);
  if (start === null || end === null || today === null || end < start) return null;

  const totalDays = Math.floor((end - start) / DAY_MS) + 1;
  const totalWeeks = Math.max(1, Math.ceil(totalDays / 7));

  if (today < start) {
    return { week: 1, totalWeeks, daysRemaining: totalDays, status: "upcoming" };
  }
  if (today > end) {
    return { week: totalWeeks, totalWeeks, daysRemaining: 0, status: "ended" };
  }

  return {
    week: Math.floor((today - start) / DAY_MS / 7) + 1,
    totalWeeks,
    daysRemaining: Math.floor((end - today) / DAY_MS),
    status: "active",
  };
}

function isWithin(term: AcademicTerm, todayISO: string): boolean {
  const start = toUtcDay(term.start_date);
  const end = toUtcDay(term.end_date);
  const today = toUtcDay(todayISO);
  return start !== null && end !== null && today !== null && today >= start && today <= end;
}

export type CurrentTermInfo = {
  session: AcademicSession;
  term: AcademicTerm;
  progress: TermProgress;
};

/** "2026/2027" → "2026/27"; anything else is left exactly as the school wrote it. */
export function shortSession(name?: string | null): string | null {
  if (!name) return null;
  const trimmed = name.trim();
  if (!trimmed) return null;
  const match = /^(\d{4})\s*\/\s*(\d{4})$/.exec(trimmed);
  return match ? `${match[1]}/${match[2].slice(2)}` : trimmed;
}

/**
 * The label every term picker should print: "First Term 2026/27".
 *
 * Terms from different sessions share names, so a pill reading "First Term"
 * could be this year's or one from three years ago. The session is what makes it
 * unambiguous, and it is short enough to stay a pill.
 */
export function termLabel(term: { name: string; session_name?: string | null }): string {
  const session = shortSession(term.session_name);
  return session ? `${term.name} ${session}` : term.name;
}

/**
 * The term a bursar means by "this term", from a flat list:
 *   1. the term flagged active,
 *   2. the term whose dates contain today,
 *   3. the NEWEST term on file.
 *
 * Step 3 used to be "the first term returned", which for a list ordered by
 * start_date is the oldest term the school ever created — so a school between
 * terms opened Finance on a blank year-one term.
 */
export function pickCurrentTerm<T extends AcademicTerm>(
  terms: T[] | null | undefined,
  todayISO: string,
): T | null {
  if (!Array.isArray(terms) || terms.length === 0) return null;

  const flagged = terms.find((t) => t.is_active);
  if (flagged) return flagged;

  const containing = terms.find((t) => isWithin(t, todayISO));
  if (containing) return containing;

  return [...terms].sort((a, b) =>
    a.start_date < b.start_date ? 1 : a.start_date > b.start_date ? -1 : 0,
  )[0];
}

export type TermActivity = {
  term_id: string;
  bills: number;
  payments: number;
};

/**
 * The term a bursar means by "this term", when some terms have no money at all.
 *
 * The active flag can be stale — a school that forgets to flip it lands the
 * bursar on a term with no bills while last term's receipts sit one pill away.
 * So a term with actual activity wins first; only when no term has activity do
 * we fall back to the shared active/date/newest resolver.
 */
export function pickFinanceTerm<T extends AcademicTerm>(
  terms: T[] | null | undefined,
  activity: TermActivity[] | null | undefined,
  todayISO: string,
): T | null {
  if (!Array.isArray(terms) || terms.length === 0) return null;

  const activeTermIds = new Set(
    (activity ?? [])
      .filter((row) => row.bills > 0 || row.payments > 0)
      .map((row) => row.term_id),
  );
  const withData = terms.filter((term) => activeTermIds.has(term.id));

  if (withData.length > 0) {
    const containing = withData.find((term) => isWithin(term, todayISO));
    if (containing) return containing;

    const flagged = withData.find((term) => term.is_active);
    if (flagged) return flagged;

    return [...withData].sort((a, b) =>
      a.start_date < b.start_date ? 1 : a.start_date > b.start_date ? -1 : 0,
    )[0];
  }

  return pickCurrentTerm(terms, todayISO);
}

/**
 * The session/term an admin should see.
 *
 * ORDER MATTERS, AND IT STARTS WITH THE TERM. The finance screens ask the
 * database which term is flagged active; if the header resolved a different one
 * the two screens disagreed, and the one that was wrong was the header: it began
 * from the active SESSION, whose terms can all be finished. The active term now
 * decides, and its session follows it, so both screens answer the same question
 * the same way.
 */
export function resolveCurrentTerm(
  sessions: AcademicSession[] | null | undefined,
  todayISO: string,
): CurrentTermInfo | null {
  if (!Array.isArray(sessions) || sessions.length === 0) return null;

  const allTerms = sessions.flatMap((s) =>
    (Array.isArray(s.terms) ? s.terms : []).map((term) => ({ session: s, term })),
  );

  // 1. A term explicitly flagged active defines the current session too.
  const flagged = allTerms.find((entry) => entry.term.is_active);
  if (flagged) {
    const progress = getTermProgress(flagged.term.start_date, flagged.term.end_date, todayISO);
    if (progress) return { session: flagged.session, term: flagged.term, progress };
  }

  // 2. Otherwise fall back to the active session (or the newest on file).
  const session = sessions.find((s) => s.is_active) ?? sessions[0];
  const terms = Array.isArray(session.terms) ? session.terms : [];
  if (terms.length === 0) return null;

  const term = terms.find((t) => isWithin(t, todayISO)) ?? terms[0];

  const progress =
    getTermProgress(term.start_date, term.end_date, todayISO) ??
    getTermProgress(session.start_date, session.end_date, todayISO);
  if (!progress) return null;

  return { session, term, progress };
}
