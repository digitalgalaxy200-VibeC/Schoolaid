import { describe, expect, it } from "vitest";
import {
  getTermProgress,
  pickCurrentTerm,
  resolveCurrentTerm,
  schoolTodayISO,
  shortSession,
  termLabel,
  type AcademicSession,
} from "@/lib/school-admin/term";

describe("getTermProgress", () => {
  const start = "2026-09-07";
  const end = "2026-09-20"; // 14 days, two weeks

  it("counts the first day as week 1", () => {
    expect(getTermProgress(start, end, "2026-09-07")).toEqual({
      week: 1,
      totalWeeks: 2,
      daysRemaining: 13,
      status: "active",
    });
  });

  it("rolls to week 2 on day 8", () => {
    expect(getTermProgress(start, end, "2026-09-14")).toMatchObject({
      week: 2,
      totalWeeks: 2,
      status: "active",
    });
  });

  it("reports the last day as the final week with no days left", () => {
    expect(getTermProgress(start, end, "2026-09-20")).toEqual({
      week: 2,
      totalWeeks: 2,
      daysRemaining: 0,
      status: "active",
    });
  });

  it("reports a term that has not started", () => {
    expect(getTermProgress(start, end, "2026-09-06")).toMatchObject({
      week: 1,
      status: "upcoming",
      daysRemaining: 14,
    });
  });

  it("reports a term that has ended", () => {
    expect(getTermProgress(start, end, "2026-09-21")).toMatchObject({
      week: 2,
      status: "ended",
      daysRemaining: 0,
    });
  });

  it("refuses a backwards range instead of inventing a week", () => {
    expect(getTermProgress(end, start, "2026-09-10")).toBeNull();
    expect(getTermProgress("not-a-date", end, "2026-09-10")).toBeNull();
  });
});

describe("resolveCurrentTerm", () => {
  const sessions: AcademicSession[] = [
    {
      id: "old",
      name: "2025/2026",
      start_date: "2025-09-01",
      end_date: "2026-07-31",
      is_active: false,
      terms: [
        { id: "old-1", name: "First Term", start_date: "2025-09-08", end_date: "2025-12-05" },
      ],
    },
    {
      id: "current",
      name: "2026/2027",
      start_date: "2026-09-01",
      end_date: "2027-07-31",
      is_active: true,
      terms: [
        { id: "first", name: "First Term", start_date: "2026-09-07", end_date: "2026-12-04" },
        { id: "second", name: "Second Term", start_date: "2027-01-05", end_date: "2027-03-26" },
      ],
    },
  ];

  it("prefers the flagged active session", () => {
    expect(resolveCurrentTerm(sessions, "2026-10-01")?.session.id).toBe("current");
  });

  it("falls back to the term whose dates contain today", () => {
    expect(resolveCurrentTerm(sessions, "2026-10-01")?.term.id).toBe("first");
    expect(resolveCurrentTerm(sessions, "2027-02-01")?.term.id).toBe("second");
  });

  it("honours an explicitly active term over the calendar", () => {
    const withActiveFlag = sessions.map((session) =>
      session.id === "current"
        ? {
            ...session,
            terms: session.terms?.map((term) => ({
              ...term,
              is_active: term.id === "second",
            })),
          }
        : session,
    );

    expect(resolveCurrentTerm(withActiveFlag, "2026-10-01")?.term.id).toBe("second");
  });

  it("returns nothing when the school has no sessions or terms", () => {
    expect(resolveCurrentTerm([], "2026-10-01")).toBeNull();
    expect(resolveCurrentTerm(null, "2026-10-01")).toBeNull();
    expect(
      resolveCurrentTerm(
        [{ id: "s", name: "2026/2027", start_date: "2026-09-01", end_date: "2027-07-31", terms: [] }],
        "2026-10-01",
      ),
    ).toBeNull();
  });
});

describe("schoolTodayISO", () => {
  it("uses the Lagos calendar, not UTC", () => {
    // 23:30 UTC is already the next day in Lagos (UTC+1).
    expect(schoolTodayISO(new Date("2026-09-06T23:30:00Z"))).toBe("2026-09-07");
    expect(schoolTodayISO(new Date("2026-09-06T22:30:00Z"))).toBe("2026-09-06");
  });
});

/**
 * The production bug this pins: the school's active SESSION was 2025/2026 (all
 * its terms finished) while the active TERM was 2026/2027 First Term. The header
 * began from the session and printed "Second Term (ended)"; Finance began from
 * the term and showed the real current term. One resolver now starts with the
 * term, and both screens follow it.
 */
describe("resolveCurrentTerm — the term flag wins", () => {
  const misaligned: AcademicSession[] = [
    {
      id: "old-session",
      name: "2025/2026",
      start_date: "2025-09-01",
      end_date: "2026-07-31",
      is_active: true, // the flag that was wrong
      terms: [
        {
          id: "old-second",
          name: "Second Term",
          start_date: "2026-01-12",
          end_date: "2026-04-10",
          is_active: false,
        },
      ],
    },
    {
      id: "new-session",
      name: "2026/2027",
      start_date: "2026-09-14",
      end_date: "2027-07-27",
      is_active: false,
      terms: [
        {
          id: "new-first",
          name: "First Term",
          start_date: "2026-09-14",
          end_date: "2026-12-11",
          is_active: true,
        },
      ],
    },
  ];

  it("reports the active term, not the active session's finished one", () => {
    const result = resolveCurrentTerm(misaligned, "2026-11-24");
    expect(result?.term.id).toBe("new-first");
    expect(result?.session.id).toBe("new-session");
    expect(result?.progress.status).toBe("active");
  });
});

describe("pickCurrentTerm", () => {
  const terms = [
    { id: "t1", name: "First Term", start_date: "2024-09-10", end_date: "2024-12-10", is_active: false },
    { id: "t2", name: "Second Term", start_date: "2025-01-10", end_date: "2025-04-10", is_active: false },
    { id: "t3", name: "First Term", start_date: "2026-09-14", end_date: "2026-12-11", is_active: true },
  ];

  it("uses the flagged term", () => {
    expect(pickCurrentTerm(terms, "2026-11-24")?.id).toBe("t3");
  });

  it("uses the term containing today when none is flagged", () => {
    const noFlag = terms.map((t) => ({ ...t, is_active: false }));
    expect(pickCurrentTerm(noFlag, "2025-02-01")?.id).toBe("t2");
  });

  it("falls back to the NEWEST term, never the oldest", () => {
    const noFlag = terms.map((t) => ({ ...t, is_active: false }));
    // Between terms: nothing contains today. Year one would be the old bug.
    expect(pickCurrentTerm(noFlag, "2027-08-01")?.id).toBe("t3");
  });

  it("returns null for an empty or missing list", () => {
    expect(pickCurrentTerm([], "2026-11-24")).toBeNull();
    expect(pickCurrentTerm(null, "2026-11-24")).toBeNull();
  });
});

describe("termLabel", () => {
  it("adds a short session so two 'First Term's can be told apart", () => {
    expect(termLabel({ name: "First Term", session_name: "2026/2027" })).toBe("First Term 2026/27");
  });

  it("leaves an unusual session name as the school wrote it", () => {
    expect(termLabel({ name: "First Term", session_name: "Year 2026-27" })).toBe("First Term Year 2026-27");
  });

  it("does not invent a session when there is none", () => {
    expect(termLabel({ name: "First Term", session_name: null })).toBe("First Term");
  });

  it("shortSession only shortens year pairs", () => {
    expect(shortSession("2026/2027")).toBe("2026/27");
    expect(shortSession(" 2026 / 2027 ")).toBe("2026/27");
    expect(shortSession("Third Term")).toBe("Third Term");
    expect(shortSession(null)).toBeNull();
  });
});
