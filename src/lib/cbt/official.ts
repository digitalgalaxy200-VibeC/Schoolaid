import type { SupabaseClient } from "@supabase/supabase-js";
import { readReportCardLock } from "@/lib/report-card";
import { planOfficialFlags } from "./corrections";
import { shouldRecomputeOfficialScore } from "./delivery";

/**
 * Official-attempt promotion, shared by the two moments a paper can complete.
 *
 * An attempt becomes ELIGIBLE to be the official result only once it is `marked`:
 * at submit time for an all-objective paper, and after the LAST theory award for a
 * paper with written questions. Both moments run the same decision here, so they
 * cannot disagree about which attempt is official.
 *
 * This module never fails an operation that has already succeeded: marking a paper
 * (or submitting one) is the user's action, and a promotion problem is reported as
 * a note, never by undoing it. The report-card lock (PD-3) still blocks promotion,
 * for the same reason it blocks the score push.
 */

export type PromotionOutcome = {
  /** Non-null when the caller should tell someone why nothing moved. */
  note: string | null;
  /**
   * Set ONLY when this call applied a new official flag. Null means "nothing
   * changed" (already official, manual rule, or locked) — not "no attempt".
   */
  officialAttemptId: string | null;
};

export async function promoteOfficialAttempt(
  scoped: SupabaseClient,
  service: SupabaseClient,
  args: { schoolId: string; assessmentId: string; studentId: string; now?: Date },
): Promise<PromotionOutcome> {
  const now = args.now ?? new Date();

  const { data: assessment } = await scoped
    .from("cbt_assessments")
    .select("id, class_id, term_id, max_attempts, time_limit_minutes, official_attempt_rule, status")
    .eq("id", args.assessmentId)
    .eq("school_id", args.schoolId)
    .maybeSingle();

  if (!assessment) {
    return {
      note: "the assessment could not be resolved, so the official attempt was not updated",
      officialAttemptId: null,
    };
  }

  const lock = await readReportCardLock(
    service,
    args.schoolId,
    assessment.class_id,
    assessment.term_id,
  );

  const [{ data: attemptRows }, { data: resultRows }] = await Promise.all([
    scoped
      .from("cbt_attempts")
      .select("id, attempt_number, status")
      .eq("assessment_id", args.assessmentId)
      .eq("student_id", args.studentId)
      .eq("school_id", args.schoolId),
    scoped
      .from("cbt_results")
      .select("attempt_id, total_score, is_official")
      .eq("assessment_id", args.assessmentId)
      .eq("student_id", args.studentId)
      .eq("school_id", args.schoolId),
  ]);

  const candidates = (attemptRows ?? []).map((a) => ({
    id: a.id as string,
    attempt_number: Number(a.attempt_number),
    status: a.status as string,
    total_score: Number(
      (resultRows ?? []).find((r) => r.attempt_id === a.id)?.total_score ?? 0,
    ),
  }));

  const currentOfficial =
    (resultRows ?? []).find((r) => r.is_official === true)?.attempt_id ?? null;

  const decision = shouldRecomputeOfficialScore({
    assessment: {
      id: assessment.id,
      status: assessment.status,
      max_attempts: Number(assessment.max_attempts),
      time_limit_minutes: assessment.time_limit_minutes ?? null,
      official_attempt_rule: assessment.official_attempt_rule,
    },
    attempts: candidates,
    currentOfficialAttemptId: currentOfficial,
    reportCardLocked: lock.locked,
  });

  if (!decision.recompute) {
    return { note: decision.reason, officialAttemptId: null };
  }

  const flags = planOfficialFlags(
    (resultRows ?? []) as { attempt_id: string; is_official: boolean }[],
    decision.attemptId,
  );
  for (const flag of flags) {
    await service
      .from("cbt_results")
      .update({ is_official: flag.is_official, official_set_at: now.toISOString() })
      .eq("school_id", args.schoolId)
      .eq("attempt_id", flag.attempt_id);
  }

  if (decision.attemptId === null) {
    return {
      note: "no attempt is currently eligible to be the official result",
      officialAttemptId: null,
    };
  }

  return { note: null, officialAttemptId: decision.attemptId };
}
