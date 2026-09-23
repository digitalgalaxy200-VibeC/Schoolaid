import type { SupabaseClient } from "@supabase/supabase-js";
import { verifySchoolOwnership } from "@/lib/tenant-ownership";
import { ValidationErrors, number, objectList, oneOf, text, uuid } from "@/lib/validate";

/**
 * Assessment configuration (Phase 17, the half that makes the question bank
 * usable).
 *
 * An assessment is the binding that makes everything else mean something:
 *
 *     School → Session → Term → Class → Subject → Teacher → Component
 *
 * and it declares the rules a student meets: how many attempts, how long, and
 * which attempt becomes the official result.
 *
 * TWO RULES WORTH STATING
 *
 * 1. THE BINDING FREEZES ONCE A STUDENT HAS ATTEMPTED. Changing which class, or
 *    which term, or which report-card component an assessment feeds — after even
 *    one attempt exists — would silently redefine what those attempts were for,
 *    and would move an official score to a different component on the report
 *    card. Attempts reference the assessment, so this is a data-integrity
 *    question, not a UI preference. Editable fields (title, instructions,
 *    timing, attempt limit) stay editable.
 *
 * 2. PUBLISHING IS GATED ON THE QUESTIONS, not on the assessment's own fields.
 *    The gate is `validateAssessmentReadiness` from `questions.ts`, applied at
 *    publish time so a teacher can assemble an assessment out of drafts and
 *    approve them as they go.
 */

export const ASSESSMENT_STATUSES = ["draft", "review", "published", "archived"] as const;
export type AssessmentStatus = (typeof ASSESSMENT_STATUSES)[number];

export const OFFICIAL_ATTEMPT_RULES = ["latest", "best", "first", "manual"] as const;
export type OfficialAttemptRule = (typeof OFFICIAL_ATTEMPT_RULES)[number];

/**
 * `archived` is terminal except for returning to draft. Like questions, nothing
 * is deleted: attempts and results hang off an assessment, and history must stay
 * resolvable.
 */
export const ASSESSMENT_TRANSITIONS: Record<AssessmentStatus, readonly AssessmentStatus[]> = {
  draft: ["review", "published", "archived"],
  review: ["draft", "published", "archived"],
  published: ["archived"],
  archived: ["draft"],
};

export function canTransitionAssessment(from: AssessmentStatus, to: AssessmentStatus): boolean {
  if (from === to) return false;
  return ASSESSMENT_TRANSITIONS[from].includes(to);
}

/**
 * Whether the school/class/subject/term/component binding may still be changed.
 * `attemptCount` is any attempt for this assessment, not just marked ones — a
 * half-finished attempt is still a student's work against that binding.
 */
export function canRebindAssessment(
  attemptCount: number,
): { allowed: true } | { allowed: false; reason: string } {
  if (attemptCount === 0) return { allowed: true };
  return {
    allowed: false,
    reason:
      `${attemptCount} attempt(s) already exist for this assessment, so its school, session, ` +
      `term, class, subject and component can no longer be changed. Archive it and create a ` +
      `new assessment instead.`,
  };
}

// ── input ───────────────────────────────────────────────────────────────────

export type AssessmentInput = {
  class_id: string;
  subject_id: string | null;
  term_id: string | null;
  session_id: string | null;
  component_id: string | null;
  teacher_id: string | null;
  title: string;
  instructions: string | null;
  max_attempts: number;
  time_limit_minutes: number | null;
  official_attempt_rule: OfficialAttemptRule;
};

export function parseAssessmentInput(
  body: unknown,
  errors: ValidationErrors,
): AssessmentInput | null {
  const input: AssessmentInput = {
    class_id: uuid(body, "class_id", errors, { required: true }) ?? "",
    subject_id: uuid(body, "subject_id", errors),
    term_id: uuid(body, "term_id", errors),
    session_id: uuid(body, "session_id", errors),
    component_id: uuid(body, "component_id", errors),
    teacher_id: uuid(body, "teacher_id", errors),
    title: text(body, "title", errors, { required: true, max: 300 }) ?? "",
    instructions: text(body, "instructions", errors, { max: 20000 }),
    // 1 by default rather than 0: an assessment nobody can attempt is not a
    // useful default, and `max_attempts > 0` is a schema constraint anyway.
    max_attempts: number(body, "max_attempts", errors, { integer: true, min: 1, max: 50 }) ?? 1,
    time_limit_minutes: number(body, "time_limit_minutes", errors, {
      integer: true,
      min: 1,
      max: 600,
    }),
    official_attempt_rule:
      oneOf(body, "official_attempt_rule", OFFICIAL_ATTEMPT_RULES, errors) ?? "latest",
  };

  return errors.ok ? input : null;
}

export type QuestionSelection = { question_id: string; marks_override: number | null };

/**
 * Parses the ordered question list.
 *
 * Order is preserved exactly: it is the order the student will be shown, and
 * `display_order` records it. Duplicates are refused rather than deduplicated —
 * silently dropping one would change the paper's total marks without saying so.
 */
export function parseQuestionSelection(
  body: unknown,
  errors: ValidationErrors,
): QuestionSelection[] | null {
  const rows = objectList(body, "questions", errors, { required: true, min: 1, max: 500 });
  if (!rows) return null;

  const seen = new Set<string>();
  const out: QuestionSelection[] = [];

  rows.forEach((row, i) => {
    const scoped = errors.child(`questions[${i}]`);
    const id = uuid(row, "question_id", scoped, { required: true });
    const override = number(row, "marks_override", scoped, { min: 0.01, max: 1000 });

    if (!id) return;
    if (seen.has(id)) {
      scoped.add("question_id", "appears more than once");
      return;
    }
    seen.add(id);
    out.push({ question_id: id, marks_override: override });
  });

  return errors.ok ? out : null;
}

// ── database ────────────────────────────────────────────────────────────────

export type AssessmentRecord = {
  id: string;
  school_id: string;
  session_id: string | null;
  term_id: string | null;
  class_id: string;
  subject_id: string | null;
  teacher_id: string | null;
  component_id: string | null;
  title: string;
  instructions: string | null;
  status: AssessmentStatus;
  max_attempts: number;
  time_limit_minutes: number | null;
  official_attempt_rule: OfficialAttemptRule;
  published_at: string | null;
};

export async function verifyAssessmentScope(
  supabase: SupabaseClient,
  schoolId: string,
  input: Pick<AssessmentInput, "class_id" | "subject_id" | "term_id" | "session_id" | "teacher_id">,
): Promise<{ ok: boolean; violations: string[] }> {
  return verifySchoolOwnership(supabase, schoolId, [
    { table: "classes", id: input.class_id, label: "class" },
    { table: "subjects", id: input.subject_id, label: "subject" },
    { table: "academic_terms", id: input.term_id, label: "term" },
    { table: "academic_sessions", id: input.session_id, label: "session" },
    { table: "teachers", id: input.teacher_id, label: "teacher" },
  ]);
}

export async function listAssessments(
  supabase: SupabaseClient,
  schoolId: string,
  filters: { classId?: string | null; subjectId?: string | null; termId?: string | null } = {},
): Promise<AssessmentRecord[]> {
  let query = supabase
    .from("cbt_assessments")
    .select("*")
    .eq("school_id", schoolId)
    .order("created_at", { ascending: false })
    .limit(200);

  if (filters.classId) query = query.eq("class_id", filters.classId);
  if (filters.subjectId) query = query.eq("subject_id", filters.subjectId);
  if (filters.termId) query = query.eq("term_id", filters.termId);

  const { data } = await query;
  return (data ?? []) as AssessmentRecord[];
}

/** One assessment, with its questions in presentation order. */
export async function getAssessment(
  supabase: SupabaseClient,
  schoolId: string,
  assessmentId: string,
): Promise<
  | (AssessmentRecord & {
      questions: {
        question_id: string;
        display_order: number;
        marks_override: number | null;
        question_text: string;
        question_type: string;
        marks: number;
        status: string;
      }[];
      attempt_count: number;
    })
  | null
> {
  const { data: assessment } = await supabase
    .from("cbt_assessments")
    .select("*")
    .eq("id", assessmentId)
    .eq("school_id", schoolId)
    .maybeSingle();
  if (!assessment) return null;

  const [{ data: links }, { count }] = await Promise.all([
    supabase
      .from("cbt_assessment_questions")
      .select("question_id, display_order, marks_override")
      .eq("assessment_id", assessmentId)
      .eq("school_id", schoolId)
      .order("display_order"),
    supabase
      .from("cbt_attempts")
      .select("id", { count: "exact", head: true })
      .eq("assessment_id", assessmentId)
      .eq("school_id", schoolId),
  ]);

  const questionIds = (links ?? []).map((l) => l.question_id as string);

  // The bank is only readable through the service client for a student; for a
  // teacher it is readable directly, and the route only reaches here as staff.
  const { data: questions } = questionIds.length
    ? await supabase
        .from("cbt_questions")
        .select("id, question_text, question_type, marks, status")
        .eq("school_id", schoolId)
        .in("id", questionIds)
    : { data: [] };

  const byId = new Map((questions ?? []).map((q) => [q.id as string, q]));

  return {
    ...(assessment as AssessmentRecord),
    attempt_count: count ?? 0,
    questions: (links ?? []).map((l) => {
      const q = byId.get(l.question_id as string);
      return {
        question_id: l.question_id as string,
        display_order: Number(l.display_order),
        marks_override: l.marks_override === null ? null : Number(l.marks_override),
        question_text: (q?.question_text as string) ?? "(question no longer available)",
        question_type: (q?.question_type as string) ?? "unknown",
        marks: Number(q?.marks ?? 0),
        status: (q?.status as string) ?? "unknown",
      };
    }),
  };
}

export async function createAssessment(
  supabase: SupabaseClient,
  args: { schoolId: string; profileId: string; input: AssessmentInput },
): Promise<{ id: string } | { error: string }> {
  const { schoolId, profileId, input } = args;

  const { data, error } = await supabase
    .from("cbt_assessments")
    .insert({
      school_id: schoolId,
      session_id: input.session_id,
      term_id: input.term_id,
      class_id: input.class_id,
      subject_id: input.subject_id,
      teacher_id: input.teacher_id,
      component_id: input.component_id,
      title: input.title,
      instructions: input.instructions,
      status: "draft",
      max_attempts: input.max_attempts,
      time_limit_minutes: input.time_limit_minutes,
      official_attempt_rule: input.official_attempt_rule,
      created_by: profileId,
    })
    .select("id")
    .single();

  if (error) {
    // The partial unique index `cbt_one_assessment_per_component_slot` is what
    // most often fails here, and PD-2 is the reason: a component has ONE source.
    if (/cbt_one_assessment_per_component_slot/.test(error.message)) {
      return {
        error:
          "this class, term, subject and component already has an active CBT assessment — " +
          "a report-card component can have only one source at a time",
      };
    }
    return { error: error.message };
  }
  if (!data) return { error: "could not create the assessment" };

  return { id: data.id as string };
}

/**
 * Updates an assessment. Identity fields are frozen once attempts exist.
 */
export async function updateAssessment(
  supabase: SupabaseClient,
  args: { schoolId: string; assessmentId: string; input: AssessmentInput },
): Promise<{ ok: true } | { error: string }> {
  const { schoolId, assessmentId, input } = args;

  const { data: current } = await supabase
    .from("cbt_assessments")
    .select("status")
    .eq("id", assessmentId)
    .eq("school_id", schoolId)
    .maybeSingle();
  if (!current) return { error: "assessment not found" };
  if (current.status === "archived") {
    return { error: "an archived assessment is read-only; restore it to draft first" };
  }

  const { count } = await supabase
    .from("cbt_attempts")
    .select("id", { count: "exact", head: true })
    .eq("assessment_id", assessmentId)
    .eq("school_id", schoolId);

  const rebindable = canRebindAssessment(count ?? 0);
  if (!rebindable.allowed) {
    // Only refuse if the binding actually differs.
    const { data: existing } = await supabase
      .from("cbt_assessments")
      .select("class_id, subject_id, term_id, session_id, component_id, teacher_id")
      .eq("id", assessmentId)
      .eq("school_id", schoolId)
      .maybeSingle();

    const changed =
      existing &&
      (existing.class_id !== input.class_id ||
        existing.subject_id !== input.subject_id ||
        existing.term_id !== input.term_id ||
        existing.session_id !== input.session_id ||
        existing.component_id !== input.component_id ||
        existing.teacher_id !== input.teacher_id);

    if (changed) return { error: rebindable.reason };
  }

  const { error } = await supabase
    .from("cbt_assessments")
    .update({
      title: input.title,
      instructions: input.instructions,
      max_attempts: input.max_attempts,
      time_limit_minutes: input.time_limit_minutes,
      official_attempt_rule: input.official_attempt_rule,
      updated_at: new Date().toISOString(),
    })
    .eq("id", assessmentId)
    .eq("school_id", schoolId);

  return error ? { error: error.message } : { ok: true };
}

/** Replaces the assessment's question list, preserving the given order. */
export async function setAssessmentQuestions(
  supabase: SupabaseClient,
  args: { schoolId: string; assessmentId: string; selection: QuestionSelection[] },
): Promise<{ ok: true } | { error: string }> {
  const { schoolId, assessmentId, selection } = args;

  const { data: assessment } = await supabase
    .from("cbt_assessments")
    .select("status")
    .eq("id", assessmentId)
    .eq("school_id", schoolId)
    .maybeSingle();
  if (!assessment) return { error: "assessment not found" };
  if (assessment.status === "archived") {
    return { error: "an archived assessment cannot be changed" };
  }

  const { count } = await supabase
    .from("cbt_attempts")
    .select("id", { count: "exact", head: true })
    .eq("assessment_id", assessmentId)
    .eq("school_id", schoolId);
  if ((count ?? 0) > 0) {
    return {
      error:
        "students have already attempted this assessment, so its questions are frozen; " +
        "archive it and create a new assessment instead",
    };
  }

  // Every question must exist in this school AND be approved-to-be — unapproved
  // ones are refused at publish, but selecting a foreign school's question is
  // refused here.
  const ids = selection.map((s) => s.question_id);
  const { data: owned } = await supabase
    .from("cbt_questions")
    .select("id")
    .eq("school_id", schoolId)
    .in("id", ids);

  const ownedIds = new Set((owned ?? []).map((q) => q.id as string));
  const missing = ids.filter((id) => !ownedIds.has(id));
  if (missing.length > 0) {
    return { error: `${missing.length} question(s) do not exist in this school` };
  }

  const { error: deleteError } = await supabase
    .from("cbt_assessment_questions")
    .delete()
    .eq("assessment_id", assessmentId)
    .eq("school_id", schoolId);
  if (deleteError) return { error: deleteError.message };

  const { error: insertError } = await supabase.from("cbt_assessment_questions").insert(
    selection.map((s, i) => ({
      school_id: schoolId,
      assessment_id: assessmentId,
      question_id: s.question_id,
      display_order: i,
      marks_override: s.marks_override,
    })),
  );

  return insertError ? { error: insertError.message } : { ok: true };
}

/**
 * Publishes an assessment.
 *
 * The READINESS CHECK DOES NOT LIVE HERE. It is `validateAssessmentReadiness`
 * from `questions.ts`, applied by the route immediately before this call, so the
 * rule exists in exactly one place and cannot drift between the two.
 */
export async function publishAssessment(
  supabase: SupabaseClient,
  args: { schoolId: string; assessmentId: string; now: Date },
): Promise<{ ok: true } | { error: string }> {
  const { schoolId, assessmentId, now } = args;

  const { data: current } = await supabase
    .from("cbt_assessments")
    .select("status")
    .eq("id", assessmentId)
    .eq("school_id", schoolId)
    .maybeSingle();
  if (!current) return { error: "assessment not found" };

  if (!canTransitionAssessment(current.status as AssessmentStatus, "published")) {
    return { error: `an assessment cannot move from ${current.status} to published` };
  }

  const { error } = await supabase
    .from("cbt_assessments")
    .update({ status: "published", published_at: now.toISOString(), updated_at: now.toISOString() })
    .eq("id", assessmentId)
    .eq("school_id", schoolId);

  return error ? { error: error.message } : { ok: true };
}
