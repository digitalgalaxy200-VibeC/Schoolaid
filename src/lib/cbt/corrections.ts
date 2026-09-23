import type { SupabaseClient } from "@supabase/supabase-js";
import { totalAttempt, type QuestionType } from "./attempt";

/**
 * Publication, official-attempt selection and the correction audit (Phase 20).
 *
 * The rules this module exists to enforce:
 *
 *   - HISTORY IS SACRED. A later attempt never overwrites an earlier one, and
 *     nothing here deletes an attempt. "Correcting" a result means recording a
 *     new, audited fact — never rewriting the past.
 *   - EVERY CHANGE HAS A REASON AND AN AUTHOR. A correction without a reason is
 *     refused, and if the audit row cannot be written the correction does not
 *     happen. An unauditable correction is worse than no correction, because it
 *     looks like the score was always that way.
 *   - THE OFFICIAL ATTEMPT IS EXPLICIT. Attempt history, the official attempt
 *     and the official score are three distinct things (PD-4). Moving the
 *     official flag is a deliberate, audited act, never a side effect.
 *
 * One deliberate limit: a correction here is NOT blocked by the report-card
 * lock. The CBT record can be corrected at any time — the lock governs whether
 * that corrected score may be PUSHED into `student_scores`, which is Phase 19's
 * check. Blocking the correction instead would leave the two systems disagreeing
 * with no way to reconcile them, which is worse.
 */

export type Decision = { allowed: true } | { allowed: false; reason: string };

export type AttemptRow = {
  id: string;
  attempt_number: number;
  status: string;
  submitted_at: string | null;
  marked_at: string | null;
};

export type HistoryEntry = {
  attemptId: string;
  attemptNumber: number;
  status: string;
  submittedAt: string | null;
  totalScore: number | null;
  percentage: number | null;
  isOfficial: boolean;
};

/**
 * The student's attempt history, Take 1 / Take 2 / Take 3, oldest first.
 *
 * Every attempt is returned. Nothing is collapsed, filtered or summarised away —
 * a later attempt must never overwrite an earlier one, and the only way to
 * guarantee that is to hand back all of them.
 */
export function summariseAttemptHistory(
  attempts: AttemptRow[],
  results: { attempt_id: string; total_score: number; percentage: number | null; is_official: boolean }[],
): HistoryEntry[] {
  const byAttempt = new Map(results.map((r) => [r.attempt_id, r]));

  return attempts
    .slice()
    .sort((a, b) => a.attempt_number - b.attempt_number)
    .map((a) => {
      const result = byAttempt.get(a.id);
      return {
        attemptId: a.id,
        attemptNumber: a.attempt_number,
        status: a.status,
        submittedAt: a.submitted_at,
        totalScore: result ? Number(result.total_score) : null,
        percentage: result?.percentage ?? null,
        isOfficial: result?.is_official === true,
      };
    });
}

/**
 * Which rows should carry `is_official` after a move. Exactly one, or none.
 *
 * Returned as a plan so the write is a single decision rather than a sequence of
 * updates that could partially apply — two attempts briefly both official, or
 * none, depending on where a failure landed.
 */
export function planOfficialFlags<T extends { attempt_id: string; is_official: boolean }>(
  results: T[],
  officialAttemptId: string | null,
): { attempt_id: string; is_official: boolean }[] {
  return results
    .map((r) => ({
      attempt_id: r.attempt_id,
      is_official: officialAttemptId !== null && r.attempt_id === officialAttemptId,
    }))
    // Only emit rows whose flag actually changes, so the audit trail is not
    // padded with no-op writes.
    .filter((next) => {
      const current = results.find((r) => r.attempt_id === next.attempt_id);
      return current ? current.is_official !== next.is_official : true;
    });
}

/** May this attempt be made the official one? */
export function decideOfficialOverride(args: {
  attempts: AttemptRow[];
  attemptId: string;
  currentOfficialAttemptId: string | null;
}): Decision {
  const { attempts, attemptId, currentOfficialAttemptId } = args;

  const attempt = attempts.find((a) => a.id === attemptId);
  if (!attempt) {
    return { allowed: false, reason: "that attempt does not belong to this student and assessment" };
  }
  if (attempt.status !== "marked") {
    return {
      allowed: false,
      reason: `attempt ${attempt.attempt_number} is '${attempt.status}' — only a marked attempt can be official`,
    };
  }
  if (currentOfficialAttemptId === attemptId) {
    return { allowed: false, reason: `attempt ${attempt.attempt_number} is already the official attempt` };
  }

  return { allowed: true };
}

/**
 * A correction must say WHY. Five characters is not a meaningful threshold in
 * general, but it does reject "x", "-" and a stray keystroke, which is the class
 * of reason that makes an audit trail useless.
 */
export const MIN_REASON_LENGTH = 5;
export const MAX_REASON_LENGTH = 1000;

export function validateCorrectionReason(
  reason: string | null | undefined,
): { ok: true; reason: string } | { ok: false; error: string } {
  const trimmed = (reason ?? "").trim();

  if (trimmed.length === 0) {
    return { ok: false, error: "a reason is required for every correction" };
  }
  if (trimmed.length < MIN_REASON_LENGTH) {
    return { ok: false, error: `the reason must be at least ${MIN_REASON_LENGTH} characters` };
  }
  if (trimmed.length > MAX_REASON_LENGTH) {
    return { ok: false, error: `the reason must be at most ${MAX_REASON_LENGTH} characters` };
  }

  return { ok: true, reason: trimmed };
}

/** A corrected score must be a real score for this paper. */
export function validateCorrectedScore(args: {
  newScore: number | null;
  maxScore: number;
}): Decision {
  const { newScore, maxScore } = args;

  if (newScore === null) return { allowed: true }; // not changing the score
  if (!Number.isFinite(newScore)) return { allowed: false, reason: "the score must be a number" };
  if (newScore < 0) return { allowed: false, reason: "the score cannot be negative" };
  if (maxScore > 0 && newScore > maxScore) {
    return {
      allowed: false,
      reason: `the score cannot exceed the paper's maximum of ${maxScore}`,
    };
  }

  return { allowed: true };
}

/** Marks awarded to a single answer, validated against that question's marks. */
export function validateAnswerAward(args: {
  awarded: number | null;
  questionMarks: number;
}): Decision {
  const { awarded, questionMarks } = args;

  if (awarded === null) return { allowed: true };
  if (!Number.isFinite(awarded)) return { allowed: false, reason: "the award must be a number" };
  if (awarded < 0) return { allowed: false, reason: "the award cannot be negative" };
  if (awarded > questionMarks) {
    return {
      allowed: false,
      reason: `the award cannot exceed the question's ${questionMarks} mark(s)`,
    };
  }

  return { allowed: true };
}

// ── database ────────────────────────────────────────────────────────────────

export type CorrectionAction =
  | "official_attempt_override"
  | "result_score_correction"
  | "answer_mark_correction";

export type CorrectionEvent = {
  attemptId: string;
  assessmentId: string | null;
  studentId: string | null;
  questionId: string | null;
  actorId: string;
  action: CorrectionAction;
  previousValue: unknown;
  newValue: unknown;
  reason: string;
};

/**
 * Writes one audited correction.
 *
 * Returns a failure rather than swallowing it: callers must abort their own
 * change if the audit row cannot be written, so a correction can never exist
 * without a record of who made it and why.
 */
export async function recordCorrection(
  supabase: SupabaseClient,
  schoolId: string,
  event: CorrectionEvent,
): Promise<{ ok: true } | { error: string }> {
  const validated = validateCorrectionReason(event.reason);
  if (!validated.ok) return { error: validated.error };

  const { error } = await supabase.from("cbt_correction_events").insert({
    school_id: schoolId,
    attempt_id: event.attemptId,
    assessment_id: event.assessmentId,
    student_id: event.studentId,
    question_id: event.questionId,
    actor_id: event.actorId,
    action: event.action,
    previous_value: event.previousValue,
    new_value: event.newValue,
    reason: validated.reason,
  });

  return error ? { error: error.message } : { ok: true };
}

/** Everything that has ever been corrected on an attempt, newest first. */
export async function loadCorrectionHistory(
  supabase: SupabaseClient,
  args: { schoolId: string; attemptId: string },
): Promise<
  {
    action: string;
    previousValue: unknown;
    newValue: unknown;
    reason: string;
    actorId: string | null;
    createdAt: string;
  }[]
> {
  const { data } = await supabase
    .from("cbt_correction_events")
    .select("action, previous_value, new_value, reason, actor_id, created_at")
    .eq("school_id", args.schoolId)
    .eq("attempt_id", args.attemptId)
    .order("created_at", { ascending: false });

  return (data ?? []).map((e) => ({
    action: e.action,
    previousValue: e.previous_value,
    newValue: e.new_value,
    reason: e.reason,
    actorId: e.actor_id ?? null,
    createdAt: e.created_at,
  }));
}

/**
 * Recomputes an attempt's result from the awards already stored against its
 * answers, WITHOUT re-marking objective answers.
 *
 * This is the correction primitive. Re-running the full marking pass would be
 * wrong here: it would overwrite a teacher's deliberate award for a theory
 * answer with the stored objective value, silently undoing the correction that
 * was just made.
 *
 * It also promotes the attempt from `submitted` to `marked` once no theory
 * answer is left without an award — the moment the attempt becomes eligible to
 * be the official one.
 */
export async function recomputeResultFromStoredAwards(
  supabase: SupabaseClient,
  args: { schoolId: string; attemptId: string; now: Date },
): Promise<{ ok: true; totalScore: number; percentage: number | null; marked: boolean } | { error: string }> {
  const { schoolId, attemptId, now } = args;

  const { data: questions } = await supabase
    .from("cbt_attempt_questions")
    .select("id, question_type, marks")
    .eq("school_id", schoolId)
    .eq("attempt_id", attemptId);

  const { data: answers } = await supabase
    .from("cbt_attempt_answers")
    .select("attempt_question_id, awarded_marks")
    .eq("school_id", schoolId)
    .eq("attempt_id", attemptId);

  const questionRows = (questions ?? []) as {
    id: string;
    question_type: QuestionType;
    marks: number;
  }[];
  if (questionRows.length === 0) return { error: "the attempt has no questions" };

  const awardByQuestion = new Map(
    ((answers ?? []) as { attempt_question_id: string; awarded_marks: number | null }[]).map((a) => [
      a.attempt_question_id,
      a.awarded_marks,
    ]),
  );

  let pendingTheory = 0;
  const score = totalAttempt(
    questionRows.map((q) => {
      const awarded = awardByQuestion.get(q.id) ?? null;
      if (q.question_type === "theory" && awarded === null) pendingTheory += 1;
      return {
        marks: Number(q.marks),
        questionType: q.question_type,
        // Objective awards were decided deterministically at submit time and are
        // stored, so they are read back rather than recalculated.
        objectiveAwarded: q.question_type === "theory" ? 0 : (awarded ?? 0),
        subjectiveAwarded: q.question_type === "theory" ? awarded : null,
      };
    }),
  );

  const marked = pendingTheory === 0;

  const { error } = await supabase.from("cbt_results").upsert(
    {
      school_id: schoolId,
      attempt_id: attemptId,
      objective_score: score.objectiveScore,
      subjective_score: score.subjectiveScore,
      total_score: score.totalScore,
      max_score: score.maxScore,
      percentage: score.percentage,
      computed_at: now.toISOString(),
    },
    { onConflict: "attempt_id" },
  );
  if (error) return { error: error.message };

  const { error: attemptError } = await supabase
    .from("cbt_attempts")
    .update({
      status: marked ? "marked" : "submitted",
      marked_at: marked ? now.toISOString() : null,
    })
    .eq("id", attemptId)
    .eq("school_id", schoolId);
  if (attemptError) return { error: attemptError.message };

  return { ok: true, totalScore: score.totalScore, percentage: score.percentage, marked };
}

/**
 * Moves the official flag, with an audit row.
 *
 * THE AUDIT IS WRITTEN FIRST. If it fails, the flags are not touched — so the
 * database can never hold an official-attempt change that nobody authorised.
 */
export async function setOfficialAttempt(
  supabase: SupabaseClient,
  args: {
    schoolId: string;
    assessmentId: string;
    attemptId: string;
    actorId: string;
    reason: string;
    attempts: AttemptRow[];
    results: { attempt_id: string; is_official: boolean }[];
    currentOfficialAttemptId: string | null;
    studentId: string | null;
  },
): Promise<{ ok: true; changed: number } | { error: string }> {
  const decision = decideOfficialOverride({
    attempts: args.attempts,
    attemptId: args.attemptId,
    currentOfficialAttemptId: args.currentOfficialAttemptId,
  });
  if (!decision.allowed) return { error: decision.reason };

  const audit = await recordCorrection(supabase, args.schoolId, {
    attemptId: args.attemptId,
    assessmentId: args.assessmentId,
    studentId: args.studentId,
    questionId: null,
    actorId: args.actorId,
    action: "official_attempt_override",
    previousValue: { official_attempt_id: args.currentOfficialAttemptId },
    newValue: { official_attempt_id: args.attemptId },
    reason: args.reason,
  });
  if ("error" in audit) return audit;

  const flags = planOfficialFlags(args.results, args.attemptId);

  for (const flag of flags) {
    const { error } = await supabase
      .from("cbt_results")
      .update({
        is_official: flag.is_official,
        official_set_by: args.actorId,
        official_set_at: new Date().toISOString(),
      })
      .eq("school_id", args.schoolId)
      .eq("attempt_id", flag.attempt_id);
    if (error) return { error: error.message };
  }

  return { ok: true, changed: flags.length };
}

/**
 * Corrects the official total for an attempt.
 *
 * The attempt's own marking is untouched: this records a deliberate, reasoned
 * adjustment on the result. The previous value and the new value both go into
 * the audit row, so the investigation view can show exactly what moved.
 */
export async function correctResultScore(
  supabase: SupabaseClient,
  args: {
    schoolId: string;
    assessmentId: string;
    attemptId: string;
    studentId: string | null;
    actorId: string;
    newScore: number;
    reason: string;
    maxScore: number;
    currentScore: number;
    now: Date;
  },
): Promise<{ ok: true } | { error: string }> {
  const check = validateCorrectedScore({ newScore: args.newScore, maxScore: args.maxScore });
  if (!check.allowed) return { error: check.reason };

  const audit = await recordCorrection(supabase, args.schoolId, {
    attemptId: args.attemptId,
    assessmentId: args.assessmentId,
    studentId: args.studentId,
    questionId: null,
    actorId: args.actorId,
    action: "result_score_correction",
    previousValue: { total_score: args.currentScore },
    newValue: { total_score: args.newScore },
    reason: args.reason,
  });
  if ("error" in audit) return audit;

  const percentage =
    args.maxScore > 0
      ? Math.round((args.newScore / args.maxScore) * 10000) / 100
      : null;

  const { error } = await supabase
    .from("cbt_results")
    .update({ total_score: args.newScore, percentage, computed_at: args.now.toISOString() })
    .eq("school_id", args.schoolId)
    .eq("attempt_id", args.attemptId);
  if (error) return { error: error.message };

  return { ok: true };
}

/**
 * Records a teacher's award for one answer, then recomputes the attempt.
 *
 * The award is validated against that question's marks, so a typo cannot award
 * 50 out of 5 and quietly inflate a report card.
 */
export async function correctAnswerAward(
  supabase: SupabaseClient,
  args: {
    schoolId: string;
    assessmentId: string;
    attemptId: string;
    studentId: string | null;
    actorId: string;
    attemptQuestionId: string;
    questionId: string | null;
    awarded: number;
    previousAwarded: number | null;
    questionMarks: number;
    reason: string;
    now: Date;
  },
): Promise<{ ok: true; totalScore: number; marked: boolean } | { error: string }> {
  const check = validateAnswerAward({ awarded: args.awarded, questionMarks: args.questionMarks });
  if (!check.allowed) return { error: check.reason };

  const audit = await recordCorrection(supabase, args.schoolId, {
    attemptId: args.attemptId,
    assessmentId: args.assessmentId,
    studentId: args.studentId,
    questionId: args.questionId,
    actorId: args.actorId,
    action: "answer_mark_correction",
    previousValue: { awarded_marks: args.previousAwarded },
    newValue: { awarded_marks: args.awarded },
    reason: args.reason,
  });
  if ("error" in audit) return audit;

  const { error } = await supabase
    .from("cbt_attempt_answers")
    .update({ awarded_marks: args.awarded, marked_by: args.actorId, marked_at: args.now.toISOString() })
    .eq("school_id", args.schoolId)
    .eq("attempt_id", args.attemptId)
    .eq("attempt_question_id", args.attemptQuestionId);
  if (error) return { error: error.message };

  const recomputed = await recomputeResultFromStoredAwards(supabase, {
    schoolId: args.schoolId,
    attemptId: args.attemptId,
    now: args.now,
  });
  if ("error" in recomputed) return recomputed;

  return { ok: true, totalScore: recomputed.totalScore, marked: recomputed.marked };
}
