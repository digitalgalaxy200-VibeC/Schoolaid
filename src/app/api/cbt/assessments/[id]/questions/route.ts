import { NextResponse } from "next/server";
import { assessmentFailure, jsonError, openClientOr503, readJson, staffGate } from "@/lib/cbt/api";
import { authorizeCbtAssessment } from "@/lib/cbt/authz";
import {
  getAssessment,
  parseQuestionSelection,
  setAssessmentQuestions,
} from "@/lib/cbt/assessments";
import { readQuestionMediaMap, signQuestionMedia } from "@/lib/cbt/media";
import { sectionInstructionOf } from "@/lib/cbt/questions";
import { getServiceClient } from "@/lib/supabase/service";
import { ValidationErrors, uuid } from "@/lib/validate";

/**
 * GET /api/cbt/assessments/{id}/questions — the paper as the TEACHER edits it.
 *
 * Every question in order, with its options, the correct option, its section and
 * a signed image URL — the whole set at once, so the teacher's screen is a list
 * (the student's is one question per screen; that experience lives in
 * `.../preview` and the attempt itself).
 *
 * The answer key IS returned here, unlike the preview route: this is the authoring
 * view, the same surface that writes the paper, and a teacher cannot correct a
 * question they cannot see the answer to. Staff only, and the assessment is
 * authorized exactly as the PUT below authorizes it.
 */
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

  const assessment = await getAssessment(scoped, gate.actor.schoolId, id);
  if (!assessment) return jsonError(404, "assessment not found");

  const questionIds = assessment.questions.map((q) => q.question_id);

  const [{ data: rows }, { data: optionRows }, { data: keyRows }, mediaMap] = await Promise.all([
    questionIds.length
      ? scoped
          .from("cbt_questions")
          .select("id, question_type, question_text, section, status, marks, metadata")
          .eq("school_id", gate.actor.schoolId)
          .in("id", questionIds)
      : Promise.resolve({ data: [] }),
    questionIds.length
      ? scoped
          .from("cbt_question_options")
          .select("id, question_id, label, option_text, display_order")
          .eq("school_id", gate.actor.schoolId)
          .in("question_id", questionIds)
          .order("display_order")
      : Promise.resolve({ data: [] }),
    questionIds.length
      ? scoped
          .from("cbt_question_answer_keys")
          .select("question_id, correct_option_id")
          .eq("school_id", gate.actor.schoolId)
          .in("question_id", questionIds)
      : Promise.resolve({ data: [] }),
    readQuestionMediaMap(scoped, gate.actor.schoolId, questionIds),
  ]);

  const byId = new Map((rows ?? []).map((r) => [r.id as string, r]));
  const correctByQuestion = new Map(
    (keyRows ?? []).map((k) => [k.question_id as string, (k.correct_option_id as string | null) ?? null]),
  );
  const optionsByQuestion = new Map<
    string,
    { id: string; label: string | null; option_text: string }[]
  >();
  for (const o of optionRows ?? []) {
    const questionId = o.question_id as string;
    const list = optionsByQuestion.get(questionId);
    const shaped = {
      id: o.id as string,
      label: (o.label as string | null) ?? null,
      option_text: o.option_text as string,
    };
    if (list) list.push(shaped);
    else optionsByQuestion.set(questionId, [shaped]);
  }

  // Storage access needs the service client, so it is opened only when there is
  // an image to sign.
  const service = mediaMap.size > 0 ? getServiceClient() : null;

  const questions = await Promise.all(
    assessment.questions.map(async (link) => {
      const row = byId.get(link.question_id);
      const media = mediaMap.get(link.question_id);
      return {
        question_id: link.question_id,
        display_order: link.display_order,
        marks_override: link.marks_override,
        marks: link.marks_override ?? Number(row?.marks ?? link.marks),
        question_type: (row?.question_type as string) ?? link.question_type,
        question_text: (row?.question_text as string) ?? link.question_text,
        section: (row?.section as string | null) ?? null,
        section_instruction: sectionInstructionOf(row?.metadata),
        status: (row?.status as string) ?? link.status,
        media_url:
          media && service
            ? await signQuestionMedia(service, media.storage_path, PREVIEW_MEDIA_TTL_SECONDS)
            : null,
        correct_option_id: correctByQuestion.get(link.question_id) ?? null,
        options: optionsByQuestion.get(link.question_id) ?? [],
      };
    }),
  );

  return NextResponse.json({ questions });
}

/**
 * PUT /api/cbt/assessments/{id}/questions — replace the question list, in order.
 *
 * Order is the order the student will be shown. It is replaced wholesale rather
 * than patched: an assessment's question list is a single decision ("this is the
 * paper"), and piecemeal edits make it possible to end up with a paper nobody
 * chose.
 *
 * REFUSED WHILE PUBLISHED — and only then. Attempts no longer lock the paper:
 * a submitted attempt keeps its own frozen snapshot, and an in-progress attempt
 * is re-pointed at the corrected paper at republish (see the publish route). The
 * gate is the published state, because publishing is what puts the paper in
 * front of students.
 *
 * The edit is recorded in the audit trail the report-card actions use, so "who
 * changed this paper, when, and from what" stays answerable.
 */

type Params = { params: Promise<{ id: string }> };

/** Long enough for one editing session, short enough to not be a capability. */
const PREVIEW_MEDIA_TTL_SECONDS = 900;

export async function PUT(request: Request, { params }: Params) {
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

  const body = await readJson(request);
  const selection = parseQuestionSelection(body, errors);
  if (!selection) return jsonError(400, errors.summary());

  // The questions as they stand, for the audit row's "before".
  const { data: beforeRows } = await opened.client
    .from("cbt_assessment_questions")
    .select("question_id, display_order")
    .eq("assessment_id", id)
    .eq("school_id", gate.actor.schoolId)
    .order("display_order");
  const beforeIds = (beforeRows ?? []).map((r) => r.question_id as string);

  const saved = await setAssessmentQuestions(opened.client, {
    schoolId: gate.actor.schoolId,
    assessmentId: id,
    selection,
  });
  if ("error" in saved) {
    if (saved.error === "assessment not found") return jsonError(404, saved.error);
    return jsonError(409, saved.error);
  }

  await recordPaperEdit({
    schoolId: gate.actor.schoolId,
    assessmentId: id,
    actorId: gate.actor.profileId,
    before: beforeIds,
    after: selection.map((s) => s.question_id),
  });

  return NextResponse.json({ ok: true, questions: selection.length });
}

/**
 * Records a paper edit in `report_card_audit_logs` — the same trail the
 * report-card workflow reads, so the change is visible in the School Admin's
 * log view. Best-effort by design: a log that cannot be written must never undo
 * the save the teacher asked for.
 */
async function recordPaperEdit(args: {
  schoolId: string;
  assessmentId: string;
  actorId: string;
  before: string[];
  after: string[];
}): Promise<void> {
  const service = getServiceClient();

  const [{ data: assessment }, { count }] = await Promise.all([
    service
      .from("cbt_assessments")
      .select("class_id, term_id")
      .eq("id", args.assessmentId)
      .eq("school_id", args.schoolId)
      .maybeSingle(),
    service
      .from("cbt_attempts")
      .select("id", { count: "exact", head: true })
      .eq("assessment_id", args.assessmentId)
      .eq("school_id", args.schoolId),
  ]);

  // The audit table requires a class and a term; an assessment can be bound to
  // neither, and that is not a reason to refuse the edit.
  if (!assessment?.class_id || !assessment?.term_id) {
    console.warn(
      "[cbt/assessments] paper edit not audited — the assessment has no class or no term",
    );
    return;
  }

  const beforeSet = new Set(args.before);
  const afterSet = new Set(args.after);

  const { error } = await service.from("report_card_audit_logs").insert({
    school_id: args.schoolId,
    class_id: assessment.class_id,
    term_id: assessment.term_id,
    user_id: args.actorId,
    action: "cbt_paper_edit",
    details: {
      assessment_id: args.assessmentId,
      before: args.before,
      after: args.after,
      added: args.after.filter((q) => !beforeSet.has(q)),
      removed: args.before.filter((q) => !afterSet.has(q)),
      attempts_at_edit: count ?? 0,
    },
  });
  if (error) console.error("[cbt/assessments] paper edit audit failed:", error.message);
}
