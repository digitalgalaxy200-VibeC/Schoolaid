import { NextResponse } from "next/server";
import { assessmentFailure, jsonError, openClientOr503, readJson, staffGate } from "@/lib/cbt/api";
import { authorizeCbtAssessment } from "@/lib/cbt/authz";
import { correctAnswerAward } from "@/lib/cbt/corrections";
import { getServiceClient } from "@/lib/supabase/service";
import { ValidationErrors, number, text, uuid } from "@/lib/validate";

/**
 * POST /api/cbt/attempts/{id}/mark — a teacher awards marks for one answer.
 *
 * This is the human half of marking. Objective answers were already decided
 * deterministically at submit time; a theory answer waits here for a person, and
 * the attempt does not become eligible to be the official result until every
 * theory answer has an award.
 *
 * A REASON IS REQUIRED. Even the first award on a fresh submission is recorded as
 * an audited event, because "25 marks appeared on this paper" with no record of
 * who wrote them is exactly what the audit exists to prevent. The reason is
 * written BEFORE the mark, so a failure cannot leave a mark nobody authorised.
 */

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const gate = await staffGate(request);
  if (!gate.ok) return gate.response;
  const { actor } = gate;

  const { id } = await params;
  const errors = new ValidationErrors();
  if (!uuid({ id }, "id", errors)) return jsonError(400, "a valid attempt id is required");

  const body = await readJson(request);
  const attemptQuestionId = uuid(body, "attempt_question_id", errors, { required: true });
  const awarded = number(body, "awarded_marks", errors, { required: true, min: 0 });
  const reason = text(body, "reason", errors, { required: true, max: 1000 });
  if (!errors.ok) return jsonError(400, errors.summary());
  // Narrow the nullables the validator signals through `errors` but cannot prove
  // to the compiler, rather than casting them away.
  if (!attemptQuestionId || awarded === null || !reason) {
    return jsonError(400, "attempt_question_id, awarded_marks and reason are required");
  }

  const opened = await openClientOr503(actor);
  if (!opened.ok) return opened.response;
  const scoped = opened.client;

  const { data: attempt } = await scoped
    .from("cbt_attempts")
    .select("id, assessment_id, student_id, status")
    .eq("id", id)
    .eq("school_id", actor.schoolId)
    .maybeSingle();
  if (!attempt) return jsonError(404, "attempt not found");

  const access = await authorizeCbtAssessment({
    actor,
    assessmentId: attempt.assessment_id,
    intent: "staff",
  });
  if (!access.ok) return assessmentFailure(access);

  const { data: snapshotRow } = await scoped
    .from("cbt_attempt_questions")
    .select("id, question_id, question_type, marks")
    .eq("id", attemptQuestionId)
    .eq("attempt_id", id)
    .eq("school_id", actor.schoolId)
    .maybeSingle();
  if (!snapshotRow) return jsonError(404, "that question is not part of this attempt");

  const { data: answerRow } = await scoped
    .from("cbt_attempt_answers")
    .select("awarded_marks")
    .eq("attempt_id", id)
    .eq("attempt_question_id", attemptQuestionId)
    .eq("school_id", actor.schoolId)
    .maybeSingle();

  // Marking writes `awarded_marks`, a marking field rather than a student's
  // answer — so it runs with the service client, after the authorization above.
  const service = getServiceClient();

  const corrected = await correctAnswerAward(service, {
    schoolId: actor.schoolId,
    assessmentId: attempt.assessment_id,
    attemptId: id,
    studentId: attempt.student_id,
    actorId: actor.profileId,
    attemptQuestionId,
    questionId: snapshotRow.question_id ?? null,
    awarded,
    previousAwarded: answerRow?.awarded_marks ?? null,
    questionMarks: Number(snapshotRow.marks),
    reason,
    now: new Date(),
  });
  if ("error" in corrected) return jsonError(400, corrected.error);

  return NextResponse.json({
    ok: true,
    total_score: corrected.totalScore,
    // False while any other theory answer is still unmarked.
    fully_marked: corrected.marked,
  });
}
