import { describe, expect, it } from "vitest";
import { markAndStore, type AnswerRow } from "../delivery";
import type { AttemptQuestion } from "../attempt";
import { fakeSupabase } from "@/lib/ai/__tests__/fake-supabase";

/**
 * The write pattern of a submission.
 *
 * Marking used to write ONE `update` per objective answer. That is 30 round
 * trips for a 30-question paper, and a class that shares an expiry all submits
 * at the same second — so the cost multiplied by the class size at exactly the
 * worst moment. These tests pin the batching, and pin the two things batching
 * must not change: which rows are written, and what each of them says.
 */

const NOW = new Date("2026-10-22T10:00:00.000Z");

type Markable = AttemptQuestion & { attempt_question_id: string };

function question(n: number, over: Partial<Markable> = {}): Markable {
  return {
    question_id: `q-${n}`,
    attempt_question_id: `aq-${n}`,
    display_order: n,
    question_type: "mcq",
    question_text: `Question ${n}`,
    options_snapshot: [
      { option_id: `opt-${n}-a`, label: "A", option_text: "Alpha" },
      { option_id: `opt-${n}-b`, label: "B", option_text: "Beta" },
    ],
    correct_option_id: `opt-${n}-a`,
    model_answer: null,
    marking_rubric: null,
    marks: 2,
    section: null,
    media: null,
    ...over,
  };
}

function answer(n: number, selected: string | null): AnswerRow {
  return {
    attempt_question_id: `aq-${n}`,
    selected_option_id: selected,
    answer_text: null,
    awarded_marks: null,
  };
}

const ARGS = {
  schoolId: "school-1",
  attemptId: "attempt-1",
  assessmentId: "assessment-1",
  studentId: "student-1",
  now: NOW,
};

describe("markAndStore — batched award writes", () => {
  it("writes every objective award in a single statement", async () => {
    const fake = fakeSupabase();
    const questions = [question(1), question(2), question(3)];
    const answers = [answer(1, "opt-1-a"), answer(2, "opt-2-b"), answer(3, "opt-3-a")];

    const result = await markAndStore(fake.client, { ...ARGS, questions, answers });

    expect(result).toMatchObject({ ok: true, pendingHuman: 0 });

    const batches = fake.upserts.filter((u) => u.table === "cbt_attempt_answers");
    expect(batches).toHaveLength(1);
    expect(batches[0].onConflict).toBe("attempt_id,attempt_question_id");
    expect(batches[0].rows.map((r) => r.attempt_question_id)).toEqual(["aq-1", "aq-2", "aq-3"]);
    // Two correct, one wrong — grading is unchanged by the batching.
    expect(batches[0].rows.map((r) => r.awarded_marks)).toEqual([2, 0, 2]);

    // The old per-answer loop would have produced an update per question.
    expect(fake.updates.filter((u) => u.table === "cbt_attempt_answers")).toHaveLength(0);
  });

  it("never creates an answer row for a question the student skipped", async () => {
    const fake = fakeSupabase();
    // Two questions, one answered. `planMarking` still scores the skipped one.
    const questions = [question(1), question(2)];

    await markAndStore(fake.client, {
      ...ARGS,
      questions,
      answers: [answer(1, "opt-1-a")],
    });

    const batch = fake.upserts.find((u) => u.table === "cbt_attempt_answers");
    expect(batch?.rows).toHaveLength(1);
    expect(batch?.rows[0].attempt_question_id).toBe("aq-1");
  });

  it("sends no award batch when nothing objective was answered", async () => {
    const fake = fakeSupabase();
    const theory = question(1, {
      question_type: "theory",
      correct_option_id: null,
      options_snapshot: [],
    });

    const result = await markAndStore(fake.client, {
      ...ARGS,
      questions: [theory],
      answers: [{ ...answer(1, null), answer_text: "An essay", awarded_marks: 2 }],
    });

    expect(result).toMatchObject({ ok: true, pendingHuman: 0 });
    expect(fake.upserts.filter((u) => u.table === "cbt_attempt_answers")).toHaveLength(0);
  });

  it("still records the attempt status and the result", async () => {
    const fake = fakeSupabase();
    await markAndStore(fake.client, {
      ...ARGS,
      questions: [question(1)],
      answers: [answer(1, "opt-1-a")],
    });

    const attemptUpdate = fake.updates.find((u) => u.table === "cbt_attempts");
    expect(attemptUpdate?.row).toMatchObject({ status: "marked" });
    expect(attemptUpdate?.filters).toEqual([
      ["id", "attempt-1"],
      ["school_id", "school-1"],
    ]);

    const result = fake.upserts.find((u) => u.table === "cbt_results");
    expect(result?.onConflict).toBe("attempt_id");
    expect(result?.rows[0]).toMatchObject({ attempt_id: "attempt-1", total_score: 2, max_score: 2 });
  });
});
