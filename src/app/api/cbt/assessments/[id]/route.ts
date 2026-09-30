import { NextResponse } from "next/server";
import { assessmentFailure, jsonError, openClientOr503, readJson, staffGate } from "@/lib/cbt/api";
import { authorizeCbtAssessment } from "@/lib/cbt/authz";
import { resolveAssessmentComponent } from "@/lib/cbt/integration";
import {
  getAssessment,
  parseAssessmentInput,
  updateAssessment,
  verifyAssessmentScope,
} from "@/lib/cbt/assessments";
import { ValidationErrors, uuid } from "@/lib/validate";

/**
 * GET   /api/cbt/assessments/{id} — configuration plus its questions in order.
 * PATCH /api/cbt/assessments/{id} — edit it.
 *
 * The GET response includes each question's approval STATUS, because that is what
 * a teacher needs to see before publishing and it is not visible anywhere else.
 * It does not include answer keys: this is a configuration view, and publishing
 * does not require them.
 */

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const gate = await staffGate(request);
  if (!gate.ok) return gate.response;

  const { id } = await params;
  const errors = new ValidationErrors();
  if (!uuid({ id }, "id", errors)) return jsonError(400, "a valid assessment id is required");

  const opened = await openClientOr503(gate.actor);
  if (!opened.ok) return opened.response;

  const assessment = await getAssessment(opened.client, gate.actor.schoolId, id);
  if (!assessment) return jsonError(404, "assessment not found");

  return NextResponse.json({ assessment });
}

export async function PATCH(request: Request, { params }: Params) {
  const gate = await staffGate(request);
  if (!gate.ok) return gate.response;

  const { id } = await params;
  const errors = new ValidationErrors();
  if (!uuid({ id }, "id", errors)) return jsonError(400, "a valid assessment id is required");

  // Authorizing against the assessment itself, so a teacher cannot edit a
  // colleague's paper in a class they are not assigned to.
  const access = await authorizeCbtAssessment({
    actor: gate.actor,
    assessmentId: id,
    intent: "staff",
  });
  if (!access.ok) return assessmentFailure(access);

  const opened = await openClientOr503(gate.actor);
  if (!opened.ok) return opened.response;
  const scoped = opened.client;

  const body = await readJson(request);
  const input = parseAssessmentInput(body, errors);
  if (!input) return jsonError(400, errors.summary());

  const scope = await verifyAssessmentScope(scoped, gate.actor.schoolId, input);
  if (!scope.ok) return jsonError(400, `Invalid reference: ${scope.violations.join("; ")}`);

  if (input.component_id) {
    const resolved = await resolveAssessmentComponent({
      schoolId: gate.actor.schoolId,
      classId: input.class_id,
      componentId: input.component_id,
    });
    if (!resolved.ok) return jsonError(400, resolved.reason);
  }

  const updated = await updateAssessment(scoped, {
    schoolId: gate.actor.schoolId,
    assessmentId: id,
    input,
  });
  if ("error" in updated) {
    if (updated.error === "assessment not found") return jsonError(404, updated.error);
    return jsonError(409, updated.error);
  }

  return NextResponse.json({ ok: true });
}
