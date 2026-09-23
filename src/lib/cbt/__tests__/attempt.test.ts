import { describe, it, expect } from "vitest";
import {
  buildAttemptSnapshot,
  toStudentView,
  gradeObjectiveAnswer,
  computeAttemptExpiry,
  isAttemptExpired,
  totalAttempt,
  selectOfficialAttempt,
  canStartAnotherAttempt,
  type OptionSource,
  type QuestionSource,
  type AnswerKeySource,
} from "../attempt";

// ── fixtures ────────────────────────────────────────────────────────────────

const questions: QuestionSource[] = [
  { id: "q1", question_type: "mcq", question_text: "2 + 2 = ?", marks: 2 },
  { id: "q2", question_type: "true_false", question_text: "The sky is green.", marks: 1 },
  { id: "q3", question_type: "theory", question_text: "Explain photosynthesis.", marks: 5 },
];

const options: OptionSource[] = [
  // deliberately out of order, and q1's labels do NOT line up with correctness
  { id: "o1c", question_id: "q1", label: "C", option_text: "4", display_order: 2 },
  { id: "o1a", question_id: "q1", label: "A", option_text: "3", display_order: 0 },
  { id: "o1b", question_id: "q1", label: "B", option_text: "5", display_order: 1 },
  { id: "o2a", question_id: "q2", label: "True", option_text: "True", display_order: 0 },
  { id: "o2b", question_id: "q2", label: "False", option_text: "False", display_order: 1 },
];

const answerKeys: AnswerKeySource[] = [
  { question_id: "q1", correct_option_id: "o1c", model_answer: null, marking_rubric: null },
  { question_id: "q2", correct_option_id: "o2b", model_answer: null, marking_rubric: null },
  {
    question_id: "q3",
    correct_option_id: null,
    model_answer: "Chlorophyll...",
    marking_rubric: "3 marks for process",
  },
];

const build = (overrides: Record<string, number> = {}) =>
  buildAttemptSnapshot({
    questionIds: ["q1", "q2", "q3"],
    questions,
    options,
    answerKeys,
    marksOverrides: overrides,
  });

// ── snapshot ────────────────────────────────────────────────────────────────

describe("buildAttemptSnapshot", () => {
  it("preserves the presented order of questions", () => {
    const snap = build();
    expect(snap.map((q) => q.question_id)).toEqual(["q1", "q2", "q3"]);
    expect(snap.map((q) => q.display_order)).toEqual([0, 1, 2]);
  });

  it("sorts options by display_order regardless of input order", () => {
    const q1 = build()[0];
    expect(q1.options_snapshot.map((o) => o.option_id)).toEqual(["o1a", "o1b", "o1c"]);
  });

  it("stores stable option identities alongside the display label", () => {
    const q1 = build()[0];
    expect(q1.options_snapshot[2]).toEqual({ option_id: "o1c", label: "C", option_text: "4" });
  });

  it("carries the frozen answer key", () => {
    const snap = build();
    expect(snap[0].correct_option_id).toBe("o1c");
    expect(snap[1].correct_option_id).toBe("o2b");
    expect(snap[2].correct_option_id).toBeNull();
  });

  it("carries the theory rubric and model answer", () => {
    const q3 = build()[2];
    expect(q3.model_answer).toBe("Chlorophyll...");
    expect(q3.marking_rubric).toBe("3 marks for process");
  });

  it("applies a per-assessment marks override", () => {
    const snap = build({ q1: 10 });
    expect(snap[0].marks).toBe(10);
    expect(snap[1].marks).toBe(1);
  });

  it("skips a question that no longer exists", () => {
    const snap = buildAttemptSnapshot({
      questionIds: ["q1", "deleted", "q3"],
      questions,
      options,
      answerKeys,
    });
    expect(snap.map((q) => q.question_id)).toEqual(["q1", "q3"]);
    expect(snap.map((q) => q.display_order)).toEqual([0, 1]);
  });

  it("is a genuine freeze: mutating the source afterwards changes nothing", () => {
    const snap = build();
    const originalText = questions[0].question_text;
    const originalOption = options[0].option_text;
    const originalKey = answerKeys[0].correct_option_id;

    questions[0].question_text = "MUTATED";
    options[0].option_text = "MUTATED";
    answerKeys[0].correct_option_id = "o1a";

    expect(snap[0].question_text).toBe(originalText);
    expect(snap[0].options_snapshot.find((o) => o.option_id === "o1c")?.option_text).toBe(originalOption);
    expect(snap[0].correct_option_id).toBe(originalKey);

    questions[0].question_text = originalText;
    options[0].option_text = originalOption;
    answerKeys[0].correct_option_id = originalKey;
  });
});

describe("toStudentView", () => {
  it("removes the answer key, model answer and rubric", () => {
    const safe = toStudentView(build()[2]);
    expect("correct_option_id" in safe).toBe(false);
    expect("model_answer" in safe).toBe(false);
    expect("marking_rubric" in safe).toBe(false);
  });

  it("keeps what the student is allowed to see", () => {
    const safe = toStudentView(build()[0]);
    expect(safe.question_text).toBe("2 + 2 = ?");
    expect(safe.marks).toBe(2);
    expect(safe.options_snapshot).toHaveLength(3);
  });
});

// ── grading ─────────────────────────────────────────────────────────────────

describe("gradeObjectiveAnswer", () => {
  it("awards full marks when the option identity matches", () => {
    expect(
      gradeObjectiveAnswer({ questionType: "mcq", correctOptionId: "o1c", selectedOptionId: "o1c", marks: 2 }),
    ).toEqual({ graded: true, awarded: 2, correct: true });
  });

  it("awards zero when a different option is chosen", () => {
    expect(
      gradeObjectiveAnswer({ questionType: "mcq", correctOptionId: "o1c", selectedOptionId: "o1a", marks: 2 }),
    ).toEqual({ graded: true, awarded: 0, correct: false });
  });

  it("grades by identity, so relabelling the same option cannot alter the result", () => {
    // The same underlying option presented as "C" in one sitting, "A" in another.
    const first = gradeObjectiveAnswer({
      questionType: "mcq",
      correctOptionId: "o1c",
      selectedOptionId: "o1c",
      marks: 2,
    });
    const second = gradeObjectiveAnswer({
      questionType: "mcq",
      correctOptionId: "o1c",
      selectedOptionId: "o1c",
      marks: 2,
    });
    expect(first).toEqual(second);
    expect(first.correct).toBe(true);
  });

  it("treats an unanswered objective question as zero, not as pending", () => {
    expect(
      gradeObjectiveAnswer({ questionType: "mcq", correctOptionId: "o1c", selectedOptionId: null, marks: 2 }),
    ).toEqual({ graded: true, awarded: 0, correct: false });
  });

  it("handles a question with no answer key", () => {
    expect(
      gradeObjectiveAnswer({ questionType: "true_false", correctOptionId: null, selectedOptionId: "o2b", marks: 1 }),
    ).toEqual({ graded: true, awarded: 0, correct: false });
  });

  it("never auto-marks a theory answer", () => {
    const g = gradeObjectiveAnswer({
      questionType: "theory",
      correctOptionId: null,
      selectedOptionId: null,
      marks: 5,
    });
    expect(g.graded).toBe(false);
    expect(g.awarded).toBe(0);
  });
});

// ── timing ──────────────────────────────────────────────────────────────────

describe("attempt timing", () => {
  const started = new Date("2026-09-18T10:00:00Z");

  it("returns null when there is no time limit", () => {
    expect(computeAttemptExpiry(started, null)).toBeNull();
    expect(computeAttemptExpiry(started, 0)).toBeNull();
  });

  it("computes expiry from the server start time", () => {
    expect(computeAttemptExpiry(started, 45)?.toISOString()).toBe("2026-09-18T10:45:00.000Z");
  });

  it("is not expired one second before the deadline", () => {
    const exp = computeAttemptExpiry(started, 45);
    expect(isAttemptExpired(exp, new Date("2026-09-18T10:44:59Z"))).toBe(false);
  });

  it("is expired at the deadline and after it", () => {
    const exp = computeAttemptExpiry(started, 45);
    expect(isAttemptExpired(exp, new Date("2026-09-18T10:45:00Z"))).toBe(true);
    expect(isAttemptExpired(exp, new Date("2026-09-18T11:00:00Z"))).toBe(true);
  });

  it("treats an untimed attempt as never expiring", () => {
    expect(isAttemptExpired(null, new Date("2099-01-01T00:00:00Z"))).toBe(false);
  });
});

// ── totals ──────────────────────────────────────────────────────────────────

describe("totalAttempt", () => {
  it("separates objective from subjective and computes the maximum", () => {
    const t = totalAttempt([
      { marks: 2, questionType: "mcq", objectiveAwarded: 2, subjectiveAwarded: null },
      { marks: 1, questionType: "true_false", objectiveAwarded: 0, subjectiveAwarded: null },
      { marks: 5, questionType: "theory", objectiveAwarded: 0, subjectiveAwarded: 4 },
    ]);
    expect(t.objectiveScore).toBe(2);
    expect(t.subjectiveScore).toBe(4);
    expect(t.totalScore).toBe(6);
    expect(t.maxScore).toBe(8);
    expect(t.percentage).toBe(75);
    expect(t.hasSubjective).toBe(true);
  });

  it("rounds the percentage to two decimals", () => {
    const t = totalAttempt([
      { marks: 3, questionType: "mcq", objectiveAwarded: 1, subjectiveAwarded: null },
    ]);
    expect(t.percentage).toBe(33.33);
  });

  it("returns a null percentage when nothing is worth marks", () => {
    expect(totalAttempt([]).percentage).toBeNull();
  });

  it("treats an unmarked theory answer as zero rather than failing", () => {
    const t = totalAttempt([
      { marks: 5, questionType: "theory", objectiveAwarded: 0, subjectiveAwarded: null },
    ]);
    expect(t.subjectiveScore).toBe(0);
    expect(t.hasSubjective).toBe(true);
  });
});

// ── official attempt (PD-4) ─────────────────────────────────────────────────

describe("selectOfficialAttempt", () => {
  const attempts = [
    { attempt_number: 1, total_score: 70 },
    { attempt_number: 2, total_score: 55 },
    { attempt_number: 3, total_score: 20 },
  ];

  it("defaults to the latest attempt", () => {
    expect(selectOfficialAttempt(attempts, "latest")?.attempt_number).toBe(3);
  });

  it("can pick the best attempt — the case the override exists for", () => {
    expect(selectOfficialAttempt(attempts, "best")?.total_score).toBe(70);
  });

  it("can pick the first attempt", () => {
    expect(selectOfficialAttempt(attempts, "first")?.attempt_number).toBe(1);
  });

  it("returns null under manual control so an authorised user must decide", () => {
    expect(selectOfficialAttempt(attempts, "manual")).toBeNull();
  });

  it("breaks a best-score tie in favour of the later attempt", () => {
    const tied = [
      { attempt_number: 1, total_score: 50 },
      { attempt_number: 2, total_score: 50 },
    ];
    expect(selectOfficialAttempt(tied, "best")?.attempt_number).toBe(2);
  });

  it("returns null when there are no attempts", () => {
    expect(selectOfficialAttempt([], "latest")).toBeNull();
  });

  it("does not mutate the input array", () => {
    const copy = attempts.slice();
    selectOfficialAttempt(attempts, "best");
    expect(attempts).toEqual(copy);
  });
});

describe("canStartAnotherAttempt", () => {
  it("allows attempts below the limit", () => {
    expect(canStartAnotherAttempt(0, 3)).toBe(true);
    expect(canStartAnotherAttempt(2, 3)).toBe(true);
  });

  it("blocks once the limit is reached", () => {
    expect(canStartAnotherAttempt(3, 3)).toBe(false);
    expect(canStartAnotherAttempt(4, 3)).toBe(false);
  });
});
