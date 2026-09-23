import { NextResponse } from "next/server";
import { assessmentFailure, actorGate, jsonError, openClientOr503 } from "@/lib/cbt/api";
import { authorizeCbtAssessment, createCbtLookups } from "@/lib/cbt/authz";
import { createAttempt, decideStartAttempt, loadAttempts } from "@/lib/cbt/delivery";
import { getServiceClient } from "@/lib/supabase/service";
import type { QuestionType } from "@/lib/cbt/attempt";
import { ValidationErrors, uuid } from "@/lib/validate";

/**
 * POST /api/cbt/assessments/{id}/attempts — start an attempt as the signed-in
 * student.
 *
 * WHY THIS ROUTE TOUCHES THE SERVICE CLIENT
 * -----------------------------------------
 * Building the frozen snapshot requires READING THE ANSWER KEY, which students
 * cannot read by policy — deliberately, since that is the whole point of keeping
 * keys in their own table. So the snapshot is assembled with the service client
 * while the attempt row itself is written with the STUDENT's tenant-scoped
 * client, where RLS still applies.
 *
 * The service client here is not a substitute for RLS: authorization has already
 * happened, through the scoped client, in `authorizeCbtAssessment` above it. It
 * is used for the one thing the student is not permitted to see, so that the
 * frozen paper can carry the key for later deterministic marking.
 */

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const gate = await actorGate(request);
  if (!gate.ok) return gate.response;
  const { actor } = gate;

  const { id: assessmentId } = await params;
  const errors = new ValidationErrors();
  if (!uuid({ assessmentId }, "assessmentId", errors)) {
    return jsonError(400, "a valid assessment id is required");
  }

  const access = await authorizeCbtAssessment({ actor, assessmentId, intent: "student" });
  if (!access.ok) return assessmentFailure(access);

  const opened = await openClientOr503(actor);
  if (!opened.ok) return opened.response;
  const scoped = opened.client;

  const lookups = createCbtLookups(scoped, actor.schoolId);
  const student = await lookups.getStudentForProfile(actor.profileId);
  if (!student) return jsonError(403, "no student record for this account in this school");

  const now = new Date();
  const attempts = await loadAttempts(scoped, {
    schoolId: actor.schoolId,
    assessmentId,
    studentId: student.studentId,
  });

  // `access.assessment` comes from the guard, so the runtime fields below are
  // read from one place rather than re-queried and possibly disagreeing.
  const { data: runtime } = await scoped
    .from("cbt_assessments")
    .select("max_attempts, time_limit_minutes, official_attempt_rule, status")
    .eq("id", assessmentId)
    .eq("school_id", actor.schoolId)
    .maybeSingle();
  if (!runtime) return jsonError(404, "assessment not found");

  const decision = decideStartAttempt({
    assessment: {
      id: assessmentId,
      status: runtime.status,
      max_attempts: Number(runtime.max_attempts),
      time_limit_minutes: runtime.time_limit_minutes ?? null,
      official_attempt_rule: runtime.official_attempt_rule,
    },
    attempts,
    now,
  });

  if (!decision.allowed) {
    // A live attempt is not an error the student should have to guess at: hand
    // back its id so the client can resume it rather than showing a dead end.
    const resume = "resume" in decision ? decision.resume : undefined;
    return NextResponse.json(
      { error: decision.reason, code: decision.code, resume_attempt_id: resume?.id ?? null },
      { status: resume ? 409 : 403 },
    );
  }

  // The bank is read with the service client — students may not read it.
  const service = getServiceClient();

  const { data: links } = await service
    .from("cbt_assessment_questions")
    .select("question_id, display_order, marks_override")
    .eq("assessment_id", assessmentId)
    .eq("school_id", actor.schoolId)
    .order("display_order");

  const questionIds = (links ?? []).map((l) => l.question_id as string);
  if (questionIds.length === 0) {
    return jsonError(409, "this assessment has no questions");
  }

  const [{ data: questions }, { data: options }, { data: answerKeys }] = await Promise.all([
    service
      .from("cbt_questions")
      .select("id, question_type, question_text, marks")
      .eq("school_id", actor.schoolId)
      .in("id", questionIds),
    service
      .from("cbt_question_options")
      .select("id, question_id, label, option_text, display_order")
      .eq("school_id", actor.schoolId)
      .in("question_id", questionIds)
      .order("display_order"),
    service
      .from("cbt_question_answer_keys")
      .select("question_id, correct_option_id, model_answer, marking_rubric")
      .eq("school_id", actor.schoolId)
      .in("question_id", questionIds),
  ]);

  const marksOverrides: Record<string, number> = {};
  for (const link of links ?? []) {
    if (link.marks_override !== null && link.marks_override !== undefined) {
      marksOverrides[link.question_id as string] = Number(link.marks_override);
    }
  }

  const created = await createAttempt(service, scoped, {
    schoolId: actor.schoolId,
    assessmentId,
    studentId: student.studentId,
    studentProfileId: actor.profileId,
    attemptNumber: (attempts.at(-1)?.attempt_number ?? 0) + 1,
    timeLimitMinutes: runtime.time_limit_minutes ?? null,
    questionIds,
    questionSources: (questions ?? []).map((q) => ({
      id: q.id,
      question_type: q.question_type as QuestionType,
      question_text: q.question_text,
      marks: Number(q.marks),
    })),
    options: (options ?? []) as {
      id: string;
      question_id: string;
      label: string | null;
      option_text: string;
      display_order: number;
    }[],
    answerKeys: (answerKeys ?? []) as {
      question_id: string;
      correct_option_id: string | null;
      model_answer: string | null;
      marking_rubric: string | null;
    }[],
    marksOverrides,
    now,
  });

  if ("error" in created) return jsonError(409, created.error);

  return NextResponse.json({ attempt_id: created.attemptId }, { status: 201 });
}
