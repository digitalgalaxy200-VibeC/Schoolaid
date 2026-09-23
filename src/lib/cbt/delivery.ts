import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildAttemptSnapshot,
  computeAttemptExpiry,
  gradeObjectiveAnswer,
  isAttemptExpired,
  selectOfficialAttempt,
  totalAttempt,
  canStartAnotherAttempt,
  type AttemptQuestion,
  type AttemptScore,
  type OfficialAttemptRule,
  type QuestionType,
} from "./attempt";

/**
 * CBT delivery engine (Phase 18).
 *
 * This is the part that decides whether a student may start, continue, save or
 * submit, and it is deliberately hostile to the client:
 *
 *   - The CLOCK IS THE SERVER'S. `expires_at` is computed once at start from the
 *     assessment's time limit and is the only authority. The browser is never
 *     asked how much time is left, and a client-supplied timestamp is never
 *     trusted. A student editing their device clock changes nothing.
 *   - ANSWERS ARE WRITTEN PER QUESTION, and are accepted only while the attempt
 *     is genuinely open. Autosave is not a way to smuggle in answers after the
 *     deadline.
 *   - OBJECTIVE MARKING IS DETERMINISTIC AND HAS NO AI. It compares stored
 *     option identities. Theory never auto-marks: it waits for a human, because
 *     a machine's guess must not become an official score.
 *
 * Everything decision-shaped here is a pure function taking `now` as an
 * argument, so a clock is never read implicitly and the behaviour is testable
 * without freezing time globally.
 */

export type Decision = { allowed: true } | { allowed: false; reason: string; code: string };

export type AttemptSummary = {
  id: string;
  attempt_number: number;
  status: "in_progress" | "submitted" | "marked" | "invalidated";
  started_at: string;
  expires_at: string | null;
  submitted_at: string | null;
};

export type AssessmentRuntime = {
  id: string;
  status: string;
  max_attempts: number;
  time_limit_minutes: number | null;
  official_attempt_rule: OfficialAttemptRule;
};

/**
 * May this student start a NEW attempt now?
 *
 * An expired in-progress attempt is not a blocker: the student lost that time
 * through no fault of the engine's, and refusing a new attempt would strand them
 * with nothing. A LIVE in-progress attempt IS a blocker, and the caller is told
 * to resume instead — starting a second attempt while the first is running would
 * let a student work both in parallel.
 */
export function decideStartAttempt(args: {
  assessment: AssessmentRuntime;
  attempts: AttemptSummary[];
  now: Date;
}): Decision & { resume?: AttemptSummary } {
  const { assessment, attempts, now } = args;

  if (assessment.status !== "published") {
    return { allowed: false, reason: "this assessment is not open", code: "not_published" };
  }

  const live = attempts.find(
    (a) => a.status === "in_progress" && !isAttemptExpired(parseOrNull(a.expires_at), now),
  );
  if (live) {
    return {
      allowed: false,
      reason: "an attempt is already in progress",
      code: "attempt_in_progress",
      resume: live,
    };
  }

  const used = attempts.filter((a) => a.status !== "invalidated").length;
  if (!canStartAnotherAttempt(used, assessment.max_attempts)) {
    return {
      allowed: false,
      reason: `all ${assessment.max_attempts} attempt(s) have been used`,
      code: "no_attempts_left",
    };
  }

  return { allowed: true };
}

/** Attempt numbers are contiguous and never reused, including after invalidation. */
export function nextAttemptNumber(attempts: { attempt_number: number }[]): number {
  return attempts.reduce((max, a) => Math.max(max, a.attempt_number), 0) + 1;
}

/**
 * May this student write an answer right now?
 *
 * The expiry check is the load-bearing one. It runs on every autosave, not only
 * at submit, so a student cannot keep answering past the deadline and then
 * submit a complete paper.
 */
export function decideAnswerWrite(args: {
  attempt: AttemptSummary;
  now: Date;
}): Decision {
  const { attempt, now } = args;

  if (attempt.status !== "in_progress") {
    return {
      allowed: false,
      reason: `the attempt is ${attempt.status} and can no longer be changed`,
      code: "attempt_closed",
    };
  }
  if (isAttemptExpired(parseOrNull(attempt.expires_at), now)) {
    return { allowed: false, reason: "the time allowed for this attempt has ended", code: "expired" };
  }

  return { allowed: true };
}

/**
 * May this student submit? Submitting is allowed AT or slightly AFTER expiry:
 * the student's work is saved server-side, so a submission that arrives as the
 * clock runs out must be accepted rather than discarded.
 */
export function decideSubmit(args: { attempt: AttemptSummary; now: Date }): Decision {
  const { attempt } = args;

  if (attempt.status === "in_progress") return { allowed: true };
  if (attempt.status === "submitted" || attempt.status === "marked") {
    return { allowed: false, reason: "this attempt was already submitted", code: "already_submitted" };
  }
  return {
    allowed: false,
    reason: `the attempt is ${attempt.status} and cannot be submitted`,
    code: "attempt_closed",
  };
}

function parseOrNull(value: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

// ── marking ─────────────────────────────────────────────────────────────────

export type AnswerRow = {
  attempt_question_id: string;
  selected_option_id: string | null;
  answer_text: string | null;
  awarded_marks: number | null;
};

export type MarkedRow = {
  attemptQuestionId: string;
  questionType: QuestionType;
  marks: number;
  /** Deterministic result for objective questions; the student's zero-or-marks. */
  objectiveAwarded: number;
  /** A teacher's (or approved AI-suggested) award for theory. */
  subjectiveAwarded: number | null;
  /** True when this row still needs a human before the result can be official. */
  needsHuman: boolean;
};

export type MarkingPlan = {
  rows: MarkedRow[];
  score: AttemptScore;
  /** How many theory answers are still waiting for a person. */
  pendingHuman: number;
};

/**
 * Builds the marking plan for a submitted attempt.
 *
 * Objective answers are decided here and now, by identity. Theory answers are
 * carried forward as pending unless a teacher has already awarded marks — the
 * guard against a result becoming official while a human has not looked at it.
 */
export function planMarking(args: {
  questions: (AttemptQuestion & { attempt_question_id: string })[];
  answers: AnswerRow[];
}): MarkingPlan {
  const { questions, answers } = args;
  const byQuestion = new Map(answers.map((a) => [a.attempt_question_id, a]));

  const rows: MarkedRow[] = [];
  let pendingHuman = 0;

  for (const q of questions) {
    const answer = byQuestion.get(q.attempt_question_id);

    if (q.question_type === "theory") {
      const awarded = answer?.awarded_marks ?? null;
      if (awarded === null) pendingHuman += 1;
      rows.push({
        attemptQuestionId: q.attempt_question_id,
        questionType: "theory",
        marks: q.marks,
        objectiveAwarded: 0,
        subjectiveAwarded: awarded,
        needsHuman: awarded === null,
      });
      continue;
    }

    const grade = gradeObjectiveAnswer({
      questionType: q.question_type,
      correctOptionId: q.correct_option_id,
      selectedOptionId: answer?.selected_option_id ?? null,
      marks: q.marks,
    });

    rows.push({
      attemptQuestionId: q.attempt_question_id,
      questionType: q.question_type,
      marks: q.marks,
      objectiveAwarded: grade.awarded,
      subjectiveAwarded: null,
      needsHuman: false,
    });
  }

  const score = totalAttempt(
    rows.map((r) => ({
      marks: r.marks,
      questionType: r.questionType,
      objectiveAwarded: r.objectiveAwarded,
      subjectiveAwarded: r.subjectiveAwarded,
    })),
  );

  return { rows, score, pendingHuman };
}

/**
 * Which attempt should hold the official result?
 *
 * PD-4: history / official attempt / official score are three distinct things.
 * `manual` deliberately returns null so a human must choose, and the choice is
 * audited by the caller.
 */
export function resolveOfficialAttempt(args: {
  candidates: { id: string; attempt_number: number; total_score: number; status: string }[];
  rule: OfficialAttemptRule;
}): string | null {
  // Only a marked attempt may be official — an unmarked one has no final score.
  const eligible = args.candidates.filter((c) => c.status === "marked");
  if (eligible.length === 0) return null;

  const chosen = selectOfficialAttempt(
    eligible.map((c) => ({
      id: c.id,
      attempt_number: c.attempt_number,
      total_score: c.total_score,
    })),
    args.rule,
  );

  return chosen?.id ?? null;
}

/**
 * Contradiction B (spec §3).
 *
 * A student may always take a further attempt, and it is always recorded — but
 * while the class+term report card is published, the official score must NOT be
 * recomputed, because published means locked (PD-3). The attempt simply waits
 * for the next retraction cycle.
 *
 * Returning a reason rather than a bare boolean so the API can tell a teacher
 * why their score did not move.
 */
export function shouldRecomputeOfficialScore(args: {
  assessment: AssessmentRuntime;
  attempts: { id: string; attempt_number: number; total_score: number; status: string }[];
  currentOfficialAttemptId: string | null;
  reportCardLocked: boolean;
}): { recompute: true; attemptId: string | null } | { recompute: false; reason: string } {
  const { assessment, attempts, currentOfficialAttemptId, reportCardLocked } = args;

  if (reportCardLocked) {
    return {
      recompute: false,
      reason:
        "the report card for this class and term is published, so the official score is locked; " +
        "it will be recomputed when the report card is retracted for correction",
    };
  }

  const next = resolveOfficialAttempt({
    candidates: attempts,
    rule: assessment.official_attempt_rule,
  });

  // A manual rule yields null: never silently overwrite a human's choice.
  if (next === null && assessment.official_attempt_rule === "manual") {
    return {
      recompute: false,
      reason: "the official attempt is set manually for this assessment",
    };
  }

  if (next === currentOfficialAttemptId) {
    return { recompute: false, reason: "the official attempt has not changed" };
  }

  return { recompute: true, attemptId: next };
}

// ── database helpers ────────────────────────────────────────────────────────

/** Loads a student's attempts for one assessment, oldest first. */
export async function loadAttempts(
  supabase: SupabaseClient,
  args: { schoolId: string; assessmentId: string; studentId: string },
): Promise<AttemptSummary[]> {
  const { data } = await supabase
    .from("cbt_attempts")
    .select("id, attempt_number, status, started_at, expires_at, submitted_at")
    .eq("school_id", args.schoolId)
    .eq("assessment_id", args.assessmentId)
    .eq("student_id", args.studentId)
    .order("attempt_number");

  return (data ?? []) as AttemptSummary[];
}

/**
 * Creates an attempt and freezes the questions presented to the student.
 *
 * The snapshot is assembled with a client that can read the question bank and
 * the answer keys — which a student cannot. That is intentional and is why the
 * student's own token is never allowed to build this: the frozen key travels
 * into `cbt_attempt_questions`, which students may only SELECT.
 */
export async function createAttempt(
  staffSupabase: SupabaseClient,
  scoped: SupabaseClient,
  args: {
    schoolId: string;
    assessmentId: string;
    studentId: string;
    studentProfileId: string | null;
    attemptNumber: number;
    timeLimitMinutes: number | null;
    questionIds: string[];
    questionSources: {
      id: string;
      question_type: QuestionType;
      question_text: string;
      marks: number;
    }[];
    options: { id: string; question_id: string; label: string | null; option_text: string; display_order: number }[];
    answerKeys: { question_id: string; correct_option_id: string | null; model_answer: string | null; marking_rubric: string | null }[];
    marksOverrides?: Record<string, number>;
    now: Date;
  },
): Promise<{ attemptId: string } | { error: string }> {
  const snapshot = buildAttemptSnapshot({
    questionIds: args.questionIds,
    questions: args.questionSources,
    options: args.options,
    answerKeys: args.answerKeys,
    marksOverrides: args.marksOverrides,
  });

  if (snapshot.length === 0) {
    return { error: "this assessment has no questions to present" };
  }

  const expiresAt = computeAttemptExpiry(args.now, args.timeLimitMinutes);

  const { data: attempt, error } = await scoped
    .from("cbt_attempts")
    .insert({
      school_id: args.schoolId,
      assessment_id: args.assessmentId,
      student_id: args.studentId,
      student_profile_id: args.studentProfileId,
      attempt_number: args.attemptNumber,
      status: "in_progress",
      started_at: args.now.toISOString(),
      expires_at: expiresAt ? expiresAt.toISOString() : null,
    })
    .select("id")
    .single();

  if (error || !attempt) return { error: error?.message ?? "could not start the attempt" };
  const attemptId = attempt.id as string;

  // The snapshot is written with the staff client: it must carry the answer key,
  // and the student's token could not read it. The `staffSupabase` argument is
  // named to make that asymmetry explicit at every call site.
  const { error: snapshotError } = await staffSupabase.from("cbt_attempt_questions").insert(
    snapshot.map((q) => ({
      school_id: args.schoolId,
      attempt_id: attemptId,
      student_profile_id: args.studentProfileId,
      question_id: q.question_id,
      display_order: q.display_order,
      question_type: q.question_type,
      question_text: q.question_text,
      options_snapshot: q.options_snapshot,
      correct_option_id: q.correct_option_id,
      model_answer: q.model_answer,
      marking_rubric: q.marking_rubric,
      marks: q.marks,
    })),
  );

  if (snapshotError) {
    // Leaving a half-built attempt behind would show the student an empty paper
    // they cannot be given answers for. Remove it rather than orphan it.
    await staffSupabase.from("cbt_attempts").delete().eq("id", attemptId).eq("school_id", args.schoolId);
    return { error: `could not freeze the questions: ${snapshotError.message}` };
  }

  return { attemptId };
}

/**
 * Marks an attempt and writes its result.
 *
 * Theory answers with no teacher award leave the attempt `submitted` rather than
 * `marked`: an attempt with an unresolved theory answer is not a final result,
 * and `resolveOfficialAttempt` refuses anything not `marked`.
 *
 * `assessmentId` and `studentId` are denormalised onto the result so that "one
 * official result per student per assessment" can be a database index rather
 * than a convention (migration 048).
 */
export async function markAndStore(
  supabase: SupabaseClient,
  args: {
    schoolId: string;
    attemptId: string;
    assessmentId: string;
    studentId: string;
    questions: (AttemptQuestion & { attempt_question_id: string })[];
    answers: AnswerRow[];
    now: Date;
  },
): Promise<{ ok: true; score: AttemptScore; pendingHuman: number } | { error: string }> {
  const { schoolId, attemptId, assessmentId, studentId, questions, answers, now } = args;

  const plan = planMarking({ questions, answers });

  const objective = plan.rows.filter((r) => r.questionType !== "theory");
  for (const row of objective) {
    const { error } = await supabase
      .from("cbt_attempt_answers")
      .update({ awarded_marks: row.objectiveAwarded, marked_at: now.toISOString() })
      .eq("attempt_id", attemptId)
      .eq("attempt_question_id", row.attemptQuestionId)
      .eq("school_id", schoolId);
    if (error) return { error: error.message };
  }

  const attemptStatus = plan.pendingHuman === 0 ? "marked" : "submitted";
  const { error: attemptError } = await supabase
    .from("cbt_attempts")
    .update({
      status: attemptStatus,
      submitted_at: now.toISOString(),
      marked_at: plan.pendingHuman === 0 ? now.toISOString() : null,
    })
    .eq("id", attemptId)
    .eq("school_id", schoolId);
  if (attemptError) return { error: attemptError.message };

  const { error: resultError } = await supabase.from("cbt_results").upsert(
    {
      school_id: schoolId,
      attempt_id: attemptId,
      assessment_id: assessmentId,
      student_id: studentId,
      objective_score: plan.score.objectiveScore,
      subjective_score: plan.score.subjectiveScore,
      total_score: plan.score.totalScore,
      max_score: plan.score.maxScore,
      percentage: plan.score.percentage,
      computed_at: now.toISOString(),
    },
    { onConflict: "attempt_id" },
  );
  if (resultError) return { error: resultError.message };

  return { ok: true, score: plan.score, pendingHuman: plan.pendingHuman };
}
