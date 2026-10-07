import type { SupabaseClient } from "@supabase/supabase-js";
import { readQuestionMediaMap } from "./media";
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
 *
 * The paper's SECTIONS (heading + instruction) are frozen on the attempt too,
 * for the same reason: a later edit to the assessment must not change what this
 * student saw mid-attempt.
 */
export async function createAttempt(
  staffSupabase: SupabaseClient,
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
      section?: string | null;
    }[];
    options: { id: string; question_id: string; label: string | null; option_text: string; display_order: number }[];
    answerKeys: { question_id: string; correct_option_id: string | null; model_answer: string | null; marking_rubric: string | null }[];
    marksOverrides?: Record<string, number>;
    /** The paper's sections as configured, frozen with the paper. */
    sections?: { label: string; instruction: string | null }[] | null;
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

  // The attempt row is server-owned: migration 046 gives a student SELECT-only
  // access to cbt_attempts ("timing is server-owned"), so it is written with the
  // service client — the same client that carries the answer key into the
  // snapshot below. A student can never insert an attempt directly; the
  // transport harness pins that refusal (D11).
  const { data: attempt, error } = await staffSupabase
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
      // Written only when the paper actually has sections, so this insert stays
      // valid on a database that has not run migration 062 yet.
      ...(args.sections && args.sections.length > 0 ? { sections: args.sections } : {}),
    })
    .select("id")
    .single();

  if (error || !attempt) return { error: error?.message ?? "could not start the attempt" };
  const attemptId = attempt.id as string;

  // The snapshot is written with the staff client for the same reason, plus one
  // more: it must carry the answer key, which the student's token could not read.
  // The `staffSupabase` argument is named to make that asymmetry explicit.
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
      // Same rule as the attempt's sections: only when there is one to write,
      // so a database without migration 063 still records the attempt.
      ...(q.section ? { section: q.section } : {}),
      ...(q.media ? { media: q.media } : {}),
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

// ── replacing the paper of an attempt still in progress ─────────────────────

export type ResyncedAnswer = {
  attempt_question_id: string;
  selected_option_id: string | null;
  answer_text: string | null;
};

/**
 * Plans which of a student's answers can survive the paper being replaced.
 *
 * The rule is deliberately conservative. An answer is carried over only when the
 * QUESTION it answered is still on the paper. A multiple-choice selection
 * additionally has to still exist among that question's options — if the teacher
 * removed or replaced the option, the selection is DROPPED rather than silently
 * re-pointed at whatever option took its place. Theory text is carried over
 * whenever the question survives, because losing written work is worse than
 * showing it against a slightly changed question.
 */
export function planAnswerRestore(args: {
  oldQuestions: { id: string; question_id: string | null }[];
  oldAnswers: {
    attempt_question_id: string;
    selected_option_id: string | null;
    answer_text: string | null;
  }[];
  newQuestions: {
    id: string;
    question_id: string | null;
    options_snapshot: { option_id: string }[] | null;
  }[];
}): ResyncedAnswer[] {
  const questionIdByOldRow = new Map(args.oldQuestions.map((q) => [q.id, q.question_id]));
  const newByQuestionId = new Map(
    args.newQuestions
      .filter((q): q is { id: string; question_id: string; options_snapshot: { option_id: string }[] | null } =>
        Boolean(q.question_id),
      )
      .map((q) => [q.question_id, q]),
  );

  const out: ResyncedAnswer[] = [];
  for (const answer of args.oldAnswers) {
    const questionId = questionIdByOldRow.get(answer.attempt_question_id);
    if (!questionId) continue;

    const target = newByQuestionId.get(questionId);
    if (!target) continue;

    const offered = Array.isArray(target.options_snapshot) ? target.options_snapshot : [];
    const selected =
      answer.selected_option_id !== null && offered.some((o) => o.option_id === answer.selected_option_id)
        ? answer.selected_option_id
        : null;
    const text = (answer.answer_text ?? "").trim() !== "" ? answer.answer_text : null;

    // Nothing left to restore means the teacher's edit resolved the answer
    // entirely (e.g. the question became theory with no text written): the
    // student answers it fresh, which is exactly what the notice tells them.
    if (selected === null && text === null) continue;

    out.push({ attempt_question_id: target.id, selected_option_id: selected, answer_text: text });
  }

  return out;
}

export type ResyncOutcome = { updated: number; error: string | null };

/**
 * Re-points every IN-PROGRESS attempt at the paper as it stands now.
 *
 * Called at republish, after a corrected paper goes back out. Submitted and
 * marked attempts are never touched — their snapshot is what they sat, and this
 * function would not be allowed to rewrite it (migration 046 blocks UPDATE on
 * cbt_attempt_questions; the replacement here is DELETE + INSERT, which is the
 * only shape that can carry a corrected paper).
 *
 * The student's answers are carried across by `planAnswerRestore`, and the
 * attempt is stamped `paper_changed_at` so its screen can say the paper moved
 * under them. The stamp is best-effort: on a database that has not run
 * migration 068 the replacement still happens, only the notice is unavailable.
 */
export async function resyncInProgressAttempts(
  service: SupabaseClient,
  args: { schoolId: string; assessmentId: string; now: Date },
): Promise<ResyncOutcome> {
  const { schoolId, assessmentId, now } = args;

  const { data: attemptRows, error: attemptError } = await service
    .from("cbt_attempts")
    .select("id, student_profile_id")
    .eq("school_id", schoolId)
    .eq("assessment_id", assessmentId)
    .eq("status", "in_progress");
  if (attemptError) return { updated: 0, error: attemptError.message };

  const attempts = attemptRows ?? [];
  if (attempts.length === 0) return { updated: 0, error: null };

  // The paper as it stands now — the same reads the start path makes.
  const { data: links } = await service
    .from("cbt_assessment_questions")
    .select("question_id, display_order, marks_override")
    .eq("assessment_id", assessmentId)
    .eq("school_id", schoolId)
    .order("display_order");

  const questionIds = (links ?? []).map((l) => l.question_id as string);
  if (questionIds.length === 0) return { updated: 0, error: "the paper has no questions" };

  const [{ data: questions }, { data: options }, { data: answerKeys }, mediaMap, { data: assessmentRow }] =
    await Promise.all([
      service
        .from("cbt_questions")
        .select("id, question_type, question_text, marks, section")
        .eq("school_id", schoolId)
        .in("id", questionIds),
      service
        .from("cbt_question_options")
        .select("id, question_id, label, option_text, display_order")
        .eq("school_id", schoolId)
        .in("question_id", questionIds)
        .order("display_order"),
      service
        .from("cbt_question_answer_keys")
        .select("question_id, correct_option_id, model_answer, marking_rubric")
        .eq("school_id", schoolId)
        .in("question_id", questionIds),
      readQuestionMediaMap(service, schoolId, questionIds),
      service
        .from("cbt_assessments")
        .select("sections")
        .eq("id", assessmentId)
        .eq("school_id", schoolId)
        .maybeSingle(),
    ]);

  const marksOverrides: Record<string, number> = {};
  for (const link of links ?? []) {
    if (link.marks_override !== null && link.marks_override !== undefined) {
      marksOverrides[link.question_id as string] = Number(link.marks_override);
    }
  }

  const snapshot = buildAttemptSnapshot({
    questionIds,
    questions: (questions ?? []).map((q) => ({
      id: q.id as string,
      question_type: q.question_type as QuestionType,
      question_text: q.question_text as string,
      marks: Number(q.marks),
      section: (q.section as string | null) ?? null,
      media: mediaMap.get(q.id as string) ?? null,
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
  });
  if (snapshot.length === 0) return { updated: 0, error: "the paper has no questions" };

  const sections = Array.isArray(assessmentRow?.sections)
    ? (assessmentRow?.sections as { label: string; instruction: string | null }[])
    : null;

  let updated = 0;

  for (const attempt of attempts) {
    const attemptId = attempt.id as string;
    const profileId = (attempt.student_profile_id as string | null) ?? null;

    const [{ data: oldQuestions }, { data: oldAnswers }] = await Promise.all([
      service
        .from("cbt_attempt_questions")
        .select("id, question_id")
        .eq("attempt_id", attemptId)
        .eq("school_id", schoolId),
      service
        .from("cbt_attempt_answers")
        .select("attempt_question_id, selected_option_id, answer_text")
        .eq("attempt_id", attemptId)
        .eq("school_id", schoolId),
    ]);

    // Answers first: they cascade from the question rows, and deleting them
    // explicitly keeps this deterministic whichever way the constraint behaves.
    const answersDeleted = await service
      .from("cbt_attempt_answers")
      .delete()
      .eq("attempt_id", attemptId)
      .eq("school_id", schoolId);
    if (answersDeleted.error) return { updated, error: answersDeleted.error.message };

    const questionsDeleted = await service
      .from("cbt_attempt_questions")
      .delete()
      .eq("attempt_id", attemptId)
      .eq("school_id", schoolId);
    if (questionsDeleted.error) return { updated, error: questionsDeleted.error.message };

    const { data: inserted, error: insertError } = await service
      .from("cbt_attempt_questions")
      .insert(
        snapshot.map((q) => ({
          school_id: schoolId,
          attempt_id: attemptId,
          student_profile_id: profileId,
          question_id: q.question_id,
          display_order: q.display_order,
          question_type: q.question_type,
          question_text: q.question_text,
          options_snapshot: q.options_snapshot,
          correct_option_id: q.correct_option_id,
          model_answer: q.model_answer,
          marking_rubric: q.marking_rubric,
          marks: q.marks,
          ...(q.section ? { section: q.section } : {}),
          ...(q.media ? { media: q.media } : {}),
        })),
      )
      .select("id, question_id, options_snapshot");
    if (insertError) return { updated, error: insertError.message };

    const restore = planAnswerRestore({
      oldQuestions: (oldQuestions ?? []) as { id: string; question_id: string | null }[],
      oldAnswers: (oldAnswers ?? []) as {
        attempt_question_id: string;
        selected_option_id: string | null;
        answer_text: string | null;
      }[],
      newQuestions: (inserted ?? []) as {
        id: string;
        question_id: string | null;
        options_snapshot: { option_id: string }[] | null;
      }[],
    });

    if (restore.length > 0) {
      const { error: restoreError } = await service.from("cbt_attempt_answers").insert(
        restore.map((a) => ({
          school_id: schoolId,
          attempt_id: attemptId,
          student_profile_id: profileId,
          attempt_question_id: a.attempt_question_id,
          selected_option_id: a.selected_option_id,
          answer_text: a.answer_text,
          answered_at: now.toISOString(),
        })),
      );
      if (restoreError) return { updated, error: restoreError.message };
    }

    const { error: stampError } = await service
      .from("cbt_attempts")
      .update({
        paper_changed_at: now.toISOString(),
        ...(sections && sections.length > 0 ? { sections } : {}),
      })
      .eq("id", attemptId)
      .eq("school_id", schoolId);
    if (stampError) {
      // A database without migration 068: the paper swap above is still correct,
      // only the student's notice cannot be flagged. Never fail the republish.
      console.warn("[cbt/delivery] paper_changed_at not recorded:", stampError.message);
    }

    updated += 1;
  }

  return { updated, error: null };
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
