import { describe, it, expect } from "vitest";
import {
  summariseAttemptHistory,
  planOfficialFlags,
  decideOfficialOverride,
  validateCorrectionReason,
  validateCorrectedScore,
  validateAnswerAward,
  MAX_REASON_LENGTH,
  MIN_REASON_LENGTH,
  type AttemptRow,
} from "../corrections";

const attempt = (over: Partial<AttemptRow> = {}): AttemptRow => ({
  id: "a1",
  attempt_number: 1,
  status: "marked",
  submitted_at: "2026-09-18T10:00:00.000Z",
  marked_at: "2026-09-18T11:00:00.000Z",
  ...over,
});

describe("summariseAttemptHistory", () => {
  const attempts: AttemptRow[] = [
    attempt({ id: "a1", attempt_number: 1, submitted_at: "2026-09-18T10:00:00.000Z" }),
    attempt({ id: "a2", attempt_number: 2, submitted_at: "2026-09-20T10:00:00.000Z" }),
    attempt({ id: "a3", attempt_number: 3, submitted_at: "2026-09-22T10:00:00.000Z" }),
  ];

  const results = [
    { attempt_id: "a1", total_score: 48, percentage: 62, is_official: false },
    { attempt_id: "a2", total_score: 63, percentage: 74, is_official: false },
    { attempt_id: "a3", total_score: 71, percentage: 81, is_official: true },
  ];

  it("returns every attempt, oldest first, with nothing collapsed", () => {
    const history = summariseAttemptHistory(attempts, results);
    expect(history.map((h) => h.attemptNumber)).toEqual([1, 2, 3]);
    expect(history.map((h) => h.totalScore)).toEqual([48, 63, 71]);
  });

  it("marks exactly the official attempt as official", () => {
    const history = summariseAttemptHistory(attempts, results);
    expect(history.filter((h) => h.isOfficial).map((h) => h.attemptNumber)).toEqual([3]);
  });

  it("keeps an attempt with no result yet in the history", () => {
    const history = summariseAttemptHistory(
      [...attempts, attempt({ id: "a4", attempt_number: 4, status: "in_progress" })],
      results,
    );
    const fourth = history.find((h) => h.attemptNumber === 4);
    expect(fourth).toBeDefined();
    expect(fourth?.totalScore).toBeNull();
    expect(fourth?.isOfficial).toBe(false);
  });

  it("sorts by attempt number even when given out of order", () => {
    const history = summariseAttemptHistory([attempts[2], attempts[0], attempts[1]], results);
    expect(history.map((h) => h.attemptNumber)).toEqual([1, 2, 3]);
  });

  it("returns an empty history for a student with no attempts", () => {
    expect(summariseAttemptHistory([], [])).toEqual([]);
  });
});

describe("planOfficialFlags", () => {
  const results = [
    { attempt_id: "a1", is_official: false },
    { attempt_id: "a2", is_official: true },
    { attempt_id: "a3", is_official: false },
  ];

  it("moves the flag to the chosen attempt", () => {
    const flags = planOfficialFlags(results, "a1");
    expect(flags).toEqual([
      { attempt_id: "a1", is_official: true },
      { attempt_id: "a2", is_official: false },
    ]);
  });

  it("emits nothing when the choice does not change", () => {
    expect(planOfficialFlags(results, "a2")).toEqual([]);
  });

  it("clears every flag when there is no official attempt", () => {
    expect(planOfficialFlags(results, null)).toEqual([{ attempt_id: "a2", is_official: false }]);
  });

  it("never leaves two attempts official", () => {
    const flags = planOfficialFlags(results, "a3");
    const finalState = results.map((r) => {
      const change = flags.find((f) => f.attempt_id === r.attempt_id);
      return change ? change.is_official : r.is_official;
    });
    expect(finalState.filter(Boolean)).toHaveLength(1);
  });
});

describe("decideOfficialOverride", () => {
  const attempts = [
    attempt({ id: "a1", attempt_number: 1, status: "marked" }),
    attempt({ id: "a2", attempt_number: 2, status: "submitted" }),
    attempt({ id: "a3", attempt_number: 3, status: "marked" }),
  ];

  it("allows choosing a marked attempt", () => {
    expect(
      decideOfficialOverride({ attempts, attemptId: "a1", currentOfficialAttemptId: "a3" }),
    ).toEqual({ allowed: true });
  });

  it("refuses an attempt that is not part of this student's history", () => {
    const d = decideOfficialOverride({ attempts, attemptId: "nope", currentOfficialAttemptId: "a3" });
    expect(d.allowed).toBe(false);
    expect(d.allowed === false && d.reason).toMatch(/does not belong/);
  });

  it("refuses an unmarked attempt, which has no final score to promote", () => {
    const d = decideOfficialOverride({ attempts, attemptId: "a2", currentOfficialAttemptId: "a3" });
    expect(d.allowed).toBe(false);
    expect(d.allowed === false && d.reason).toMatch(/only a marked attempt/);
  });

  it("refuses a no-op move", () => {
    const d = decideOfficialOverride({ attempts, attemptId: "a3", currentOfficialAttemptId: "a3" });
    expect(d.allowed).toBe(false);
    expect(d.allowed === false && d.reason).toMatch(/already the official attempt/);
  });

  it("allows setting an official attempt when none is set", () => {
    expect(
      decideOfficialOverride({ attempts, attemptId: "a1", currentOfficialAttemptId: null }),
    ).toEqual({ allowed: true });
  });
});

describe("validateCorrectionReason", () => {
  it("requires a reason", () => {
    for (const bad of [null, undefined, "", "   "]) {
      const r = validateCorrectionReason(bad);
      expect(r.ok).toBe(false);
    }
  });

  it("rejects a keystroke masquerading as a reason", () => {
    const r = validateCorrectionReason("x");
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toMatch(new RegExp(`${MIN_REASON_LENGTH} characters`));
  });

  it("accepts a real reason and trims it", () => {
    const r = validateCorrectionReason("  Mis-keyed: 24 was entered instead of 42.  ");
    expect(r).toEqual({ ok: true, reason: "Mis-keyed: 24 was entered instead of 42." });
  });

  it("rejects an essay", () => {
    expect(validateCorrectionReason("y".repeat(MAX_REASON_LENGTH + 1)).ok).toBe(false);
  });
});

describe("validateCorrectedScore", () => {
  it("allows a score within the paper's maximum", () => {
    expect(validateCorrectedScore({ newScore: 24, maxScore: 30 })).toEqual({ allowed: true });
    expect(validateCorrectedScore({ newScore: 30, maxScore: 30 })).toEqual({ allowed: true });
    expect(validateCorrectedScore({ newScore: 0, maxScore: 30 })).toEqual({ allowed: true });
  });

  it("refuses a negative score", () => {
    expect(validateCorrectedScore({ newScore: -1, maxScore: 30 }).allowed).toBe(false);
  });

  it("refuses a score above the maximum", () => {
    const d = validateCorrectedScore({ newScore: 31, maxScore: 30 });
    expect(d.allowed).toBe(false);
    expect(d.allowed === false && d.reason).toMatch(/maximum of 30/);
  });

  it("treats a null score as 'not changing the score'", () => {
    expect(validateCorrectedScore({ newScore: null, maxScore: 30 })).toEqual({ allowed: true });
  });

  it("refuses a non-finite score", () => {
    expect(validateCorrectedScore({ newScore: NaN, maxScore: 30 }).allowed).toBe(false);
    expect(validateCorrectedScore({ newScore: Infinity, maxScore: 30 }).allowed).toBe(false);
  });
});

describe("validateAnswerAward", () => {
  it("allows an award up to the question's marks", () => {
    expect(validateAnswerAward({ awarded: 5, questionMarks: 5 })).toEqual({ allowed: true });
  });

  it("refuses an award bigger than the question is worth", () => {
    const d = validateAnswerAward({ awarded: 50, questionMarks: 5 });
    expect(d.allowed).toBe(false);
    expect(d.allowed === false && d.reason).toMatch(/5 mark/);
  });

  it("refuses a negative award", () => {
    expect(validateAnswerAward({ awarded: -1, questionMarks: 5 }).allowed).toBe(false);
  });

  it("allows clearing an award with null", () => {
    expect(validateAnswerAward({ awarded: null, questionMarks: 5 })).toEqual({ allowed: true });
  });
});
