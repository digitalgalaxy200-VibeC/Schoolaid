import { NextResponse } from "next/server";
import { assessmentFailure, jsonError, openClientOr503, staffGate } from "@/lib/cbt/api";
import { authorizeCbtAssessment } from "@/lib/cbt/authz";
import { getAssessment, unpublishAssessment } from "@/lib/cbt/assessments";
import { ValidationErrors, uuid } from "@/lib/validate";

/**
 * POST /api/cbt/assessments/{id}/unpublish — take a published assessment back to
 * draft so its questions can be corrected, then published again.
 *
 * The mirror of `publish`, deliberately with fewer gates. Publishing has to prove the
 * paper is fit to be sat (approved questions, within the component's marks, bound to a
 * component); taking it back has nothing to prove, and refusing would trap a teacher
 * who has already spotted the mistake.
 *
 * No attempt-count check: attempts already taken keep their own frozen papers and stay
 * markable, because every staff path is gated by the assessment's alignment and never
 * by its status. The only thing this stops is a student STARTING an attempt. See
 * `unpublishAssessment`.
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

  // Checked here rather than only inside the transition, so a missing assessment
  // answers 404 instead of the 409 a refused transition would give.
  const assessment = await getAssessment(opened.client, gate.actor.schoolId, id);
  if (!assessment) return jsonError(404, "assessment not found");

  const unpublished = await unpublishAssessment(
    opened.client,
    { schoolId: gate.actor.schoolId, assessmentId: id, now: new Date() },
  );
  if ("error" in unpublished) return jsonError(409, unpublished.error);

  return NextResponse.json({ ok: true, published: false, status: "draft" });
}
