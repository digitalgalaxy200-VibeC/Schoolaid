import { describe, it, expect } from "vitest";
import {
  ASSESSMENT_TRANSITIONS,
  canTransitionAssessment,
  canRebindAssessment,
  parseAssessmentInput,
  parseQuestionSelection,
  type AssessmentStatus,
} from "../assessments";
import { ValidationErrors } from "@/lib/validate";

const parse = (body: unknown) => {
  const errors = new ValidationErrors();
  return { input: parseAssessmentInput(body, errors), errors };
};

const minimal = { class_id: "512e51a1-b9c1-4682-ba3b-b4bf34d262ec", title: "First Term Test" };

describe("canTransitionAssessment", () => {
  it("allows draft to published and to review", () => {
    expect(canTransitionAssessment("draft", "published")).toBe(true);
    expect(canTransitionAssessment("draft", "review")).toBe(true);
  });

  it("does not let an archived assessment jump straight back to published", () => {
    expect(canTransitionAssessment("archived", "published")).toBe(false);
    expect(canTransitionAssessment("archived", "draft")).toBe(true);
  });

  it("does not let a published assessment be edited back to draft", () => {
    // Un-publishing a live assessment would strand attempts already taken
    // against it; archiving is the supported way to retire one.
    expect(canTransitionAssessment("published", "draft")).toBe(false);
    expect(canTransitionAssessment("published", "archived")).toBe(true);
  });

  it("refuses a self-transition", () => {
    expect(canTransitionAssessment("published", "published")).toBe(false);
  });

  it("only ever lists reachable statuses", () => {
    for (const [from, targets] of Object.entries(ASSESSMENT_TRANSITIONS)) {
      for (const to of targets) {
        expect(canTransitionAssessment(from as AssessmentStatus, to)).toBe(true);
      }
    }
  });
});

describe("canRebindAssessment", () => {
  it("allows rebinding while nothing has been attempted", () => {
    expect(canRebindAssessment(0)).toEqual({ allowed: true });
  });

  it("refuses once any attempt exists, and says how many", () => {
    const r = canRebindAssessment(3);
    expect(r.allowed).toBe(false);
    expect(r.allowed === false && r.reason).toMatch(/3 attempt\(s\)/);
    expect(r.allowed === false && r.reason).toMatch(/Archive it and create a new assessment/);
  });
});

describe("parseAssessmentInput", () => {
  it("accepts a minimal assessment and applies sane defaults", () => {
    const { input, errors } = parse(minimal);
    expect(errors.ok).toBe(true);
    expect(input?.class_id).toBe(minimal.class_id);
    expect(input?.max_attempts).toBe(1);
    expect(input?.official_attempt_rule).toBe("latest");
    expect(input?.time_limit_minutes).toBeNull();
  });

  it("requires a class and a title", () => {
    // An empty payload must report BOTH missing fields at once, not just the
    // first one the validator happens to reach.
    const { errors } = parse({});
    const fields = errors.list.map((e) => e.field);
    expect(fields).toContain("class_id");
    expect(fields).toContain("title");
  });

  it("refuses max_attempts of zero", () => {
    const { errors } = parse({ ...minimal, max_attempts: 0 });
    expect(errors.list.map((e) => e.field)).toContain("max_attempts");
  });

  it("refuses an unknown official-attempt rule", () => {
    const { errors } = parse({ ...minimal, official_attempt_rule: "highest" });
    expect(errors.list.map((e) => e.field)).toContain("official_attempt_rule");
  });

  it("accepts every documented official-attempt rule", () => {
    for (const rule of ["latest", "best", "first", "manual"]) {
      const { input, errors } = parse({ ...minimal, official_attempt_rule: rule });
      expect(errors.ok).toBe(true);
      expect(input?.official_attempt_rule).toBe(rule);
    }
  });

  it("refuses a malformed scope id rather than letting Postgres cast it", () => {
    const { errors } = parse({ ...minimal, term_id: "term-1" });
    expect(errors.list.map((e) => e.field)).toContain("term_id");
  });
});

describe("parseQuestionSelection", () => {
  const q1 = "aaaaaaaa-0000-0000-0000-000000000001";
  const q2 = "aaaaaaaa-0000-0000-0000-000000000002";

  const parseSel = (body: unknown) => {
    const errors = new ValidationErrors();
    return { selection: parseQuestionSelection(body, errors), errors };
  };

  it("preserves the given order", () => {
    const { selection, errors } = parseSel({
      questions: [{ question_id: q2 }, { question_id: q1 }],
    });
    expect(errors.ok).toBe(true);
    expect(selection?.map((s) => s.question_id)).toEqual([q2, q1]);
  });

  it("accepts a marks override and defaults it to null", () => {
    const { selection } = parseSel({
      questions: [{ question_id: q1, marks_override: 7 }, { question_id: q2 }],
    });
    expect(selection?.[0].marks_override).toBe(7);
    expect(selection?.[1].marks_override).toBeNull();
  });

  it("refuses a duplicate question instead of silently dropping one", () => {
    const { errors } = parseSel({
      questions: [{ question_id: q1 }, { question_id: q1 }],
    });
    expect(errors.ok).toBe(false);
    expect(errors.list.some((e) => /appears more than once/.test(e.message))).toBe(true);
  });

  it("refuses an empty paper", () => {
    const { errors } = parseSel({ questions: [] });
    expect(errors.list.map((e) => e.field)).toContain("questions");
  });

  it("names a bad nested entry by index", () => {
    const { errors } = parseSel({ questions: [{ question_id: q1 }, { question_id: "nope" }] });
    expect(errors.list.some((e) => e.field === "questions[1].question_id")).toBe(true);
  });

  it("requires the questions field", () => {
    const { errors } = parseSel({});
    expect(errors.list.map((e) => e.field)).toContain("questions");
  });
});
