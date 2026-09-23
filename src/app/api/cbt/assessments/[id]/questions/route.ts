import { NextResponse } from "next/server";
import { assessmentFailure, jsonError, openClientOr503, readJson, staffGate } from "@/lib/cbt/api";
import { authorizeCbtAssessment } from "@/lib/cbt/authz";
import { parseQuestionSelection, setAssessmentQuestions } from "@/lib/cbt/assessments";
import { ValidationErrors, uuid } from "@/lib/validate";

/**
 * PUT /api/cbt/assessments/{id}/questions — replace the question list, in order.
 *
 * Order is the order the student will be shown. It is replaced wholesale rather
 * than patched: an assessment's question list is a single decision ("this is the
 * paper"), and piecemeal edits make it possible to end up with a paper nobody
 * chose.
 *
 * Refused once any attempt exists — the paper a student sat is not editable
 * afterwards. Their own snapshot would survive, but the assessment would then
 * describe something different from what was actually taken.
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

  const saved = await setAssessmentQuestions(opened.client, {
    schoolId: gate.actor.schoolId,
    assessmentId: id,
    selection,
  });
  if ("error" in saved) {
    if (saved.error === "assessment not found") return jsonError(404, saved.error);
    return jsonError(409, saved.error);
  }

  return NextResponse.json({ ok: true, questions: selection.length });
}
