import { describe, expect, it } from "vitest";
import { questionsOnLiveAssessments } from "../questions";
import { fakeSupabase, fakeOk } from "@/lib/ai/__tests__/fake-supabase";

/**
 * When may a teacher rewrite a question that is already in use?
 *
 * Only while no paper currently offering it is live. Past attempts are NOT part
 * of the decision: every attempt holds its own frozen copy of the paper it sat,
 * so correcting the bank cannot rewrite what a student was asked. Locking on
 * "has been attempted" made a typo permanent and pushed teachers into copying
 * questions to fix them, which filled the bank with near-duplicates.
 */

function db(
  links: { question_id: string; assessment_id: string | null }[],
  live: { id: string }[],
) {
  return fakeSupabase({
    select: (spec) =>
      spec.table === "cbt_assessment_questions"
        ? fakeOk(links)
        : spec.table === "cbt_assessments"
          ? fakeOk(live)
          : fakeOk([]),
  });
}

describe("questionsOnLiveAssessments", () => {
  it("locks a question that is on a published assessment", async () => {
    const fake = db([{ question_id: "q1", assessment_id: "a1" }], [{ id: "a1" }]);

    const locked = await questionsOnLiveAssessments(fake.client, "school-1", ["q1"]);

    expect([...locked]).toEqual(["q1"]);
  });

  it("does NOT lock a question whose assessment is not published", async () => {
    // The assessment exists and uses the question, but it is a draft.
    const fake = db([{ question_id: "q1", assessment_id: "a1" }], []);

    const locked = await questionsOnLiveAssessments(fake.client, "school-1", ["q1"]);

    expect(locked.size).toBe(0);
  });

  it("never consults attempts — that was the rule that trapped teachers", async () => {
    const fake = db([{ question_id: "q1", assessment_id: "a1" }], []);

    await questionsOnLiveAssessments(fake.client, "school-1", ["q1"]);

    expect(fake.selects.map((s) => s.table)).not.toContain("cbt_attempts");
  });

  it("locks only the questions that are actually on a live paper", async () => {
    const fake = db(
      [
        { question_id: "q1", assessment_id: "live" },
        { question_id: "q2", assessment_id: "draft" },
        { question_id: "q3", assessment_id: null },
        { question_id: "q4", assessment_id: "live" },
      ],
      [{ id: "live" }],
    );

    const locked = await questionsOnLiveAssessments(fake.client, "school-1", [
      "q1",
      "q2",
      "q3",
      "q4",
    ]);

    expect([...locked].sort()).toEqual(["q1", "q4"]);
  });

  it("does nothing for an empty list, without querying", async () => {
    const fake = fakeSupabase();

    const locked = await questionsOnLiveAssessments(fake.client, "school-1", []);

    expect(locked.size).toBe(0);
    expect(fake.selects).toHaveLength(0);
  });
});
