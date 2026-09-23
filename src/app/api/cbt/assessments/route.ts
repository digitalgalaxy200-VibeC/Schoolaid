import { NextResponse } from "next/server";
import { jsonError, openClientOr503, readJson, staffGate } from "@/lib/cbt/api";
import { resolveAssessmentComponent } from "@/lib/cbt/integration";
import {
  createAssessment,
  listAssessments,
  parseAssessmentInput,
  verifyAssessmentScope,
} from "@/lib/cbt/assessments";
import { getTeacherIdForProfile } from "@/lib/cbt/authz";
import { ValidationErrors, uuid } from "@/lib/validate";

/**
 * GET  /api/cbt/assessments — assessments in this school, staff only.
 * POST /api/cbt/assessments — create one.
 *
 * `teacher_id` defaults to the caller when the caller IS a teacher. Without that
 * a teacher creating their own assessment would leave it unowned and then be
 * refused by the assignment rule on their own paper.
 */

export async function GET(request: Request) {
  const gate = await staffGate(request);
  if (!gate.ok) return gate.response;

  const opened = await openClientOr503(gate.actor);
  if (!opened.ok) return opened.response;

  const { searchParams } = new URL(request.url);
  const raw = {
    class_id: searchParams.get("class_id"),
    subject_id: searchParams.get("subject_id"),
    term_id: searchParams.get("term_id"),
  };
  const errors = new ValidationErrors();
  const classId = uuid(raw, "class_id", errors);
  const subjectId = uuid(raw, "subject_id", errors);
  const termId = uuid(raw, "term_id", errors);
  if (!errors.ok) return jsonError(400, errors.summary());

  const assessments = await listAssessments(opened.client, gate.actor.schoolId, {
    classId,
    subjectId,
    termId,
  });

  return NextResponse.json({ assessments });
}

export async function POST(request: Request) {
  const gate = await staffGate(request);
  if (!gate.ok) return gate.response;

  const opened = await openClientOr503(gate.actor);
  if (!opened.ok) return opened.response;
  const scoped = opened.client;
  const { actor } = gate;

  const body = await readJson(request);
  const errors = new ValidationErrors();
  const input = parseAssessmentInput(body, errors);
  if (!input) return jsonError(400, errors.summary());

  if (!input.teacher_id && actor.appRole === "teacher") {
    const teacherId = await getTeacherIdForProfile(scoped, actor.schoolId, actor.profileId);
    if (teacherId) input.teacher_id = teacherId;
  }

  const scope = await verifyAssessmentScope(scoped, actor.schoolId, input);
  if (!scope.ok) return jsonError(400, `Invalid reference: ${scope.violations.join("; ")}`);

  // The report-card component must be one the CLASS actually exposes. Without
  // this, a score could be filed against a component the class does not use, and
  // the mismatch would only appear at publish time.
  if (input.component_id) {
    const resolved = await resolveAssessmentComponent({
      schoolId: actor.schoolId,
      classId: input.class_id,
      componentId: input.component_id,
    });
    if (!resolved.ok) return jsonError(400, resolved.reason);
  }

  const created = await createAssessment(scoped, {
    schoolId: actor.schoolId,
    profileId: actor.profileId,
    input,
  });
  if ("error" in created) return jsonError(409, created.error);

  return NextResponse.json({ id: created.id }, { status: 201 });
}
