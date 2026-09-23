import { NextResponse } from "next/server";
import { actorGate, jsonError, openClientOr503 } from "@/lib/cbt/api";
import { isCbtStaff } from "@/lib/cbt/authz";
import { decideAnswerWrite } from "@/lib/cbt/delivery";
import { toStudentView, type AttemptQuestion } from "@/lib/cbt/attempt";
import { ValidationErrors, text, uuid } from "@/lib/validate";

/**
 * GET   /api/cbt/attempts/{id} — the attempt, as the caller is allowed to see it.
 * PATCH /api/cbt/attempts/{id} — autosave one answer.
 *
 * THE ANSWER KEY IS STRIPPED HERE, not left to each caller. A student reading
 * their own attempt row is permitted by RLS — `cbt_attempt_questions` is
 * SELECT-only for them — and that row CONTAINS the frozen correct answer, because
 * it has to for deterministic marking. RLS cannot help with a column, so the
 * strip happens in this file via the allow-list in `attempt.ts`, and there is
 * exactly one place to get it wrong.
 */

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const gate = await actorGate(request);
  if (!gate.ok) return gate.response;
  const { actor } = gate;

  const { id } = await params;
  const errors = new ValidationErrors();
  if (!uuid({ id }, "id", errors)) return jsonError(400, "a valid attempt id is required");

  const opened = await openClientOr503(actor);
  if (!opened.ok) return opened.response;
  const scoped = opened.client;

  // RLS already restricts a student to their own attempt; the explicit school
  // filter is defence in depth rather than the only barrier.
  const { data: attempt } = await scoped
    .from("cbt_attempts")
    .select("*")
    .eq("id", id)
    .eq("school_id", actor.schoolId)
    .maybeSingle();
  if (!attempt) return jsonError(404, "attempt not found");

  const [{ data: questionRows }, { data: answers }, { data: result }] = await Promise.all([
    scoped
      .from("cbt_attempt_questions")
      .select("*")
      .eq("attempt_id", id)
      .eq("school_id", actor.schoolId)
      .order("display_order"),
    scoped
      .from("cbt_attempt_answers")
      .select("attempt_question_id, selected_option_id, answer_text, awarded_marks, marked_at, answered_at")
      .eq("attempt_id", id)
      .eq("school_id", actor.schoolId),
    scoped.from("cbt_results").select("*").eq("attempt_id", id).eq("school_id", actor.schoolId).maybeSingle(),
  ]);

  const rows = (questionRows ?? []) as unknown as (AttemptQuestion & {
    id: string;
    attempt_id: string;
  })[];

  const staff = isCbtStaff(actor);

  const questions = rows
    .slice()
    .sort((a, b) => a.display_order - b.display_order)
    .map((row) => {
      const shaped: AttemptQuestion = {
        question_id: row.question_id,
        display_order: row.display_order,
        question_type: row.question_type,
        question_text: row.question_text,
        options_snapshot: row.options_snapshot ?? [],
        correct_option_id: row.correct_option_id,
        model_answer: row.model_answer,
        marking_rubric: row.marking_rubric,
        marks: Number(row.marks),
      };
      // Students get the allow-listed projection. Staff get the row as stored.
      return staff
        ? { id: row.id, ...shaped }
        : { id: row.id, ...toStudentView(shaped) };
    });

  return NextResponse.json({
    attempt: {
      id: attempt.id,
      attempt_number: attempt.attempt_number,
      status: attempt.status,
      started_at: attempt.started_at,
      // The client renders its countdown from THIS value, never from its own
      // clock, so a device with a wrong time cannot extend an attempt.
      expires_at: attempt.expires_at,
      submitted_at: attempt.submitted_at,
      server_now: new Date().toISOString(),
    },
    questions,
    answers: answers ?? [],
    // A student sees their own result only once it has been marked; the RLS
    // policy on cbt_results enforces the same rule underneath.
    result: staff ? (result ?? null) : null,
  });
}

export async function PATCH(request: Request, { params }: Params) {
  const gate = await actorGate(request);
  if (!gate.ok) return gate.response;
  const { actor } = gate;

  if (isCbtStaff(actor)) {
    return jsonError(403, "teachers mark answers; they do not answer on a student's behalf");
  }

  const { id } = await params;
  const errors = new ValidationErrors();
  if (!uuid({ id }, "id", errors)) return jsonError(400, "a valid attempt id is required");

  const body = await request.json().catch(() => ({}));
  const attemptQuestionId = uuid(body, "attempt_question_id", errors, { required: true });
  // Optional: omitting these CLEARS the answer, which is a legitimate action.
  const selectedOptionId = uuid(body, "selected_option_id", errors);
  const answerText = text(body, "answer_text", errors, { max: 20000 });
  if (!errors.ok) return jsonError(400, errors.summary());

  const opened = await openClientOr503(actor);
  if (!opened.ok) return opened.response;
  const scoped = opened.client;

  const { data: attempt } = await scoped
    .from("cbt_attempts")
    .select("id, status, started_at, expires_at, submitted_at, attempt_number")
    .eq("id", id)
    .eq("school_id", actor.schoolId)
    .maybeSingle();
  if (!attempt) return jsonError(404, "attempt not found");

  const now = new Date();
  const allowed = decideAnswerWrite({
    attempt: {
      id: attempt.id,
      attempt_number: attempt.attempt_number,
      status: attempt.status,
      started_at: attempt.started_at,
      expires_at: attempt.expires_at,
      submitted_at: attempt.submitted_at,
    },
    now,
  });
  if (!allowed.allowed) {
    return NextResponse.json({ error: allowed.reason, code: allowed.code }, { status: 409 });
  }

  const { data: snapshotRow } = await scoped
    .from("cbt_attempt_questions")
    .select("id, question_type, options_snapshot")
    .eq("id", attemptQuestionId)
    .eq("attempt_id", id)
    .eq("school_id", actor.schoolId)
    .maybeSingle();
  if (!snapshotRow) return jsonError(404, "that question is not part of this attempt");

  // The selected option must be one of the options actually presented. It cannot
  // be made "correct" this way — grading compares against the frozen key — but
  // accepting arbitrary ids would store junk that no marking pass can interpret.
  if (selectedOptionId) {
    const offered = (snapshotRow.options_snapshot ?? []) as { option_id: string }[];
    if (!offered.some((o) => o.option_id === selectedOptionId)) {
      return jsonError(400, "that option was not offered on this question");
    }
  }

  const { error } = await scoped.from("cbt_attempt_answers").upsert(
    {
      school_id: actor.schoolId,
      attempt_id: id,
      student_profile_id: actor.profileId,
      attempt_question_id: attemptQuestionId,
      selected_option_id: selectedOptionId,
      answer_text: answerText,
      answered_at: now.toISOString(),
    },
    { onConflict: "attempt_id,attempt_question_id" },
  );
  if (error) return jsonError(400, error.message);

  // `expires_at` is returned so the client keeps rendering the SERVER's clock.
  return NextResponse.json({ ok: true, saved_at: now.toISOString(), expires_at: attempt.expires_at });
}
