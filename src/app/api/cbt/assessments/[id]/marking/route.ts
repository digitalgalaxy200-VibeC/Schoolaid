import { NextResponse } from "next/server";
import { assessmentFailure, jsonError, openClientOr503, staffGate } from "@/lib/cbt/api";
import { authorizeCbtAssessment } from "@/lib/cbt/authz";
import { ValidationErrors, uuid } from "@/lib/validate";

/**
 * GET /api/cbt/assessments/{id}/marking — the marking worklist.
 *
 * One request answers the question a teacher has after a test: who sat it, who
 * still needs marking, and what is standing as the score.
 *
 * WHY THIS IS NOT `GET /attempts`. That path is the attempt COLLECTION, where
 * POST starts an attempt — a student action, assembled with the service client
 * because building the frozen snapshot needs the answer key. This is a staff
 * view with a different shape (students, not attempts) and a different audience.
 * Keeping them in one file would mean two unrelated auth models behind one path,
 * and an edit for either could break the other.
 *
 * WHO IS LISTED. The whole class, not only those who attempted — a student who
 * never sat the paper is a fact the teacher needs, and a list built from attempts
 * alone would silently omit them. The class comes from the ASSESSMENT's
 * `class_id`, so a later promotion does not change who sat this paper.
 *
 * PENDING THEORY IS COUNTED HERE, not in the browser. That count decides whether
 * an attempt can become final, and one computed client-side from partial data
 * would disagree with the server that actually refuses to finalise it.
 */

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const gate = await staffGate(request);
  if (!gate.ok) return gate.response;

  const { id } = await params;
  const errors = new ValidationErrors();
  if (!uuid({ id }, "id", errors)) return jsonError(400, "a valid assessment id is required");

  const access = await authorizeCbtAssessment({
    actor: gate.actor,
    assessmentId: id,
    intent: "staff",
  });
  if (!access.ok) return assessmentFailure(access);

  const opened = await openClientOr503(gate.actor);
  if (!opened.ok) return opened.response;
  const scoped = opened.client;

  const { data: assessment } = await scoped
    .from("cbt_assessments")
    .select("id, title, class_id, subject_id, term_id, component_id, status, max_attempts")
    .eq("id", id)
    .eq("school_id", gate.actor.schoolId)
    .maybeSingle();
  if (!assessment) return jsonError(404, "assessment not found");

  const { data: studentRows } = await scoped
    .from("students")
    .select("id, class_id, profiles(full_name)")
    .eq("school_id", gate.actor.schoolId)
    .eq("class_id", assessment.class_id)
    .order("id");

  const students = (studentRows ?? []).map((s) => {
    const profile = Array.isArray(s.profiles) ? s.profiles[0] : s.profiles;
    return {
      student_id: s.id as string,
      name: (profile?.full_name as string) ?? "Unnamed student",
    };
  });
  const studentIds = students.map((s) => s.student_id);

  const { data: attemptRows } = studentIds.length
    ? await scoped
        .from("cbt_attempts")
        .select("id, student_id, attempt_number, status, submitted_at, marked_at")
        .eq("school_id", gate.actor.schoolId)
        .eq("assessment_id", id)
        .in("student_id", studentIds)
        .order("attempt_number")
    : { data: [] };

  const attempts = attemptRows ?? [];
  const attemptIds = attempts.map((a) => a.id as string);

  const [{ data: resultRows }, { data: theoryRows }] = await Promise.all([
    attemptIds.length
      ? scoped
          .from("cbt_results")
          .select("attempt_id, total_score, max_score, percentage, is_official")
          .eq("school_id", gate.actor.schoolId)
          .in("attempt_id", attemptIds)
      : Promise.resolve({ data: [] }),
    // Only theory can be pending: objective answers are decided
    // deterministically at submit time.
    attemptIds.length
      ? scoped
          .from("cbt_attempt_questions")
          .select("id, attempt_id")
          .eq("school_id", gate.actor.schoolId)
          .eq("question_type", "theory")
          .in("attempt_id", attemptIds)
      : Promise.resolve({ data: [] }),
  ]);

  const theoryAttemptQuestions = theoryRows ?? [];
  const { data: answerRows } = theoryAttemptQuestions.length
    ? await scoped
        .from("cbt_attempt_answers")
        .select("attempt_question_id, awarded_marks")
        .eq("school_id", gate.actor.schoolId)
        .in(
          "attempt_question_id",
          theoryAttemptQuestions.map((q) => q.id as string),
        )
    : { data: [] };

  const awardedByQuestion = new Map(
    (answerRows ?? []).map((a) => [a.attempt_question_id as string, a.awarded_marks]),
  );

  const pendingByAttempt = new Map<string, number>();
  for (const q of theoryAttemptQuestions) {
    const attemptId = q.attempt_id as string;
    const awarded = awardedByQuestion.get(q.id as string);
    if (awarded === null || awarded === undefined) {
      pendingByAttempt.set(attemptId, (pendingByAttempt.get(attemptId) ?? 0) + 1);
    }
  }

  const resultByAttempt = new Map((resultRows ?? []).map((r) => [r.attempt_id as string, r]));

  const payload = students.map((student) => {
    const own = attempts.filter((a) => a.student_id === student.student_id);
    const official = own.find((a) => resultByAttempt.get(a.id as string)?.is_official === true);

    return {
      student_id: student.student_id,
      name: student.name,
      attempted: own.length > 0,
      official_attempt_id: (official?.id as string) ?? null,
      pending_theory: own.reduce(
        (sum, a) => sum + (pendingByAttempt.get(a.id as string) ?? 0),
        0,
      ),
      attempts: own.map((a) => {
        const result = resultByAttempt.get(a.id as string);
        return {
          id: a.id as string,
          attempt_number: Number(a.attempt_number),
          status: a.status as string,
          submitted_at: (a.submitted_at as string) ?? null,
          total_score: result ? Number(result.total_score) : null,
          max_score: result ? Number(result.max_score) : null,
          percentage: result?.percentage ?? null,
          is_official: result?.is_official === true,
          pending_theory: pendingByAttempt.get(a.id as string) ?? 0,
        };
      }),
    };
  });

  return NextResponse.json({
    assessment: {
      id: assessment.id,
      title: assessment.title,
      class_id: assessment.class_id,
      subject_id: assessment.subject_id ?? null,
      term_id: assessment.term_id ?? null,
      component_id: assessment.component_id ?? null,
      status: assessment.status,
      max_attempts: Number(assessment.max_attempts),
    },
    students: payload,
    summary: {
      class_size: students.length,
      attempted: payload.filter((s) => s.attempted).length,
      needing_marking: payload.filter((s) => s.pending_theory > 0).length,
      official_set: payload.filter((s) => s.official_attempt_id !== null).length,
    },
  });
}
