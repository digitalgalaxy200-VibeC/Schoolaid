import { describe, it, expect } from "vitest";
import {
  decideStartAttempt,
  decideAnswerWrite,
  decideSubmit,
  nextAttemptNumber,
  planMarking,
  resolveOfficialAttempt,
  shouldRecomputeOfficialScore,
  type AssessmentRuntime,
  type AttemptSummary,
  type AnswerRow,
} from "../delivery";
import type { AttemptQuestion } from "../attempt";

const NOW = new Date("2026-09-22T10:00:00.000Z");

const assessment: AssessmentRuntime = {
  id: "asm-1",
  status: "published",
  max_attempts: 3,
  time_limit_minutes: 60,
  official_attempt_rule: "latest",
};

const attempt = (over: Partial<AttemptSummary> = {}): AttemptSummary => ({
  id: "att-1",
  attempt_number: 1,
  status: "in_progress",
  started_at: "2026-09-22T09:30:00.000Z",
  expires_at: "2026-09-22T10:30:00.000Z",
  submitted_at: null,
  ...over,
});

/**
 * A question as frozen into an attempt, plus the row id that answers point at.
 */
const question = (
  over: Partial<AttemptQuestion & { attempt_question_id: string }> = {},
): AttemptQuestion & { attempt_question_id: string } => ({
  attempt_question_id: "aq-1",
  question_id: "q-1",
  display_order: 0,
  question_type: "mcq",
  question_text: "2 + 2 = ?",
  options_snapshot: [
    { option_id: "opt-4", label: "A", option_text: "4" },
    { option_id: "opt-5", label: "B", option_text: "5" },
  ],
  correct_option_id: "opt-4",
  model_answer: null,
  marking_rubric: null,
  marks: 2,
  ...over,
});

const theory = (id: string, marks: number) =>
  question({
    attempt_question_id: id,
    question_id: id,
    question_type: "theory",
    question_text: "Explain.",
    options_snapshot: [],
    correct_option_id: null,
    marks,
  });

// ── starting ────────────────────────────────────────────────────────────────

describe("decideStartAttempt", () => {
  it("allows a first attempt on a published assessment", () => {
    expect(decideStartAttempt({ assessment, attempts: [], now: NOW })).toEqual({ allowed: true });
  });

  it("refuses when the assessment is not published", () => {
    const d = decideStartAttempt({
      assessment: { ...assessment, status: "draft" },
      attempts: [],
      now: NOW,
    });
    expect(d.allowed).toBe(false);
    expect(d.allowed === false && d.code).toBe("not_published");
  });

  it("refuses a second attempt while one is genuinely in progress, and offers a resume", () => {
    const live = attempt({ expires_at: "2026-09-22T10:30:00.000Z" });
    const d = decideStartAttempt({ assessment, attempts: [live], now: NOW });
    expect(d.allowed).toBe(false);
    expect(d.allowed === false && d.code).toBe("attempt_in_progress");
    expect(d.allowed === false && d.resume?.id).toBe("att-1");
  });

  it("does NOT treat an expired in-progress attempt as a blocker", () => {
    // The student lost that time; refusing a new attempt would strand them.
    const expired = attempt({ expires_at: "2026-09-22T09:45:00.000Z" });
    expect(decideStartAttempt({ assessment, attempts: [expired], now: NOW })).toEqual({
      allowed: true,
    });
  });

  it("refuses once every attempt has been used", () => {
    const used = [1, 2, 3].map((n) =>
      attempt({ id: `att-${n}`, attempt_number: n, status: "marked", expires_at: null }),
    );
    const d = decideStartAttempt({ assessment, attempts: used, now: NOW });
    expect(d.allowed).toBe(false);
    expect(d.allowed === false && d.code).toBe("no_attempts_left");
  });

  it("does not count an invalidated attempt against the limit", () => {
    const attempts = [
      attempt({ id: "att-1", attempt_number: 1, status: "invalidated", expires_at: null }),
      attempt({ id: "att-2", attempt_number: 2, status: "invalidated", expires_at: null }),
      attempt({ id: "att-3", attempt_number: 3, status: "invalidated", expires_at: null }),
    ];
    // max_attempts is 3; all three were voided, so the student may try again.
    expect(decideStartAttempt({ assessment, attempts, now: NOW })).toEqual({ allowed: true });
  });

  it("still counts submitted attempts against the limit", () => {
    const attempts = [1, 2, 3].map((n) =>
      attempt({ id: `att-${n}`, attempt_number: n, status: "submitted", expires_at: null }),
    );
    expect(decideStartAttempt({ assessment, attempts, now: NOW }).allowed).toBe(false);
  });

  it("treats an attempt with no time limit as never expiring", () => {
    const open = attempt({ expires_at: null });
    const d = decideStartAttempt({ assessment, attempts: [open], now: NOW });
    expect(d.allowed).toBe(false);
    expect(d.allowed === false && d.code).toBe("attempt_in_progress");
  });
});

describe("nextAttemptNumber", () => {
  it("starts at 1", () => {
    expect(nextAttemptNumber([])).toBe(1);
  });

  it("continues past the highest number, never reusing one", () => {
    expect(nextAttemptNumber([{ attempt_number: 1 }, { attempt_number: 2 }])).toBe(3);
  });

  it("fills no gaps, so a voided attempt's number is never recycled", () => {
    expect(nextAttemptNumber([{ attempt_number: 1 }, { attempt_number: 3 }])).toBe(4);
  });
});

// ── writing and submitting ──────────────────────────────────────────────────

describe("decideAnswerWrite", () => {
  it("allows a write inside the window", () => {
    expect(decideAnswerWrite({ attempt: attempt(), now: NOW })).toEqual({ allowed: true });
  });

  it("refuses a write after the server-side expiry", () => {
    const d = decideAnswerWrite({
      attempt: attempt({ expires_at: "2026-09-22T09:59:59.000Z" }),
      now: NOW,
    });
    expect(d.allowed).toBe(false);
    expect(d.allowed === false && d.code).toBe("expired");
  });

  it("treats the expiry instant itself as closed", () => {
    const d = decideAnswerWrite({
      attempt: attempt({ expires_at: NOW.toISOString() }),
      now: NOW,
    });
    expect(d.allowed === false && d.code).toBe("expired");
  });

  it("refuses a write to a submitted attempt", () => {
    const d = decideAnswerWrite({ attempt: attempt({ status: "submitted" }), now: NOW });
    expect(d.allowed).toBe(false);
    expect(d.allowed === false && d.code).toBe("attempt_closed");
  });

  it("allows writes when the attempt has no time limit", () => {
    expect(decideAnswerWrite({ attempt: attempt({ expires_at: null }), now: NOW }).allowed).toBe(
      true,
    );
  });
});

describe("decideSubmit", () => {
  it("accepts a submit for an open attempt", () => {
    expect(decideSubmit({ attempt: attempt(), now: NOW })).toEqual({ allowed: true });
  });

  it("accepts a submit that lands just after expiry, so saved work is not lost", () => {
    const d = decideSubmit({
      attempt: attempt({ expires_at: "2026-09-22T09:59:00.000Z" }),
      now: NOW,
    });
    expect(d.allowed).toBe(true);
  });

  it("refuses a second submit", () => {
    const d = decideSubmit({ attempt: attempt({ status: "submitted" }), now: NOW });
    expect(d.allowed).toBe(false);
    expect(d.allowed === false && d.code).toBe("already_submitted");
  });

  it("refuses submitting an invalidated attempt", () => {
    const d = decideSubmit({ attempt: attempt({ status: "invalidated" }), now: NOW });
    expect(d.allowed === false && d.code).toBe("attempt_closed");
  });
});

// ── marking ─────────────────────────────────────────────────────────────────

describe("planMarking", () => {
  const answer = (over: Partial<AnswerRow> = {}): AnswerRow => ({
    attempt_question_id: "aq-1",
    selected_option_id: "opt-4",
    answer_text: null,
    awarded_marks: null,
    ...over,
  });

  it("awards full marks for a correct objective answer", () => {
    const plan = planMarking({ questions: [question()], answers: [answer()] });
    expect(plan.score.totalScore).toBe(2);
    expect(plan.score.maxScore).toBe(2);
    expect(plan.score.percentage).toBe(100);
    expect(plan.pendingHuman).toBe(0);
  });

  it("awards nothing for a wrong objective answer", () => {
    const plan = planMarking({
      questions: [question()],
      answers: [answer({ selected_option_id: "opt-5" })],
    });
    expect(plan.score.totalScore).toBe(0);
    expect(plan.pendingHuman).toBe(0);
  });

  it("grades by option identity, so a reordered display still counts", () => {
    // The same option id, presented in a different position with a different label.
    const reordered = question({
      options_snapshot: [
        { option_id: "opt-5", label: "A", option_text: "5" },
        { option_id: "opt-4", label: "B", option_text: "4" },
      ],
    });
    const plan = planMarking({ questions: [reordered], answers: [answer()] });
    expect(plan.score.totalScore).toBe(2);
  });

  it("scores an unanswered objective question zero without leaving it pending", () => {
    const plan = planMarking({
      questions: [question()],
      answers: [answer({ selected_option_id: null })],
    });
    expect(plan.score.totalScore).toBe(0);
    expect(plan.pendingHuman).toBe(0);
    expect(plan.rows[0].needsHuman).toBe(false);
  });

  it("handles an objective question that has no answer row at all", () => {
    const plan = planMarking({ questions: [question()], answers: [] });
    expect(plan.score.totalScore).toBe(0);
    expect(plan.pendingHuman).toBe(0);
  });

  it("leaves an unmarked theory answer pending for a human", () => {
    const plan = planMarking({ questions: [theory("aq-t", 5)], answers: [] });
    expect(plan.pendingHuman).toBe(1);
    expect(plan.rows[0].needsHuman).toBe(true);
    expect(plan.score.subjectiveScore).toBe(0);
    expect(plan.score.hasSubjective).toBe(true);
  });

  it("counts a teacher's theory award once it exists", () => {
    const plan = planMarking({
      questions: [theory("aq-t", 5)],
      answers: [
        { attempt_question_id: "aq-t", selected_option_id: null, answer_text: "…", awarded_marks: 3 },
      ],
    });
    expect(plan.pendingHuman).toBe(0);
    expect(plan.score.subjectiveScore).toBe(3);
    expect(plan.score.percentage).toBe(60);
  });

  it("splits objective and subjective and totals both", () => {
    const plan = planMarking({
      questions: [question(), theory("aq-t", 5)],
      answers: [
        { attempt_question_id: "aq-1", selected_option_id: "opt-4", answer_text: null, awarded_marks: null },
        { attempt_question_id: "aq-t", selected_option_id: null, answer_text: "…", awarded_marks: 3 },
      ],
    });
    expect(plan.score.objectiveScore).toBe(2);
    expect(plan.score.subjectiveScore).toBe(3);
    expect(plan.score.totalScore).toBe(5);
    expect(plan.score.maxScore).toBe(7);
    expect(plan.score.percentage).toBe(71.43);
  });

  it("never auto-marks theory, even when the frozen key has a model answer", () => {
    const withModel = { ...theory("aq-t", 5), model_answer: "Plants convert light." };
    const plan = planMarking({
      questions: [withModel],
      answers: [
        { attempt_question_id: "aq-t", selected_option_id: null, answer_text: "Plants convert light.", awarded_marks: null },
      ],
    });
    expect(plan.pendingHuman).toBe(1);
    expect(plan.rows[0].subjectiveAwarded).toBeNull();
  });

  it("returns a null percentage when nothing is worth any marks", () => {
    const plan = planMarking({ questions: [], answers: [] });
    expect(plan.score.maxScore).toBe(0);
    expect(plan.score.percentage).toBeNull();
  });
});

// ── official attempt ────────────────────────────────────────────────────────

describe("resolveOfficialAttempt", () => {
  const candidates = [
    { id: "a1", attempt_number: 1, total_score: 48, status: "marked" },
    { id: "a2", attempt_number: 2, total_score: 63, status: "marked" },
    { id: "a3", attempt_number: 3, total_score: 20, status: "marked" },
  ];

  it("picks the latest attempt by default (PD-4)", () => {
    expect(resolveOfficialAttempt({ candidates, rule: "latest" })).toBe("a3");
  });

  it("picks the highest score for 'best'", () => {
    expect(resolveOfficialAttempt({ candidates, rule: "best" })).toBe("a2");
  });

  it("picks the earliest attempt for 'first'", () => {
    expect(resolveOfficialAttempt({ candidates, rule: "first" })).toBe("a1");
  });

  it("returns null for a manual rule so a human must choose", () => {
    expect(resolveOfficialAttempt({ candidates, rule: "manual" })).toBeNull();
  });

  it("never promotes an attempt that has not been marked", () => {
    const mixed = [
      { id: "a1", attempt_number: 1, total_score: 48, status: "marked" },
      { id: "a2", attempt_number: 2, total_score: 0, status: "submitted" },
    ];
    expect(resolveOfficialAttempt({ candidates: mixed, rule: "latest" })).toBe("a1");
  });

  it("returns null when nothing is marked", () => {
    expect(
      resolveOfficialAttempt({
        candidates: [{ id: "a1", attempt_number: 1, total_score: 0, status: "submitted" }],
        rule: "latest",
      }),
    ).toBeNull();
  });
});

describe("shouldRecomputeOfficialScore", () => {
  const attempts = [
    { id: "a1", attempt_number: 1, total_score: 48, status: "marked" },
    { id: "a2", attempt_number: 2, total_score: 63, status: "marked" },
  ];

  it("recomputes when a newer marked attempt changes the official one", () => {
    expect(
      shouldRecomputeOfficialScore({
        assessment,
        attempts,
        currentOfficialAttemptId: "a1",
        reportCardLocked: false,
      }),
    ).toEqual({ recompute: true, attemptId: "a2" });
  });

  it("does not recompute when the official attempt has not moved", () => {
    const r = shouldRecomputeOfficialScore({
      assessment,
      attempts,
      currentOfficialAttemptId: "a2",
      reportCardLocked: false,
    });
    expect(r.recompute).toBe(false);
    expect(r.recompute === false && r.reason).toMatch(/not changed/);
  });

  it("refuses to move an official score while the report card is published (Contradiction B)", () => {
    const r = shouldRecomputeOfficialScore({
      assessment,
      attempts,
      currentOfficialAttemptId: "a1",
      reportCardLocked: true,
    });
    expect(r.recompute).toBe(false);
    expect(r.recompute === false && r.reason).toMatch(/locked/);
  });

  it("never silently overrides a manual choice", () => {
    const r = shouldRecomputeOfficialScore({
      assessment: { ...assessment, official_attempt_rule: "manual" },
      attempts,
      currentOfficialAttemptId: "a1",
      reportCardLocked: false,
    });
    expect(r.recompute).toBe(false);
    expect(r.recompute === false && r.reason).toMatch(/manually/);
  });

  it("clears the official flag when the previous official attempt is no longer eligible", () => {
    const r = shouldRecomputeOfficialScore({
      assessment,
      attempts: [{ id: "a1", attempt_number: 1, total_score: 48, status: "invalidated" }],
      currentOfficialAttemptId: "a1",
      reportCardLocked: false,
    });
    expect(r).toEqual({ recompute: true, attemptId: null });
  });
});
