import type { SupabaseClient } from "@supabase/supabase-js";
import { verifySchoolOwnership } from "@/lib/tenant-ownership";
import { ValidationErrors, objectList, oneOf, text, number, uuid } from "@/lib/validate";

/**
 * Question bank (Phase 17).
 *
 * Scope: authoring and maintaining questions — create, edit, organise, approve,
 * archive. It does NOT decide which questions go into an assessment (that is
 * assessment configuration) and it never touches an attempt: an attempt holds a
 * frozen copy, so editing here cannot change what a past student saw.
 *
 * Two rules drive most of the design:
 *
 *   1. THE ANSWER KEY IS NOT PART OF A QUESTION'S PUBLIC SHAPE. It lives in
 *      `cbt_question_answer_keys`. Anything that hands a question to a
 *      student-facing caller must go through the allow-list in `attempt.ts`.
 *
 *   2. AN APPROVED QUESTION IS NOT EDITABLE IN PLACE. Once a question is
 *      approved it is a reference other people's work may depend on, so a
 *      content change has to be an explicit reopen (approved -> review) rather
 *      than a silent overwrite. Note this is about *process*, not about history:
 *      history is already safe, because attempts snapshot. See
 *      `canEditQuestionContent` — and if the school decides teachers should be
 *      able to edit approved questions freely, that is a one-line change here
 *      and nowhere else.
 */

export const QUESTION_TYPES = ["mcq", "true_false", "theory"] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export const QUESTION_STATUSES = ["draft", "review", "approved", "archived"] as const;
export type QuestionStatus = (typeof QUESTION_STATUSES)[number];

/**
 * Allowed status changes. `archived` is reachable from anywhere (retire it) and
 * only returns to `draft` (deliberately re-open it), so nothing can be
 * resurrected into `approved` in one step.
 */
export const QUESTION_TRANSITIONS: Record<QuestionStatus, readonly QuestionStatus[]> = {
  draft: ["review", "approved", "archived"],
  review: ["draft", "approved", "archived"],
  approved: ["review", "archived"],
  archived: ["draft"],
};

export function canTransitionQuestion(from: QuestionStatus, to: QuestionStatus): boolean {
  if (from === to) return false; // a no-op transition is not a transition
  return QUESTION_TRANSITIONS[from].includes(to);
}

/** Only approved questions may be presented in a live assessment. */
export function isQuestionApprovedForUse(status: QuestionStatus): boolean {
  return status === "approved";
}

/**
 * Whether a content edit may be applied while the question is in `status`.
 * Archived is read-only; approved must be reopened first.
 */
export function canEditQuestionContent(
  status: QuestionStatus,
): { allowed: true } | { allowed: false; reason: string } {
  if (status === "draft" || status === "review") return { allowed: true };
  if (status === "approved") {
    return {
      allowed: false,
      reason:
        "an approved question cannot be edited in place — reopen it (approved -> review) first",
    };
  }
  return { allowed: false, reason: "an archived question is read-only; restore it to draft first" };
}

// ── the public shape of a question ──────────────────────────────────────────

export type QuestionOptionInput = {
  option_text: string;
  label: string | null;
};

export type QuestionInput = {
  question_type: QuestionType;
  question_text: string;
  marks: number;
  subject_id: string | null;
  class_id: string | null;
  academic_level_id: string | null;
  topic: string | null;
  section: string | null;
  difficulty: string | null;
  explanation: string | null;
  options: QuestionOptionInput[];
  /** Index into `options`, or null. Required for objective types. */
  correct_option_index: number | null;
  model_answer: string | null;
  marking_rubric: string | null;
};

/** The conventional two options for a true/false question. */
export const TRUE_FALSE_OPTIONS: QuestionOptionInput[] = [
  { option_text: "True", label: "A" },
  { option_text: "False", label: "B" },
];

/**
 * Parses and validates a question payload.
 *
 * `true_false` with no options supplied gets the conventional True/False pair
 * rather than an error: demanding the caller spell out two fixed options adds
 * no information and invites them to get it wrong.
 */
export function parseQuestionInput(
  body: unknown,
  errors: ValidationErrors,
): QuestionInput | null {
  const questionType = oneOf(body, "question_type", QUESTION_TYPES, errors, {
    required: true,
  });

  const input: QuestionInput = {
    question_type: questionType ?? "mcq",
    question_text: text(body, "question_text", errors, { required: true, max: 10000 }) ?? "",
    marks: number(body, "marks", errors, { required: true, min: 0.01, max: 1000 }) ?? 0,
    subject_id: uuid(body, "subject_id", errors),
    class_id: uuid(body, "class_id", errors),
    academic_level_id: uuid(body, "academic_level_id", errors),
    topic: text(body, "topic", errors, { max: 200 }),
    section: text(body, "section", errors, { max: 200 }),
    difficulty: text(body, "difficulty", errors, { max: 50 }),
    explanation: text(body, "explanation", errors, { max: 10000 }),
    options: [],
    correct_option_index: null,
    model_answer: text(body, "model_answer", errors, { max: 20000 }),
    marking_rubric: text(body, "marking_rubric", errors, { max: 20000 }),
  };

  if (!questionType) return null;

  const rawOptions = objectList(body, "options", errors);

  if (questionType === "theory") {
    if (rawOptions && rawOptions.length > 0) {
      errors.add("options", "a theory question has no options");
    }
    if (!input.model_answer && !input.marking_rubric) {
      errors.add("model_answer", "a theory question needs a model answer or a marking rubric");
    }
  } else {
    const useDefaultTrueFalse =
      questionType === "true_false" && (!rawOptions || rawOptions.length === 0);

    input.options = useDefaultTrueFalse
      ? TRUE_FALSE_OPTIONS.map((o) => ({ ...o }))
      : (rawOptions ?? []).map((o, i) => {
          const optionErrors = errors.child(`options[${i}]`);
          return {
            option_text:
              text(o, "option_text", optionErrors, { required: true, max: 2000 }) ?? "",
            label: text(o, "label", optionErrors, { max: 20 }) ?? String.fromCharCode(65 + i),
          };
        });

    if (questionType === "true_false" && input.options.length !== 2) {
      errors.add("options", "a true/false question needs exactly two options");
    }
    if (questionType === "mcq" && input.options.length < 2) {
      errors.add("options", "a multiple-choice question needs at least two options");
    }
    if (input.options.some((o) => o.option_text.trim() === "")) {
      errors.add("options", "every option needs text");
    }

    const correctIndex = number(body, "correct_option_index", errors, {
      required: true,
      integer: true,
      min: 0,
    });
    if (correctIndex !== null && correctIndex >= input.options.length) {
      errors.add("correct_option_index", "does not point at an option");
    } else {
      input.correct_option_index = correctIndex;
    }
  }

  return errors.ok ? input : null;
}

// ── assessment readiness ────────────────────────────────────────────────────

export type ReadinessCheck = { ok: true } | { ok: false; errors: string[] };

/**
 * Whether an assessment's question set is fit to publish.
 *
 * Checked at publish time rather than at authoring time on purpose: a teacher
 * needs to build an assessment out of draft questions and approve them as they
 * go. Gating at publish is where the guarantee actually matters — nothing
 * unapproved reaches a student.
 */
export function validateAssessmentReadiness(input: {
  questionCount: number;
  statuses: QuestionStatus[];
  /** Marks per question as configured (after any per-assessment override). */
  marks: number[];
  totalMarksAvailable?: number | null;
}): ReadinessCheck {
  const errors: string[] = [];

  if (input.questionCount <= 0) {
    errors.push("the assessment has no questions");
  }
  if (input.statuses.length !== input.questionCount) {
    errors.push("some questions could not be resolved and may have been deleted");
  }

  const notApproved = input.statuses.filter((s) => !isQuestionApprovedForUse(s)).length;
  if (notApproved > 0) {
    errors.push(
      `${notApproved} question(s) are not approved — every question must be approved before publishing`,
    );
  }

  const total = input.marks.reduce((sum, m) => sum + m, 0);
  if (total <= 0) {
    errors.push("the assessment is worth zero marks");
  }
  if (
    input.totalMarksAvailable !== undefined &&
    input.totalMarksAvailable !== null &&
    total > input.totalMarksAvailable
  ) {
    errors.push(
      `the questions total ${total} marks, more than the ${input.totalMarksAvailable} available for this component`,
    );
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

// ── database helpers ────────────────────────────────────────────────────────

export type QuestionRecord = {
  id: string;
  question_type: QuestionType;
  question_text: string;
  marks: number;
  status: QuestionStatus;
  subject_id: string | null;
  class_id: string | null;
  academic_level_id: string | null;
  topic: string | null;
  options: { id: string; option_text: string; label: string | null; display_order: number }[];
  /** Staff only. Absent from anything a student can reach. */
  answer_key: { correct_option_id: string | null; model_answer: string | null; marking_rubric: string | null } | null;
};

/**
 * Confirms every scope id on a question belongs to the caller's school.
 *
 * A foreign key proves the row exists; it proves nothing about ownership, so a
 * question could otherwise be filed under another school's subject. Reuses the
 * shared Phase 10 helper rather than growing a second copy of the rule.
 */
export async function verifyQuestionScope(
  supabase: SupabaseClient,
  schoolId: string,
  input: Pick<QuestionInput, "subject_id" | "class_id" | "academic_level_id">,
): Promise<{ ok: boolean; violations: string[] }> {
  return verifySchoolOwnership(supabase, schoolId, [
    { table: "subjects", id: input.subject_id, label: "subject" },
    { table: "classes", id: input.class_id, label: "class" },
    { table: "academic_levels", id: input.academic_level_id, label: "academic level" },
  ]);
}

/** Creates a question with its options and answer key. */
export async function createQuestion(
  supabase: SupabaseClient,
  args: { schoolId: string; profileId: string; input: QuestionInput },
): Promise<{ id: string } | { error: string }> {
  const { schoolId, profileId, input } = args;

  const { data: question, error } = await supabase
    .from("cbt_questions")
    .insert({
      school_id: schoolId,
      question_type: input.question_type,
      question_text: input.question_text,
      marks: input.marks,
      subject_id: input.subject_id,
      class_id: input.class_id,
      academic_level_id: input.academic_level_id,
      topic: input.topic,
      section: input.section,
      difficulty: input.difficulty,
      explanation: input.explanation,
      status: "draft",
      created_by: profileId,
    })
    .select("id")
    .single();

  if (error || !question) return { error: error?.message ?? "could not create the question" };

  const written = await writeOptionsAndKey(supabase, schoolId, question.id, input);
  if ("error" in written) return written;

  return { id: question.id };
}

/**
 * Replaces options and the answer key.
 *
 * ORDER MATTERS. `cbt_question_answer_keys.correct_option_id` references an
 * option with ON DELETE CASCADE, so deleting the options first would delete the
 * key row as a side effect and the subsequent key insert would be the only
 * evidence anything happened. Delete the key, then the options, then write both.
 */
async function writeOptionsAndKey(
  supabase: SupabaseClient,
  schoolId: string,
  questionId: string,
  input: QuestionInput,
): Promise<{ ok: true } | { error: string }> {
  const { error: keyDeleteError } = await supabase
    .from("cbt_question_answer_keys")
    .delete()
    .eq("question_id", questionId)
    .eq("school_id", schoolId);
  if (keyDeleteError) return { error: keyDeleteError.message };

  const { error: optionDeleteError } = await supabase
    .from("cbt_question_options")
    .delete()
    .eq("question_id", questionId)
    .eq("school_id", schoolId);
  if (optionDeleteError) return { error: optionDeleteError.message };

  let correctOptionId: string | null = null;

  if (input.options.length > 0) {
    const { data: options, error } = await supabase
      .from("cbt_question_options")
      .insert(
        input.options.map((o, i) => ({
          school_id: schoolId,
          question_id: questionId,
          option_text: o.option_text,
          label: o.label,
          display_order: i,
        })),
      )
      .select("id");
    if (error) return { error: error.message };

    // Option ids come back in insert order, so the index maps to the same
    // position the caller specified. Resolve the key by IDENTITY, never by
    // position at read time — randomised option order must not move the answer.
    const ordered = (options ?? []) as { id: string }[];
    if (input.correct_option_index !== null) {
      correctOptionId = ordered[input.correct_option_index]?.id ?? null;
      if (!correctOptionId) {
        return { error: "the correct option could not be resolved after insert" };
      }
    }
  }

  if (input.question_type !== "theory" && !correctOptionId) {
    return { error: "an objective question needs a correct option" };
  }

  const { error: keyError } = await supabase.from("cbt_question_answer_keys").insert({
    question_id: questionId,
    school_id: schoolId,
    correct_option_id: correctOptionId,
    model_answer: input.model_answer,
    marking_rubric: input.marking_rubric,
  });
  if (keyError) return { error: keyError.message };

  return { ok: true };
}

/** Applies a content edit, enforcing the reopen rule. */
export async function updateQuestion(
  supabase: SupabaseClient,
  args: { schoolId: string; questionId: string; input: QuestionInput },
): Promise<{ ok: true } | { error: string }> {
  const { schoolId, questionId, input } = args;

  const { data: current } = await supabase
    .from("cbt_questions")
    .select("status")
    .eq("id", questionId)
    .eq("school_id", schoolId)
    .maybeSingle();

  if (!current) return { error: "question not found" };

  const editable = canEditQuestionContent(current.status as QuestionStatus);
  if (!editable.allowed) return { error: editable.reason };

  const { error } = await supabase
    .from("cbt_questions")
    .update({
      question_type: input.question_type,
      question_text: input.question_text,
      marks: input.marks,
      subject_id: input.subject_id,
      class_id: input.class_id,
      academic_level_id: input.academic_level_id,
      topic: input.topic,
      section: input.section,
      difficulty: input.difficulty,
      explanation: input.explanation,
      updated_at: new Date().toISOString(),
    })
    .eq("id", questionId)
    .eq("school_id", schoolId);
  if (error) return { error: error.message };

  return writeOptionsAndKey(supabase, schoolId, questionId, input);
}

/** Moves a question through its lifecycle, refusing illegal transitions. */
export async function setQuestionStatus(
  supabase: SupabaseClient,
  args: { schoolId: string; questionId: string; to: QuestionStatus },
): Promise<{ ok: true } | { error: string }> {
  const { schoolId, questionId, to } = args;

  const { data: current } = await supabase
    .from("cbt_questions")
    .select("status")
    .eq("id", questionId)
    .eq("school_id", schoolId)
    .maybeSingle();

  if (!current) return { error: "question not found" };

  const from = current.status as QuestionStatus;
  if (!canTransitionQuestion(from, to)) {
    return { error: `cannot move a question from ${from} to ${to}` };
  }

  const { error } = await supabase
    .from("cbt_questions")
    .update({ status: to, updated_at: new Date().toISOString() })
    .eq("id", questionId)
    .eq("school_id", schoolId);

  return error ? { error: error.message } : { ok: true };
}

/** Loads a question for staff, including the answer key. */
export async function getQuestion(
  supabase: SupabaseClient,
  schoolId: string,
  questionId: string,
): Promise<QuestionRecord | null> {
  const { data: question } = await supabase
    .from("cbt_questions")
    .select("*")
    .eq("id", questionId)
    .eq("school_id", schoolId)
    .maybeSingle();
  if (!question) return null;

  const [{ data: options }, { data: key }] = await Promise.all([
    supabase
      .from("cbt_question_options")
      .select("id, option_text, label, display_order")
      .eq("question_id", questionId)
      .eq("school_id", schoolId)
      .order("display_order"),
    supabase
      .from("cbt_question_answer_keys")
      .select("correct_option_id, model_answer, marking_rubric")
      .eq("question_id", questionId)
      .eq("school_id", schoolId)
      .maybeSingle(),
  ]);

  return {
    id: question.id,
    question_type: question.question_type,
    question_text: question.question_text,
    marks: Number(question.marks),
    status: question.status,
    subject_id: question.subject_id ?? null,
    class_id: question.class_id ?? null,
    academic_level_id: question.academic_level_id ?? null,
    topic: question.topic ?? null,
    options: options ?? [],
    answer_key: key ?? null,
  };
}

/** Lists the question bank, newest first, optionally filtered. */
export async function listQuestions(
  supabase: SupabaseClient,
  schoolId: string,
  filters: {
    subjectId?: string | null;
    classId?: string | null;
    status?: QuestionStatus | null;
    questionType?: QuestionType | null;
    limit?: number;
  } = {},
): Promise<QuestionRecord[]> {
  let query = supabase
    .from("cbt_questions")
    .select("*")
    .eq("school_id", schoolId)
    .order("created_at", { ascending: false })
    .limit(Math.min(filters.limit ?? 100, 200));

  if (filters.subjectId) query = query.eq("subject_id", filters.subjectId);
  if (filters.classId) query = query.eq("class_id", filters.classId);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.questionType) query = query.eq("question_type", filters.questionType);

  const { data } = await query;
  if (!data) return [];

  return data.map((q) => ({
    id: q.id,
    question_type: q.question_type,
    question_text: q.question_text,
    marks: Number(q.marks),
    status: q.status,
    subject_id: q.subject_id ?? null,
    class_id: q.class_id ?? null,
    academic_level_id: q.academic_level_id ?? null,
    topic: q.topic ?? null,
    // The bank list deliberately omits options and the answer key: a list view
    // has no use for them, and not selecting them means they cannot leak.
    options: [],
    answer_key: null,
  }));
}
