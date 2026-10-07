import { describe, it, expect } from "vitest";
import {
  ASSESSMENT_TRANSITIONS,
  canTransitionAssessment,
  canRebindAssessment,
  parseAssessmentInput,
  parseAssessmentSections,
  parseQuestionSelection,
  unpublishAssessment,
  type AssessmentStatus,
} from "../assessments";
import { ValidationErrors } from "@/lib/validate";
import { fakeSupabase } from "../../ai/__tests__/fake-supabase";

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

  it("lets a published assessment be taken back to draft for a correction", () => {
    // This used to be refused, on the reasoning that un-publishing would strand
    // attempts already taken. It does not: a sat paper is preserved by the
    // attempt's own snapshot, no STAFF path checks the status, and `published`
    // only decides whether a student may START one. Added at the product owner's
    // request — a spotted mistake must be fixable without archiving the test.
    expect(canTransitionAssessment("published", "draft")).toBe(true);
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

describe("parseAssessmentSections", () => {
  const parseSections = (body: unknown) => {
    const errors = new ValidationErrors();
    return { sections: parseAssessmentSections(body, errors), errors };
  };

  it("is optional — an assessment with no sections parses fine", () => {
    const { sections, errors } = parseSections({});
    expect(errors.ok).toBe(true);
    expect(sections).toBeNull();
  });

  it("accepts sections and keeps their order", () => {
    const { sections, errors } = parseSections({
      sections: [
        { label: "Section A", instruction: "Answer all questions." },
        { label: "Section B", instruction: null },
      ],
    });
    expect(errors.ok).toBe(true);
    expect(sections).toEqual([
      { label: "Section A", instruction: "Answer all questions." },
      { label: "Section B", instruction: null },
    ]);
  });

  it("refuses a repeated label instead of merging two instructions", () => {
    const { errors } = parseSections({
      sections: [{ label: "Section A" }, { label: "section a" }],
    });
    expect(errors.ok).toBe(false);
    expect(errors.list.some((e) => /appears more than once/.test(e.message))).toBe(true);
  });

  it("requires a label on every section", () => {
    const { errors } = parseSections({ sections: [{ instruction: "No heading" }] });
    expect(errors.list.some((e) => e.field === "sections[0].label")).toBe(true);
  });
});

describe("unpublishAssessment", () => {
  const db = (status: string | null) =>
    fakeSupabase({
      select: (spec) =>
        spec.table === "cbt_assessments"
          ? { data: status ? [{ status }] : [], error: null }
          : { data: [], error: null },
    });

  const args = {
    schoolId: "s1",
    assessmentId: "a1",
    now: new Date("2026-10-05T10:00:00.000Z"),
  };

  it("moves a published assessment to draft and clears published_at", async () => {
    const fake = db("published");

    expect(await unpublishAssessment(fake.client, args)).toEqual({ ok: true });

    const update = fake.updates.find((u) => u.table === "cbt_assessments");
    expect(update?.row).toMatchObject({ status: "draft", published_at: null });
    expect(update?.row.updated_at).toBe("2026-10-05T10:00:00.000Z");
  });

  it("refuses any status that is not published, and writes nothing", async () => {
    // `review` is the case worth naming: the transition table allows review -> draft,
    // so without this endpoint's own precondition it would answer `ok` to a request
    // that is not an unpublish at all.
    for (const status of ["draft", "review", "archived"]) {
      const fake = db(status);
      expect(await unpublishAssessment(fake.client, args)).toEqual({
        error: `only a published assessment can be unpublished (this one is ${status})`,
      });
      expect(fake.updates).toHaveLength(0);
    }
  });

  it("reports a missing assessment rather than reporting success", async () => {
    const fake = db(null);
    expect(await unpublishAssessment(fake.client, args)).toEqual({ error: "assessment not found" });
    expect(fake.updates).toHaveLength(0);
  });
});
