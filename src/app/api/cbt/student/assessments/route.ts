import { NextResponse } from "next/server";
import { actorGate, jsonError, openClientOr503 } from "@/lib/cbt/api";
import { canStartAnotherAttempt, isAttemptExpired, type OfficialAttemptRule } from "@/lib/cbt/attempt";
import { isCbtStaff } from "@/lib/cbt/authz";

/**
 * GET /api/cbt/student/assessments — what this student can sit, and where they are.
 *
 * One request drives the student's CBT screen: the published assessments for
 * their class, how many attempts they have used, any live attempt they should
 * resume rather than duplicate, and their official score once it exists.
 *
 * THREE THINGS THIS ENDPOINT DELIBERATELY DOES NOT DO
 *
 * 1. It does not return questions or answer keys. A student should not be handed
 *    a paper before starting it — `cbt_attempt_questions` is created for a
 *    specific attempt, snapshotted at that moment. Listing questions here would
 *    both leak the paper early and bypass the snapshot.
 * 2. It does not return another student's attempts. RLS restricts
 *    `cbt_attempts` to the student's own rows, and the explicit profile filter
 *    below is a second, independent barrier.
 * 3. It does not decide anything. `can_start` mirrors the rule the start
 *    endpoint enforces; if the two ever disagreed, the start endpoint wins and
 *    the UI shows whatever it says.
 */

export async function GET(request: Request) {
  const gate = await actorGate(request);
  if (!gate.ok) return gate.response;
  const { actor } = gate;

  if (isCbtStaff(actor)) {
    return jsonError(403, "this endpoint is for students; staff use /api/cbt/assessments");
  }

  const opened = await openClientOr503(actor);
  if (!opened.ok) return opened.response;
  const scoped = opened.client;

  const { data: student } = await scoped
    .from("students")
    .select("id, class_id")
    .eq("profile_id", actor.profileId)
    .eq("school_id", actor.schoolId)
    .maybeSingle();

  if (!student) {
    return NextResponse.json({ assessments: [] });
  }

  // Published assessments for this student's class. The RLS policy on
  // cbt_assessments enforces both conditions too — this is the readable version
  // of the same rule.
  const { data: assessmentRows } = await scoped
    .from("cbt_assessments")
    .select("id, title, instructions, max_attempts, time_limit_minutes, official_attempt_rule")
    .eq("school_id", actor.schoolId)
    .eq("class_id", student.class_id)
    .eq("status", "published")
    .order("created_at", { ascending: false });

  const assessments = assessmentRows ?? [];
  if (assessments.length === 0) return NextResponse.json({ assessments: [] });

  const assessmentIds = assessments.map((a) => a.id as string);

  const [{ data: attemptRows }, { data: resultRows }] = await Promise.all([
    scoped
      .from("cbt_attempts")
      .select("id, assessment_id, attempt_number, status, started_at, expires_at, submitted_at")
      .eq("school_id", actor.schoolId)
      .eq("student_id", student.id)
      .in("assessment_id", assessmentIds)
      .order("attempt_number"),
    scoped
      .from("cbt_results")
      .select("attempt_id, total_score, max_score, percentage, is_official")
      .eq("school_id", actor.schoolId)
      .eq("student_profile_id", actor.profileId),
  ]);

  const resultsByAttempt = new Map(
    (resultRows ?? []).map((r) => [r.attempt_id as string, r]),
  );

  const now = new Date();

  const payload = assessments.map((a) => {
    const id = a.id as string;
    const own = (attemptRows ?? []).filter((t) => t.assessment_id === id);
    const maxAttempts = Number(a.max_attempts);
    const used = own.filter((t) => t.status !== "invalidated").length;

    // A live attempt is the thing to resume. An EXPIRED one is not a blocker —
    // the student already lost that time and refusing a new attempt would strand
    // them — so it is reported but not offered as a resume target.
    const live = own.find(
      (t) =>
        t.status === "in_progress" && !isAttemptExpired(t.expires_at ? new Date(t.expires_at) : null, now),
    );

    const officialRow = own
      .map((t) => resultsByAttempt.get(t.id as string))
      .find((r) => r?.is_official === true);

    return {
      id,
      title: a.title as string,
      instructions: (a.instructions as string) ?? null,
      max_attempts: maxAttempts,
      time_limit_minutes: a.time_limit_minutes ?? null,
      official_attempt_rule: a.official_attempt_rule as OfficialAttemptRule,
      attempts_used: used,
      can_start: canStartAnotherAttempt(used, maxAttempts) && !live,
      resume_attempt_id: (live?.id as string) ?? null,
      attempts: own.map((t) => {
        const result = resultsByAttempt.get(t.id as string);
        return {
          id: t.id as string,
          attempt_number: Number(t.attempt_number),
          status: t.status as string,
          submitted_at: (t.submitted_at as string) ?? null,
          // A result is only exposed once the attempt is marked; the RLS policy on
          // cbt_results enforces the same thing underneath.
          total_score: result ? Number(result.total_score) : null,
          percentage: result?.percentage ?? null,
          is_official: result?.is_official === true,
        };
      }),
      official: officialRow
        ? {
            total_score: Number(officialRow.total_score),
            max_score: Number(officialRow.max_score),
            percentage: officialRow.percentage ?? null,
          }
        : null,
    };
  });

  return NextResponse.json({ assessments: payload });
}
