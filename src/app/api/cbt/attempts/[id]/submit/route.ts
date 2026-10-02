import { NextResponse } from "next/server";
import { actorGate, jsonError, openClientOr503 } from "@/lib/cbt/api";
import { isCbtStaff } from "@/lib/cbt/authz";
import { decideSubmit, markAndStore } from "@/lib/cbt/delivery";
import { promoteOfficialAttempt } from "@/lib/cbt/official";
import { getServiceClient } from "@/lib/supabase/service";
import type { AttemptQuestion, QuestionType } from "@/lib/cbt/attempt";
import { ValidationErrors, uuid } from "@/lib/validate";

/**
 * POST /api/cbt/attempts/{id}/submit — end the attempt and mark it.
 *
 * Objective answers are marked here, deterministically, from the frozen keys.
 * A theory answer is left for a human, and the attempt stays `submitted` (not
 * `marked`) until every theory answer has an award — which is what stops an
 * unmarked paper from becoming an official result.
 *
 * Marking runs with the service client: it writes `awarded_marks`, which is a
 * marking field and not a student's to set. The student's own client is used
 * only to establish that the attempt exists, belongs to them, and is open.
 */

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const gate = await actorGate(request);
  if (!gate.ok) return gate.response;
  const { actor } = gate;

  if (isCbtStaff(actor)) {
    return jsonError(403, "students submit their own attempts");
  }

  const { id } = await params;
  const errors = new ValidationErrors();
  if (!uuid({ id }, "id", errors)) return jsonError(400, "a valid attempt id is required");

  const opened = await openClientOr503(actor);
  if (!opened.ok) return opened.response;
  const scoped = opened.client;

  const { data: attempt } = await scoped
    .from("cbt_attempts")
    .select("id, attempt_number, status, started_at, expires_at, submitted_at, assessment_id, student_id")
    .eq("id", id)
    .eq("school_id", actor.schoolId)
    .maybeSingle();
  if (!attempt) return jsonError(404, "attempt not found");

  const now = new Date();
  const allowed = decideSubmit({
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

  const [{ data: questionRows }, { data: answers }] = await Promise.all([
    scoped
      .from("cbt_attempt_questions")
      .select("id, question_id, display_order, question_type, question_text, options_snapshot, correct_option_id, model_answer, marking_rubric, marks")
      .eq("attempt_id", id)
      .eq("school_id", actor.schoolId),
    scoped
      .from("cbt_attempt_answers")
      .select("attempt_question_id, selected_option_id, answer_text, awarded_marks")
      .eq("attempt_id", id)
      .eq("school_id", actor.schoolId),
  ]);

  const questions = ((questionRows ?? []) as unknown as (AttemptQuestion & { id: string })[]).map(
    (row) => ({
      ...row,
      attempt_question_id: row.id,
      question_type: row.question_type as QuestionType,
      marks: Number(row.marks),
    }),
  );

  if (questions.length === 0) return jsonError(409, "this attempt has no questions");

  const service = getServiceClient();

  const marked = await markAndStore(service, {
    schoolId: actor.schoolId,
    attemptId: id,
    assessmentId: attempt.assessment_id,
    studentId: attempt.student_id,
    questions,
    answers: (answers ?? []) as {
      attempt_question_id: string;
      selected_option_id: string | null;
      answer_text: string | null;
      awarded_marks: number | null;
    }[],
    now,
  });
  if ("error" in marked) return jsonError(500, marked.error);

  // ── Official-attempt promotion (PD-4) ──────────────────────────────────────
  // Contradiction B: while the class's report card is published, a new attempt is
  // recorded but the official score is NOT recomputed. The student is told why
  // rather than being left to wonder why their score did not move.
  //
  // The SAME helper runs after the last theory award (see the mark route), so the
  // two moments a paper can complete agree on which attempt is official.
  const promotion = await promoteOfficialAttempt(scoped, service, {
    schoolId: actor.schoolId,
    assessmentId: attempt.assessment_id,
    studentId: attempt.student_id,
    now,
  });

  return NextResponse.json({
    ok: true,
    score: marked.score,
    // Non-null when a human still has to mark theory before this can be final.
    pending_human_marking: marked.pendingHuman,
    official_note: promotion.note,
  });
}
