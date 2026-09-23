/**
 * CBT attempt snapshots and marking (Phase 15).
 *
 * The whole point of these functions is the rule from the specification:
 *
 *   > Editing a question later must never alter what a previous student saw.
 *
 * So an attempt does not reference the question bank — it holds a frozen COPY of
 * the question text, the options, the correct-option identity and the marks, all
 * taken at the moment the attempt started. Everything here is pure: no database,
 * no clock, no randomness, so the behaviour can be unit-tested directly.
 *
 * Two rules are load-bearing and easy to get wrong:
 *
 *   1. GRADING COMPARES OPTION IDs, NEVER DISPLAY LETTERS. A school may present
 *      options in a randomised order, so "B" is not a stable identity. The
 *      student's answer is stored as the option's UUID and graded against the
 *      frozen correct-option UUID.
 *
 *   2. THE CORRECT ANSWER IS PART OF THE SNAPSHOT BUT MUST NEVER BE SENT TO A
 *      STUDENT. `correct_option_id` exists so marking can run against exactly
 *      what was presented, but any student-facing payload has to strip it.
 *      `toStudentView()` below exists for that purpose.
 */

export type QuestionType = "mcq" | "true_false" | "theory";

export type OfficialAttemptRule = "latest" | "best" | "first" | "manual";

/** One option as frozen into the attempt. */
export type SnapshotOption = {
  /** Stable internal identity. This is the grading key, not `label`. */
  option_id: string;
  /** Presentation only: "A", "B", ... May be null. */
  label: string | null;
  option_text: string;
};

/** A question as frozen into one attempt. */
export type AttemptQuestion = {
  question_id: string;
  display_order: number;
  question_type: QuestionType;
  question_text: string;
  options_snapshot: SnapshotOption[];
  /** Frozen answer key. Server-side only — see `toStudentView`. */
  correct_option_id: string | null;
  model_answer: string | null;
  marking_rubric: string | null;
  marks: number;
};

export type QuestionSource = {
  id: string;
  question_type: QuestionType;
  question_text: string;
  marks: number;
};

export type OptionSource = {
  id: string;
  question_id: string;
  label: string | null;
  option_text: string;
  display_order: number;
};

export type AnswerKeySource = {
  question_id: string;
  correct_option_id: string | null;
  model_answer: string | null;
  marking_rubric: string | null;
};

/**
 * Freezes the presented questions into attempt rows.
 *
 * The order of `questionIds` is authoritative — it is the order the student was
 * shown, and `display_order` records it.
 */
export function buildAttemptSnapshot(input: {
  questionIds: string[];
  questions: QuestionSource[];
  options: OptionSource[];
  answerKeys: AnswerKeySource[];
  marksOverrides?: Record<string, number>;
}): AttemptQuestion[] {
  const { questionIds, questions, options, answerKeys, marksOverrides = {} } = input;

  const byQuestion = new Map(questions.map((q) => [q.id, q]));
  const keysByQuestion = new Map(answerKeys.map((k) => [k.question_id, k]));
  const optionsByQuestion = new Map<string, OptionSource[]>();
  for (const o of options) {
    const list = optionsByQuestion.get(o.question_id) ?? [];
    list.push(o);
    optionsByQuestion.set(o.question_id, list);
  }

  const snapshot: AttemptQuestion[] = [];

  // Renumber densely. If a question was removed between assembly and start,
  // leaving a hole in display_order would misrepresent the sequence the student
  // actually experiences — they see 1..n, with no gap where the missing
  // question used to be.
  let position = 0;

  for (const id of questionIds) {
    const q = byQuestion.get(id);
    if (!q) continue; // question removed between selection and start

    const opts = (optionsByQuestion.get(id) ?? [])
      .slice()
      .sort((a, b) => a.display_order - b.display_order)
      .map<SnapshotOption>((o) => ({
        option_id: o.id,
        label: o.label,
        option_text: o.option_text,
      }));

    const key = keysByQuestion.get(id);
    const override = marksOverrides[id];

    snapshot.push({
      question_id: q.id,
      display_order: position,
      question_type: q.question_type,
      question_text: q.question_text,
      options_snapshot: opts,
      correct_option_id: key?.correct_option_id ?? null,
      model_answer: key?.model_answer ?? null,
      marking_rubric: key?.marking_rubric ?? null,
      marks: typeof override === "number" ? override : q.marks,
    });

    position += 1;
  }

  return snapshot;
}

/**
 * What a student is allowed to receive about a snapshotted question.
 * Everything except the answer key and the marking guidance.
 */
export type StudentQuestionView = {
  question_id: string;
  display_order: number;
  question_type: QuestionType;
  question_text: string;
  options_snapshot: SnapshotOption[];
  marks: number;
};

/**
 * Strips the answer key from a snapshot row before it goes to a student.
 * Use this for anything the student can read.
 *
 * Written as an ALLOW-LIST rather than by deleting the three known-secret
 * fields. The difference matters: with an omit-list, any column added to the
 * snapshot later (AI provenance, a marking note, a reviewer's comment) would be
 * sent to students automatically until somebody remembered to exclude it. Here
 * a new field is invisible until it is deliberately added below — the leak
 * requires an edit, instead of merely avoiding one.
 */
export function toStudentView(q: AttemptQuestion): StudentQuestionView {
  return {
    question_id: q.question_id,
    display_order: q.display_order,
    question_type: q.question_type,
    question_text: q.question_text,
    options_snapshot: q.options_snapshot,
    marks: q.marks,
  };
}

/**
 * Server-authoritative expiry. The browser clock is never trusted.
 * Returns null when the assessment has no time limit.
 */
export function computeAttemptExpiry(
  startedAt: Date,
  timeLimitMinutes: number | null | undefined,
): Date | null {
  if (!timeLimitMinutes || timeLimitMinutes <= 0) return null;
  return new Date(startedAt.getTime() + timeLimitMinutes * 60_000);
}

/** True when a timed attempt is past its server-computed expiry. */
export function isAttemptExpired(expiresAt: Date | null, now: Date): boolean {
  if (!expiresAt) return false;
  return now.getTime() >= expiresAt.getTime();
}

export type ObjectiveGrade = {
  /** False for anything requiring a human (theory). */
  graded: boolean;
  awarded: number;
  /** True when the selected option matched the frozen answer key. */
  correct: boolean;
};

/**
 * Marks a single answer.
 *
 * Objective types are decided by comparing option IDENTITIES. Display labels are
 * never consulted, so randomised option order cannot change the outcome.
 *
 * Theory answers are never auto-marked: they return `graded: false` so the
 * caller must route them to a teacher (optionally with an AI suggestion).
 */
export function gradeObjectiveAnswer(input: {
  questionType: QuestionType;
  correctOptionId: string | null;
  selectedOptionId: string | null;
  marks: number;
}): ObjectiveGrade {
  const { questionType, correctOptionId, selectedOptionId, marks } = input;

  if (questionType === "theory") {
    return { graded: false, awarded: 0, correct: false };
  }

  // No answer given, or the question has no key: zero, but still "graded" for
  // objective types so it is not left pending forever.
  if (!selectedOptionId || !correctOptionId) {
    return { graded: true, awarded: 0, correct: false };
  }

  const correct = selectedOptionId === correctOptionId;
  return { graded: true, awarded: correct ? marks : 0, correct };
}

export type AttemptScore = {
  objectiveScore: number;
  subjectiveScore: number;
  totalScore: number;
  maxScore: number;
  percentage: number | null;
  hasSubjective: boolean;
};

/** Totals an attempt from its per-answer marks. */
export function totalAttempt(rows: {
  marks: number;
  questionType: QuestionType;
  objectiveAwarded: number;
  subjectiveAwarded: number | null;
}[]): AttemptScore {
  let objectiveScore = 0;
  let subjectiveScore = 0;
  let maxScore = 0;
  let hasSubjective = false;

  for (const r of rows) {
    maxScore += r.marks;
    if (r.questionType === "theory") {
      hasSubjective = true;
      subjectiveScore += r.subjectiveAwarded ?? 0;
    } else {
      objectiveScore += r.objectiveAwarded;
    }
  }

  const totalScore = objectiveScore + subjectiveScore;
  const percentage = maxScore > 0 ? Math.round((totalScore / maxScore) * 10000) / 100 : null;

  return { objectiveScore, subjectiveScore, totalScore, maxScore, percentage, hasSubjective };
}

/**
 * PD-4: which attempt becomes the official one.
 *
 * Default behaviour is `latest`. `manual` returns null, meaning an authorised
 * user must choose explicitly (and that choice is audited).
 */
export function selectOfficialAttempt<T extends { attempt_number: number; total_score: number }>(
  attempts: T[],
  rule: OfficialAttemptRule,
): T | null {
  if (attempts.length === 0) return null;
  if (rule === "manual") return null;

  const sorted = attempts.slice();
  switch (rule) {
    case "best":
      sorted.sort((a, b) => b.total_score - a.total_score || b.attempt_number - a.attempt_number);
      break;
    case "first":
      sorted.sort((a, b) => a.attempt_number - b.attempt_number);
      break;
    case "latest":
    default:
      sorted.sort((a, b) => b.attempt_number - a.attempt_number);
      break;
  }
  return sorted[0];
}

/** Maximum attempts reached? Attempts are append-only history (PD-4). */
export function canStartAnotherAttempt(
  attemptsUsed: number,
  maxAttempts: number,
): boolean {
  return attemptsUsed < maxAttempts;
}
