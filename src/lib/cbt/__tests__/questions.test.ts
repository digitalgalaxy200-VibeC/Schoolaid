import { describe, it, expect } from "vitest";
import {
  QUESTION_TRANSITIONS,
  canTransitionQuestion,
  isQuestionApprovedForUse,
  canEditQuestionContent,
  parseQuestionInput,
  validateAssessmentReadiness,
  type QuestionStatus,
} from "../questions";
import { ValidationErrors } from "@/lib/validate";

const parse = (body: unknown) => {
  const errors = new ValidationErrors();
  const input = parseQuestionInput(body, errors);
  return { input, errors };
};

const mcq = (over: Record<string, unknown> = {}) => ({
  question_type: "mcq",
  question_text: "2 + 2 = ?",
  marks: 2,
  options: [{ option_text: "4" }, { option_text: "5" }],
  correct_option_index: 0,
  ...over,
});

// ── lifecycle ───────────────────────────────────────────────────────────────

describe("canTransitionQuestion", () => {
  it("allows the documented transitions", () => {
    expect(canTransitionQuestion("draft", "review")).toBe(true);
    expect(canTransitionQuestion("draft", "approved")).toBe(true);
    expect(canTransitionQuestion("review", "approved")).toBe(true);
    expect(canTransitionQuestion("approved", "review")).toBe(true);
    expect(canTransitionQuestion("archived", "draft")).toBe(true);
  });

  it("refuses resurrecting an archived question straight back to approved", () => {
    expect(canTransitionQuestion("archived", "approved")).toBe(false);
    expect(canTransitionQuestion("archived", "review")).toBe(false);
  });

  it("refuses an illegal move and a self-transition", () => {
    expect(canTransitionQuestion("draft", "archived")).toBe(true); // retiring is allowed
    expect(canTransitionQuestion("approved", "draft")).toBe(false);
    expect(canTransitionQuestion("approved", "approved")).toBe(false);
  });

  it("only ever lists reachable statuses", () => {
    for (const [from, targets] of Object.entries(QUESTION_TRANSITIONS)) {
      for (const to of targets) {
        expect(canTransitionQuestion(from as QuestionStatus, to)).toBe(true);
      }
    }
  });
});

describe("canEditQuestionContent", () => {
  it("allows edits while draft or in review", () => {
    expect(canEditQuestionContent("draft")).toEqual({ allowed: true });
    expect(canEditQuestionContent("review")).toEqual({ allowed: true });
  });

  it("refuses an in-place edit of an approved question and says what to do", () => {
    const result = canEditQuestionContent("approved");
    expect(result.allowed).toBe(false);
    expect(result.allowed === false && result.reason).toMatch(/reopen/i);
  });

  it("refuses edits to an archived question", () => {
    expect(canEditQuestionContent("archived").allowed).toBe(false);
  });
});

describe("isQuestionApprovedForUse", () => {
  it("is true only for approved", () => {
    expect(isQuestionApprovedForUse("approved")).toBe(true);
    for (const s of ["draft", "review", "archived"] as QuestionStatus[]) {
      expect(isQuestionApprovedForUse(s)).toBe(false);
    }
  });
});

// ── parsing ─────────────────────────────────────────────────────────────────

describe("parseQuestionInput", () => {
  it("accepts a well-formed multiple-choice question and labels options A, B", () => {
    const { input, errors } = parse(mcq());
    expect(errors.ok).toBe(true);
    expect(input?.question_type).toBe("mcq");
    expect(input?.options).toEqual([
      { option_text: "4", label: "A" },
      { option_text: "5", label: "B" },
    ]);
    expect(input?.correct_option_index).toBe(0);
  });

  it("keeps an explicit label instead of overwriting it", () => {
    const { input } = parse(mcq({ options: [{ option_text: "4", label: "i" }, { option_text: "5" }] }));
    expect(input?.options[0].label).toBe("i");
    expect(input?.options[1].label).toBe("B");
  });

  it("supplies True/False options when a true/false question omits them", () => {
    const { input, errors } = parse({
      question_type: "true_false",
      question_text: "The sky is green.",
      marks: 1,
      correct_option_index: 1,
    });
    expect(errors.ok).toBe(true);
    expect(input?.options).toEqual([
      { option_text: "True", label: "A" },
      { option_text: "False", label: "B" },
    ]);
    expect(input?.correct_option_index).toBe(1);
  });

  it("refuses a true/false question with three options", () => {
    const { errors } = parse({
      question_type: "true_false",
      question_text: "x",
      marks: 1,
      options: [{ option_text: "a" }, { option_text: "b" }, { option_text: "c" }],
      correct_option_index: 0,
    });
    expect(errors.list.map((e) => e.field)).toContain("options");
  });

  it("requires at least two options for multiple choice", () => {
    const { errors } = parse(mcq({ options: [{ option_text: "4" }] }));
    expect(errors.list.some((e) => /at least two options/.test(e.message))).toBe(true);
  });

  it("names a bad nested option field by index", () => {
    const { errors } = parse(
      mcq({ options: [{ option_text: "4" }, { option_text: "   " }] }),
    );
    expect(errors.list.map((e) => e.field)).toContain("options[1].option_text");
  });

  it("requires the correct option for an objective question", () => {
    const { errors } = parse(mcq({ correct_option_index: undefined }));
    expect(errors.list.map((e) => e.field)).toContain("correct_option_index");
  });

  it("refuses a correct option index past the end of the list", () => {
    const { errors } = parse(mcq({ correct_option_index: 5 }));
    expect(errors.list.some((e) => /does not point at an option/.test(e.message))).toBe(true);
  });

  it("accepts a theory question with a rubric and no options", () => {
    const { input, errors } = parse({
      question_type: "theory",
      question_text: "Explain photosynthesis.",
      marks: 5,
      marking_rubric: "1 mark per correct stage, max 5.",
    });
    expect(errors.ok).toBe(true);
    expect(input?.options).toEqual([]);
    expect(input?.correct_option_index).toBeNull();
  });

  it("refuses a theory question without a model answer or rubric", () => {
    const { errors } = parse({
      question_type: "theory",
      question_text: "Explain photosynthesis.",
      marks: 5,
    });
    expect(errors.list.map((e) => e.field)).toContain("model_answer");
  });

  it("refuses options on a theory question", () => {
    const { errors } = parse({
      question_type: "theory",
      question_text: "Explain.",
      marks: 5,
      marking_rubric: "r",
      options: [{ option_text: "a" }],
    });
    expect(errors.list.map((e) => e.field)).toContain("options");
  });

  it("rejects an unknown question type", () => {
    const { input, errors } = parse(mcq({ question_type: "essay" }));
    expect(input).toBeNull();
    expect(errors.list.some((e) => e.field === "question_type")).toBe(true);
  });

  it("rejects zero or negative marks", () => {
    expect(parse(mcq({ marks: 0 })).errors.list.map((e) => e.field)).toContain("marks");
    expect(parse(mcq({ marks: -1 })).errors.list.map((e) => e.field)).toContain("marks");
  });

  it("rejects a missing question text and a numeric marks value sent as a string", () => {
    const { errors } = parse({
      question_type: "mcq",
      marks: "2",
      options: [{ option_text: "4" }, { option_text: "5" }],
      correct_option_index: 0,
    });
    const fields = errors.list.map((e) => e.field);
    expect(fields).toContain("question_text");
    expect(fields).toContain("marks");
  });

  it("does not throw on a null or non-object body", () => {
    for (const body of [null, undefined, 42, "nope", []]) {
      const errors = new ValidationErrors();
      expect(() => parseQuestionInput(body, errors)).not.toThrow();
      expect(errors.ok).toBe(false);
    }
  });

  it("rejects a malformed scope id before it can reach the database", () => {
    const { errors } = parse(mcq({ subject_id: "123" }));
    expect(errors.list.map((e) => e.field)).toContain("subject_id");
  });
});

// ── readiness ───────────────────────────────────────────────────────────────

describe("validateAssessmentReadiness", () => {
  const ready = {
    questionCount: 2,
    statuses: ["approved", "approved"] as QuestionStatus[],
    marks: [2, 3],
  };

  it("passes for an approved, non-empty, positive-mark assessment", () => {
    expect(validateAssessmentReadiness(ready)).toEqual({ ok: true });
  });

  it("refuses an empty assessment", () => {
    const r = validateAssessmentReadiness({ questionCount: 0, statuses: [], marks: [] });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.errors.some((e) => /no questions/.test(e))).toBe(true);
  });

  it("refuses unapproved questions and says how many", () => {
    const r = validateAssessmentReadiness({
      ...ready,
      statuses: ["approved", "draft"],
    });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.errors.some((e) => /1 question\(s\) are not approved/.test(e))).toBe(
      true,
    );
  });

  it("refuses a zero-mark assessment", () => {
    const r = validateAssessmentReadiness({ ...ready, marks: [0, 0] });
    expect(r.ok === false && r.errors.some((e) => /zero marks/.test(e))).toBe(true);
  });

  it("refuses more marks than the component allows", () => {
    const r = validateAssessmentReadiness({ ...ready, totalMarksAvailable: 4 });
    expect(r.ok === false && r.errors.some((e) => /more than the 4 available/.test(e))).toBe(true);
  });

  it("flags a question count that does not match the resolved questions", () => {
    const r = validateAssessmentReadiness({
      questionCount: 3,
      statuses: ["approved", "approved"],
      marks: [2, 3],
    });
    expect(r.ok === false && r.errors.some((e) => /could not be resolved/.test(e))).toBe(true);
  });
});
