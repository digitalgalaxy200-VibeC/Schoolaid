import type { SupabaseClient } from "@supabase/supabase-js";
import { verifySchoolOwnership } from "@/lib/tenant-ownership";
import { getQuestionMedia, readQuestionMediaMap } from "./media";
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
 *   2. A SAVED QUESTION IS EDITABLE; ARCHIVED IS NOT. The status lifecycle
 *      still exists — the publish gate and the assessment pool read `approved` —
 *      but the teacher-facing bank no longer manages statuses (approval happens
 *      on save). Editing an approved question is therefore allowed again: the
 *      attempts engine snapshots, so a later edit cannot change what a past
 *      student saw. Archived questions stay read-only. See
 *      `canEditQuestionContent`.
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
 * Archived is read-only; everything else is editable.
 *
 * (Approval used to freeze a question until it was explicitly reopened. The
 * simplified bank has no status-management screen, so that freeze was removed —
 * a saved question is simply editable. History is unaffected either way, because
 * attempts hold their own snapshots.)
 */
export function canEditQuestionContent(
  status: QuestionStatus,
): { allowed: true } | { allowed: false; reason: string } {
  if (status === "archived") {
    return { allowed: false, reason: "an archived question is read-only" };
  }
  return { allowed: true };
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
  /**
   * The academic context the question is filed under. Null is allowed for legacy
   * rows, but every write from the app supplies it: the builder inherits the
   * assessment's term, and the standalone bank uses the active term.
   */
  session_id: string | null;
  term_id: string | null;
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
    session_id: uuid(body, "session_id", errors),
    term_id: uuid(body, "term_id", errors),
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

    // Maps each SAVED option back to the slot the caller addressed it by, so
    // `correct_option_index` can be remapped after blank slots are dropped.
    let originalIndexes: number[];

    if (useDefaultTrueFalse) {
      input.options = TRUE_FALSE_OPTIONS.map((o) => ({ ...o }));
      originalIndexes = input.options.map((_, i) => i);
    } else {
      // Unused option slots arrive as empty text. They are DROPPED, not failed:
      // the form offers more slots than the two-option minimum, and a teacher
      // who fills two of them has answered the question correctly. Only options
      // that actually contain text are saved.
      const kept: { option_text: string; label: string | null; originalIndex: number }[] = [];
      (rawOptions ?? []).forEach((o, i) => {
        const optionErrors = errors.child(`options[${i}]`);
        // Deliberately not `required`: a blank slot means "unused", not
        // "missing". A non-string still errors, and that fails the parse.
        const optionText = text(o, "option_text", optionErrors, { max: 2000 });
        if (optionText === null) return;
        kept.push({
          option_text: optionText,
          label: text(o, "label", optionErrors, { max: 20 }),
          originalIndex: i,
        });
      });

      input.options = kept.map((o, position) => ({
        option_text: o.option_text,
        label: o.label ?? String.fromCharCode(65 + position),
      }));
      originalIndexes = kept.map((o) => o.originalIndex);

      if (questionType === "true_false" && input.options.length !== 2) {
        errors.add("options", "a true/false question needs exactly two options");
      }
      if (questionType === "mcq" && input.options.length < 2) {
        errors.add("options", "a multiple-choice question must have at least 2 options");
      }
    }

    const correctIndex = number(body, "correct_option_index", errors, {
      required: true,
      integer: true,
      min: 0,
    });
    if (correctIndex !== null) {
      // Resolved by identity against the caller's own slots: an index that
      // pointed at a dropped blank must not silently shift onto another option.
      const position = originalIndexes.indexOf(correctIndex);
      if (position === -1) errors.add("correct_option_index", "does not point at an option");
      else input.correct_option_index = position;
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
  /** The academic context — what the Question Bank browses by. */
  session_id: string | null;
  term_id: string | null;
  /** Set when this row is a "Reuse & Edit" copy of an earlier question. */
  derived_from_id: string | null;
  topic: string | null;
  section: string | null;
  /** The instruction AI import captured for this question's section, if any. */
  section_instruction: string | null;
  /** The question's optional image reference (bytes are in the private bucket). */
  media: { id: string; storage_path: string; content_type: string | null; caption: string | null } | null;
  /** For list views: whether an image is attached, without carrying the path. */
  has_image: boolean;
  options: { id: string; option_text: string; label: string | null; display_order: number }[];
  /** Staff only. Absent from anything a student can reach. */
  answer_key: { correct_option_id: string | null; model_answer: string | null; marking_rubric: string | null } | null;
};

/**
 * Reads a section instruction off a question's metadata blob. Written once at
 * AI-import time so the assessment builder can prefill section instructions
 * without re-reading the original exam text.
 */
export function sectionInstructionOf(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const value = (metadata as Record<string, unknown>).section_instruction;
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

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
  input: Pick<QuestionInput, "subject_id" | "class_id" | "academic_level_id"> &
    Partial<Pick<QuestionInput, "session_id" | "term_id">>,
): Promise<{ ok: boolean; violations: string[] }> {
  return verifySchoolOwnership(supabase, schoolId, [
    { table: "subjects", id: input.subject_id, label: "subject" },
    { table: "classes", id: input.class_id, label: "class" },
    { table: "academic_levels", id: input.academic_level_id, label: "academic level" },
    { table: "academic_terms", id: input.term_id ?? null, label: "term" },
    { table: "academic_sessions", id: input.session_id ?? null, label: "session" },
  ]);
}

/** Creates a question with its options and answer key. */
export async function createQuestion(
  supabase: SupabaseClient,
  args: {
    schoolId: string;
    profileId: string;
    input: QuestionInput;
    /**
     * Optional AI provenance for imported questions (provider, model, actor,
     * timestamp). The provenance is a pointer, never the exam text itself.
     */
    aiProvenance?: Record<string, unknown> | null;
    /** Optional extra metadata (e.g. the section instruction an AI import captured). */
    metadata?: Record<string, unknown> | null;
    /**
     * The status to insert with. Hand-written questions start as 'draft';
     * AI-imported ones insert 'approved' because the teacher approved them on
     * the review screen — that review IS the approval step.
     */
    initialStatus?: "draft" | "approved";
    /** Set by "Reuse & Edit" so the copy keeps a pointer to its origin. */
    derivedFromId?: string | null;
  },
): Promise<{ id: string } | { error: string }> {
  const {
    schoolId,
    profileId,
    input,
    aiProvenance = null,
    metadata = null,
    initialStatus = "draft",
    derivedFromId = null,
  } = args;

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
      session_id: input.session_id,
      term_id: input.term_id,
      derived_from_id: derivedFromId,
      topic: input.topic,
      section: input.section,
      difficulty: input.difficulty,
      explanation: input.explanation,
      status: initialStatus,
      ai_provenance: aiProvenance,
      metadata,
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
      session_id: input.session_id,
      term_id: input.term_id,
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

  const [{ data: options }, { data: key }, media] = await Promise.all([
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
    getQuestionMedia(supabase, schoolId, questionId),
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
    session_id: (question.session_id as string | null) ?? null,
    term_id: (question.term_id as string | null) ?? null,
    derived_from_id: (question.derived_from_id as string | null) ?? null,
    topic: question.topic ?? null,
    section: question.section ?? null,
    section_instruction: sectionInstructionOf(question.metadata),
    media,
    has_image: Boolean(media),
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
    sessionId?: string | null;
    termId?: string | null;
    /**
     * `published` = the historical bank only; `unpublished` = questions still in
     * preparation. Omit for everything.
     */
    visibility?: "published" | "unpublished" | null;
    status?: QuestionStatus | null;
    questionType?: QuestionType | null;
    limit?: number;
    /**
     * When true, a scoped filter also matches questions with NO value in that
     * column (legacy, school-wide questions), so a context view never hides
     * pre-scoping questions. Repeated `.or()` filters are ANDed by PostgREST.
     */
    includeUnscoped?: boolean;
    /**
     * The caller's authorized class+subject pairs. When provided (even empty),
     * the query is restricted to them and legacy unscoped questions are excluded
     * — this is the server-side enforcement behind the teacher question bank,
     * and callers cannot widen it by omitting filters.
     */
    allowedPairs?: { classId: string; subjectId: string }[] | null;
  } = {},
): Promise<QuestionRecord[]> {
  let query = supabase
    .from("cbt_questions")
    .select("*")
    .eq("school_id", schoolId)
    .order("created_at", { ascending: false })
    .limit(Math.min(filters.limit ?? 100, 200));

  if (filters.allowedPairs) {
    const pairs = filters.allowedPairs;
    if (pairs.length === 0) return [];

    if (filters.classId && filters.subjectId) {
      // The caller already validated this pair against the same list.
      query = query.eq("class_id", filters.classId).eq("subject_id", filters.subjectId);
    } else if (filters.classId) {
      const subjects = [
        ...new Set(pairs.filter((p) => p.classId === filters.classId).map((p) => p.subjectId)),
      ];
      if (subjects.length === 0) return [];
      query = query.eq("class_id", filters.classId).in("subject_id", subjects);
    } else if (filters.subjectId) {
      const classes = [
        ...new Set(pairs.filter((p) => p.subjectId === filters.subjectId).map((p) => p.classId)),
      ];
      if (classes.length === 0) return [];
      query = query.eq("subject_id", filters.subjectId).in("class_id", classes);
    } else {
      // No filter given: the union of the authorized pairs, as one OR of ANDs.
      query = query.or(
        pairs.map((p) => `and(class_id.eq.${p.classId},subject_id.eq.${p.subjectId})`).join(","),
      );
    }
  } else {
    if (filters.subjectId) {
      query = filters.includeUnscoped
        ? query.or(`subject_id.eq.${filters.subjectId},subject_id.is.null`)
        : query.eq("subject_id", filters.subjectId);
    }
    if (filters.classId) {
      query = filters.includeUnscoped
        ? query.or(`class_id.eq.${filters.classId},class_id.is.null`)
        : query.eq("class_id", filters.classId);
    }
  }

  // Status and type filters apply to every caller — including the restricted
  // pair-scoped branch above (the assessment pool asks for `approved`).
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.questionType) query = query.eq("question_type", filters.questionType);
  // Academic context — what the historical browse filters on.
  if (filters.sessionId) query = query.eq("session_id", filters.sessionId);
  if (filters.termId) query = query.eq("term_id", filters.termId);
  // Publication lifecycle: a question joins the historical bank when a paper it
  // sits on is published, and never leaves it.)
  if (filters.visibility === "published") query = query.not("published_at", "is", null);
  if (filters.visibility === "unpublished") query = query.is("published_at", null);

  const { data } = await query;
  const rows = data ?? [];

  // One extra query for the whole page, rather than one per row.
  const mediaMap = await readQuestionMediaMap(
    supabase,
    schoolId,
    rows.map((r) => r.id as string),
  );

  return rows.map((q) => mapQuestionRow(q, mediaMap.has(q.id as string)));
}

/** One `cbt_questions` row as the bank reads it (no options, no answer key). */
function mapQuestionRow(q: Record<string, any>, hasImage: boolean): QuestionRecord {
  return {
    id: q.id,
    question_type: q.question_type,
    question_text: q.question_text,
    marks: Number(q.marks),
    status: q.status,
    subject_id: q.subject_id ?? null,
    class_id: q.class_id ?? null,
    academic_level_id: q.academic_level_id ?? null,
    session_id: q.session_id ?? null,
    term_id: q.term_id ?? null,
    derived_from_id: q.derived_from_id ?? null,
    topic: q.topic ?? null,
    section: q.section ?? null,
    section_instruction: sectionInstructionOf(q.metadata),
    // The bank list deliberately omits options, the answer key and the media
    // PATH: a list view has no use for them, and never selecting them means
    // they cannot leak through this endpoint by accident.
    media: null,
    has_image: hasImage,
    options: [],
    answer_key: null,
  };
}

/**
 * True when a question has been sat: some assessment that uses it has at least
 * one attempt. This is the lock that protects history.
 *
 * "Attempted" deliberately means an attempt ROW exists, not "published". A
 * published paper nobody has started can still be corrected; a paper a student
 * has begun must not change underneath them.
 */
export async function questionHasAttempts(
  supabase: SupabaseClient,
  schoolId: string,
  questionId: string,
): Promise<boolean> {
  const { data: links } = await supabase
    .from("cbt_assessment_questions")
    .select("assessment_id")
    .eq("school_id", schoolId)
    .eq("question_id", questionId);

  const assessmentIds = [
    ...new Set(
      (links ?? [])
        .map((l) => l.assessment_id as string | null)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  ];
  if (assessmentIds.length === 0) return false;

  const { count } = await supabase
    .from("cbt_attempts")
    .select("id", { count: "exact", head: true })
    .eq("school_id", schoolId)
    .in("assessment_id", assessmentIds);

  return (count ?? 0) > 0;
}

/**
 * "Reuse & Edit": an independent copy of a historical question.
 *
 * The copy is what the teacher edits, so the original keeps its text, options,
 * answer key and academic context untouched — which is what makes a previous
 * term's library safe to draw from.
 *
 * `derived_from_id` is a pointer, never a dependency: deleting either side
 * leaves the other intact.
 *
 * The image row is duplicated, not the bytes. Both questions point at the same
 * private object, so the copy renders the same picture without a second upload.
 * (The media delete path removes a row; the object is only collected once no
 * row references its path — see the site-media GC.)
 */
export async function copyQuestion(
  supabase: SupabaseClient,
  args: {
    schoolId: string;
    profileId: string;
    questionId: string;
    target: {
      session_id: string | null;
      term_id: string | null;
      class_id: string | null;
      subject_id: string | null;
    };
  },
): Promise<{ id: string } | { error: string }> {
  const { schoolId, profileId, questionId, target } = args;

  const source = await getQuestion(supabase, schoolId, questionId);
  if (!source) return { error: "question not found" };

  // getQuestion is the authoring shape; difficulty/explanation are not part of
  // it, so they are read separately rather than widening that type for one
  // caller.
  const { data: raw } = await supabase
    .from("cbt_questions")
    .select("difficulty, explanation")
    .eq("id", questionId)
    .eq("school_id", schoolId)
    .maybeSingle();

  const { data: created, error } = await supabase
    .from("cbt_questions")
    .insert({
      school_id: schoolId,
      question_type: source.question_type,
      question_text: source.question_text,
      marks: source.marks,
      subject_id: target.subject_id,
      class_id: target.class_id,
      academic_level_id: source.academic_level_id,
      session_id: target.session_id,
      term_id: target.term_id,
      derived_from_id: source.id,
      topic: source.topic,
      section: source.section,
      difficulty: (raw?.difficulty as string | null) ?? null,
      explanation: (raw?.explanation as string | null) ?? null,
      // A copy is a draft: the teacher is about to change it, and publishing is
      // a separate, deliberate act.
      status: "draft",
      metadata: source.section_instruction
        ? { section_instruction: source.section_instruction }
        : null,
      created_by: profileId,
    })
    .select("id")
    .single();

  if (error || !created) return { error: error?.message ?? "could not copy the question" };
  const newId = created.id as string;

  // Options are new rows, so the answer key must be re-pointed by identity.
  const oldToNew = new Map<string, string>();
  if (source.options.length > 0) {
    const { data: inserted, error: optionError } = await supabase
      .from("cbt_question_options")
      .insert(
        source.options.map((o) => ({
          school_id: schoolId,
          question_id: newId,
          option_text: o.option_text,
          label: o.label,
          display_order: o.display_order,
        })),
      )
      .select("id");
    if (optionError) return { error: optionError.message };

    const ordered = (inserted ?? []) as { id: string }[];
    source.options.forEach((o, i) => {
      const createdOption = ordered[i];
      if (createdOption) oldToNew.set(o.id, createdOption.id);
    });
  }

  if (source.answer_key) {
    const key = source.answer_key;
    const { error: keyError } = await supabase.from("cbt_question_answer_keys").insert({
      school_id: schoolId,
      question_id: newId,
      correct_option_id: key.correct_option_id
        ? (oldToNew.get(key.correct_option_id) ?? null)
        : null,
      model_answer: key.model_answer,
      marking_rubric: key.marking_rubric,
    });
    if (keyError) return { error: keyError.message };
  }

  if (source.media) {
    const { error: mediaError } = await supabase.from("cbt_question_media").insert({
      school_id: schoolId,
      question_id: newId,
      storage_path: source.media.storage_path,
      content_type: source.media.content_type,
      caption: source.media.caption,
      display_order: 0,
    });
    if (mediaError) return { error: mediaError.message };
  }

  return { id: newId };
}
