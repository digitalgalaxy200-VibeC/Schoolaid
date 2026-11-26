import { describe, expect, it } from "vitest";
import { loadPublishableResults } from "../integration";
import { fakeSupabase, fakeOk } from "@/lib/ai/__tests__/fake-supabase";

/**
 * The dead end this pins, found on a real Year 3 CCA paper:
 *
 *   every attempt marked → no result flagged official → the preview said
 *   "0 official result(s) ready" → the publish button stayed disabled → the
 *   teacher had no way to trigger the promotion that would have fixed it.
 *
 * The preview must therefore report what publishing WOULD settle, using the
 * assessment's own rule, without writing anything.
 */

function db(
  attempts: { id: string; student_id: string; attempt_number: number; status: string }[],
  results: { attempt_id: string; total_score: number; is_official: boolean }[],
) {
  return fakeSupabase({
    select: (spec) =>
      spec.table === "cbt_attempts"
        ? fakeOk(attempts)
        : spec.table === "cbt_results"
          ? fakeOk(results)
          : fakeOk([]),
  });
}

const ARGS = { schoolId: "school-1", assessmentId: "assessment-1" };

describe("loadPublishableResults", () => {
  it("reports a marked-but-not-official paper as publishable", async () => {
    const fake = db(
      [{ id: "a1", student_id: "s1", attempt_number: 1, status: "marked" }],
      [{ attempt_id: "a1", total_score: 48, is_official: false }],
    );

    const { results, wouldPromote } = await loadPublishableResults(fake.client, {
      ...ARGS,
      officialAttemptRule: "latest",
    });

    expect(results).toEqual([
      { studentId: "s1", attemptId: "a1", attemptNumber: 1, totalScore: 48 },
    ]);
    expect(wouldPromote).toBe(1);
  });

  it("writes nothing itself", async () => {
    const fake = db(
      [{ id: "a1", student_id: "s1", attempt_number: 1, status: "marked" }],
      [{ attempt_id: "a1", total_score: 48, is_official: false }],
    );

    await loadPublishableResults(fake.client, { ...ARGS, officialAttemptRule: "latest" });

    expect(fake.updates).toHaveLength(0);
    expect(fake.upserts).toHaveLength(0);
    expect(fake.inserts).toHaveLength(0);
  });

  it("does not invent an official attempt under a manual rule", async () => {
    const fake = db(
      [{ id: "a1", student_id: "s1", attempt_number: 1, status: "marked" }],
      [{ attempt_id: "a1", total_score: 48, is_official: false }],
    );

    const { results, wouldPromote } = await loadPublishableResults(fake.client, {
      ...ARGS,
      officialAttemptRule: "manual",
    });

    expect(results).toHaveLength(0);
    expect(wouldPromote).toBe(0);
  });

  it("counts an already-official result without re-promoting it", async () => {
    const fake = db(
      [{ id: "a1", student_id: "s1", attempt_number: 1, status: "marked" }],
      [{ attempt_id: "a1", total_score: 48, is_official: true }],
    );

    const { results, wouldPromote } = await loadPublishableResults(fake.client, {
      ...ARGS,
      officialAttemptRule: "latest",
    });

    expect(results).toHaveLength(1);
    expect(wouldPromote).toBe(0);
  });

  it("picks the latest attempt when a student sat the paper twice", async () => {
    const fake = db(
      [
        { id: "a1", student_id: "s1", attempt_number: 1, status: "marked" },
        { id: "a2", student_id: "s1", attempt_number: 2, status: "marked" },
      ],
      [
        { attempt_id: "a1", total_score: 30, is_official: false },
        { attempt_id: "a2", total_score: 48, is_official: false },
      ],
    );

    const { results, wouldPromote } = await loadPublishableResults(fake.client, {
      ...ARGS,
      officialAttemptRule: "latest",
    });

    expect(results).toEqual([
      { studentId: "s1", attemptId: "a2", attemptNumber: 2, totalScore: 48 },
    ]);
    expect(wouldPromote).toBe(1);
  });

  it("ignores an attempt with no result row", async () => {
    const fake = db(
      [{ id: "a1", student_id: "s1", attempt_number: 1, status: "marked" }],
      [],
    );

    const { results } = await loadPublishableResults(fake.client, {
      ...ARGS,
      officialAttemptRule: "latest",
    });

    expect(results).toHaveLength(0);
  });
});
