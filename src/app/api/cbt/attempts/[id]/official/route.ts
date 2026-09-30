import { NextResponse } from "next/server";
import { assessmentFailure, jsonError, openClientOr503, readJson, staffGate } from "@/lib/cbt/api";
import { authorizeCbtAssessment } from "@/lib/cbt/authz";
import { setOfficialAttempt } from "@/lib/cbt/corrections";
import { getServiceClient } from "@/lib/supabase/service";
import { ValidationErrors, text, uuid } from "@/lib/validate";

/**
 * POST /api/cbt/attempts/{id}/official — choose which attempt holds the official
 * result (PD-4).
 *
 * The default rule promotes an attempt automatically, so this endpoint exists for
 * the exception: Take 1 scored 70, Take 2 scored 55, Take 3 scored 20, and a
 * teacher decides Take 1 is the one that should stand. Attempt history is
 * untouched — this moves a flag and records why.
 *
 * The audit row is written first, inside `setOfficialAttempt`. If it cannot be
 * written, the flag does not move: an official result that nobody can be shown to
 * have chosen is worse than one that was never promoted.
 */

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const gate = await staffGate(request);
  if (!gate.ok) return gate.response;
  const { actor } = gate;

  const { id } = await params;
  const errors = new ValidationErrors();
  if (!uuid({ id }, "id", errors)) return jsonError(400, "a valid attempt id is required");

  const body = await readJson(request);
  const reason = text(body, "reason", errors, { required: true, max: 1000 });
  if (!errors.ok) return jsonError(400, errors.summary());

  const opened = await openClientOr503(actor);
  if (!opened.ok) return opened.response;
  const scoped = opened.client;

  const { data: attempt } = await scoped
    .from("cbt_attempts")
    .select("id, assessment_id, student_id, attempt_number, status, submitted_at, marked_at")
    .eq("id", id)
    .eq("school_id", actor.schoolId)
    .maybeSingle();
  if (!attempt) return jsonError(404, "attempt not found");

  const access = await authorizeCbtAssessment({
    actor,
    assessmentId: attempt.assessment_id,
    intent: "staff",
  });
  if (!access.ok) return assessmentFailure(access);

  const [{ data: attemptRows }, { data: resultRows }] = await Promise.all([
    scoped
      .from("cbt_attempts")
      .select("id, attempt_number, status, submitted_at, marked_at")
      .eq("assessment_id", attempt.assessment_id)
      .eq("student_id", attempt.student_id)
      .eq("school_id", actor.schoolId),
    scoped
      .from("cbt_results")
      .select("attempt_id, is_official")
      .eq("assessment_id", attempt.assessment_id)
      .eq("student_id", attempt.student_id)
      .eq("school_id", actor.schoolId),
  ]);

  const currentOfficial =
    (resultRows ?? []).find((r) => r.is_official === true)?.attempt_id ?? null;

  const service = getServiceClient();

  const moved = await setOfficialAttempt(service, {
    schoolId: actor.schoolId,
    assessmentId: attempt.assessment_id,
    attemptId: id,
    actorId: actor.profileId,
    reason: reason as string,
    attempts: (attemptRows ?? []).map((a) => ({
      id: a.id as string,
      attempt_number: Number(a.attempt_number),
      status: a.status as string,
      submitted_at: a.submitted_at ?? null,
      marked_at: a.marked_at ?? null,
    })),
    results: (resultRows ?? []) as { attempt_id: string; is_official: boolean }[],
    currentOfficialAttemptId: currentOfficial,
    studentId: attempt.student_id,
  });

  if ("error" in moved) return jsonError(409, moved.error);

  return NextResponse.json({ ok: true, official_attempt_id: id, changed: moved.changed });
}
