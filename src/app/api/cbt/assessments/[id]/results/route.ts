import { NextResponse } from "next/server";
import { assessmentFailure, jsonError, openClientOr503, readJson, staffGate } from "@/lib/cbt/api";
import { authorizeCbtAssessment, type CbtActor } from "@/lib/cbt/authz";
import { loadOfficialResults, pushOfficialResults } from "@/lib/cbt/integration";
import { getServiceClient } from "@/lib/supabase/service";
import { ValidationErrors, uuid } from "@/lib/validate";

/**
 * GET  /api/cbt/assessments/{id}/results — what a push WOULD write, writing nothing.
 * POST /api/cbt/assessments/{id}/results — push the official scores into
 * `student_scores`, which is the only table CBT ever writes for report cards.
 *
 * The preview exists so a teacher can see the plan — including every conflict —
 * before anything changes. An integration that writes first and reports
 * afterwards cannot be reviewed, and a score on a child's report card is not a
 * thing to discover afterwards.
 *
 * The push is refused entirely while the class's report card is published
 * (PD-3), and refused as a whole if any student conflicts (PD-2), so a component
 * cannot end up with two sources for some students and one for others.
 */

type Params = { params: Promise<{ id: string }> };

type AssessmentContext = {
  component_id: string | null;
  /** Non-null after `resolve`: a termless assessment is rejected there, because
   *  `student_scores.term_id` is NOT NULL and a score belongs to a term. */
  term_id: string;
  class_id: string;
  subject_id: string | null;
  title: string;
};

/** Explicit, so the caller's control flow narrows on `error` rather than inferring. */
type Resolved =
  | { error: NextResponse }
  | { actor: CbtActor; assessmentId: string; assessment: AssessmentContext };

async function resolve(
  request: Request,
  params: Params["params"],
): Promise<Resolved> {
  const gate = await staffGate(request);
  if (!gate.ok) return { error: gate.response };

  const { id: assessmentId } = await params;
  const errors = new ValidationErrors();
  if (!uuid({ assessmentId }, "assessmentId", errors)) {
    return { error: jsonError(400, "a valid assessment id is required") };
  }

  const access = await authorizeCbtAssessment({
    actor: gate.actor,
    assessmentId,
    intent: "staff",
  });
  if (!access.ok) return { error: assessmentFailure(access) };

  // `component_id` and `term_id` are not part of the guard's alignment shape, so
  // they are read here. A missing term is fatal for the write, because
  // `student_scores.term_id` is NOT NULL and a score belongs to a term.
  const opened = await openClientOr503(gate.actor);
  if (!opened.ok) return { error: opened.response };

  const { data: row } = await opened.client
    .from("cbt_assessments")
    .select("component_id, term_id, class_id, subject_id, title")
    .eq("id", assessmentId)
    .eq("school_id", gate.actor.schoolId)
    .maybeSingle();

  if (!row) return { error: jsonError(404, "assessment not found") };
  if (!row.term_id) {
    return {
      error: jsonError(
        409,
        "this assessment is not bound to a term, so its scores have nowhere to go",
      ),
    };
  }

  return { actor: gate.actor, assessmentId, assessment: row };
}

export async function GET(request: Request, { params }: Params) {
  const ctx = await resolve(request, params);
  if ("error" in ctx) return ctx.error;

  const service = getServiceClient();
  const results = await loadOfficialResults(service, {
    schoolId: ctx.actor.schoolId,
    assessmentId: ctx.assessmentId,
  });

  const push = await pushOfficialResults(service, {
    schoolId: ctx.actor.schoolId,
    classId: ctx.assessment.class_id,
    termId: ctx.assessment.term_id,
    subjectId: ctx.assessment.subject_id ?? null,
    componentId: ctx.assessment.component_id ?? null,
    results,
    dryRun: true,
  });

  if (!push.ok) {
    return NextResponse.json({ error: push.error, locked: push.locked, results }, { status: 409 });
  }

  return NextResponse.json({
    would_write: push.written,
    conflicts: push.conflicts,
    official_results: results.length,
    results,
  });
}

export async function POST(request: Request, { params }: Params) {
  const ctx = await resolve(request, params);
  if ("error" in ctx) return ctx.error;

  const body = await readJson(request);
  // Overwriting a teacher's manual entry must be asked for explicitly; without
  // this the push reports the conflict instead of silently replacing their work.
  const overwriteManual = body.overwrite_manual === true;

  const service = getServiceClient();

  const results = await loadOfficialResults(service, {
    schoolId: ctx.actor.schoolId,
    assessmentId: ctx.assessmentId,
  });
  if (results.length === 0) {
    return jsonError(409, "no official, marked attempts to push yet");
  }

  const push = await pushOfficialResults(service, {
    schoolId: ctx.actor.schoolId,
    classId: ctx.assessment.class_id,
    termId: ctx.assessment.term_id,
    subjectId: ctx.assessment.subject_id ?? null,
    componentId: ctx.assessment.component_id ?? null,
    results,
    overwriteManual,
  });

  if (!push.ok) {
    return NextResponse.json(
      { error: push.error, locked: push.locked, conflicts: push.conflicts },
      { status: push.locked ? 423 : 409 },
    );
  }

  return NextResponse.json({ ok: true, written: push.written, conflicts: push.conflicts });
}
