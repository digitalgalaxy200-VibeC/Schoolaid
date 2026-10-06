import { NextResponse } from "next/server";
import { assessmentFailure, jsonError, openClientOr503, readJson, staffGate } from "@/lib/cbt/api";
import { authorizeCbtAssessment } from "@/lib/cbt/authz";
import { parseQuestionSelection, setAssessmentQuestions } from "@/lib/cbt/assessments";
import { getServiceClient } from "@/lib/supabase/service";
import { ValidationErrors, uuid } from "@/lib/validate";

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
