import { NextResponse } from "next/server";
import { assessmentFailure, jsonError, openClientOr503, staffGate } from "@/lib/cbt/api";
import { authorizeCbtAssessment } from "@/lib/cbt/authz";
import { resolveAssessmentComponent } from "@/lib/cbt/integration";
import { getAssessment, publishAssessment } from "@/lib/cbt/assessments";
import { validateAssessmentReadiness, type QuestionStatus } from "@/lib/cbt/questions";
import { ValidationErrors, uuid } from "@/lib/validate";

/**
 * POST /api/cbt/assessments/{id}/publish — make the assessment available to students.
 *
 * THE GATE IS THE POINT OF THIS ROUTE. Publishing runs
 * `validateAssessmentReadiness` first, so nothing unapproved, empty or
 * over-allocated can reach a student:
 *
 *   - every question must be APPROVED (a teacher can build from drafts and
 *     approve as they go, but not publish past one);
 *   - the paper must be worth more than zero marks;
 *   - the questions must not total more than the report-card component allows,
 *     or the score could not be written back to the report card at all.
 *
 * Refusing here is far better than discovering it during marking.
 */

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
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

  const assessment = await getAssessment(opened.client, gate.actor.schoolId, id);
  if (!assessment) return jsonError(404, "assessment not found");

  // Effective marks per question: the assessment's override wins over the
  // question's own marks, which is what the student will actually be scored on.
  const marks = assessment.questions.map((q) => q.marks_override ?? q.marks);

  // PD-1 requires the assessment to be bound to the report-card component its
  // result will feed. Publishing without one produces an assessment whose scores
  // have nowhere to go — the failure would surface much later, during the results
  // push, so it is refused here instead. If a school ever needs unbound
  // assessments (a practice paper, say), this is the one check to relax.
  if (!assessment.component_id) {
    return NextResponse.json(
      {
        error: "this assessment is not ready to publish",
        problems: [
          "no report-card component is selected, so a result would have nowhere to be written",
        ],
      },
      { status: 409 },
    );
  }

  // How much the report-card component can hold.
  const resolved = await resolveAssessmentComponent({
    schoolId: gate.actor.schoolId,
    classId: assessment.class_id,
    componentId: assessment.component_id,
  });
  if (!resolved.ok) {
    return NextResponse.json(
      { error: "this assessment is not ready to publish", problems: [resolved.reason] },
      { status: 409 },
    );
  }
  const totalMarksAvailable = resolved.component.maximum_score;

  const readiness = validateAssessmentReadiness({
    questionCount: assessment.questions.length,
    statuses: assessment.questions.map((q) => q.status as QuestionStatus),
    marks,
    totalMarksAvailable,
  });

  if (!readiness.ok) {
    return NextResponse.json(
      { error: "this assessment is not ready to publish", problems: readiness.errors },
      { status: 409 },
    );
  }

  const published = await publishAssessment(
    opened.client,
    { schoolId: gate.actor.schoolId, assessmentId: id, now: new Date() },
  );
  if ("error" in published) return jsonError(409, published.error);

  return NextResponse.json({
    ok: true,
    published: true,
    question_count: assessment.questions.length,
    total_marks: marks.reduce((sum, m) => sum + m, 0),
  });
}
