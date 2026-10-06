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
  // Publishing ONE student is the normal act on the marking screen. Omitting it
  // publishes every official result that is ready — the batch path.
  const onlyStudentId =
    typeof body.student_id === "string" && body.student_id.trim() !== ""
      ? body.student_id.trim()
      : null;

  const service = getServiceClient();

  const allResults = await loadOfficialResults(service, {
    schoolId: ctx.actor.schoolId,
    assessmentId: ctx.assessmentId,
  });
  const results = onlyStudentId
    ? allResults.filter((r) => r.studentId === onlyStudentId)
    : allResults;

  if (results.length === 0) {
    return jsonError(
      409,
      onlyStudentId
        ? "this student has no official, marked result to publish yet"
        : "no official, marked attempts to push yet",
    );
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

  await recordPublish({
    schoolId: ctx.actor.schoolId,
    actorId: ctx.actor.profileId,
    assessment: ctx.assessment,
    results,
  });

  return NextResponse.json({
    ok: true,
    written: push.written,
    conflicts: push.conflicts,
    published: results.map((r) => ({
      student_id: r.studentId,
      attempt_id: r.attemptId,
      score: r.totalScore,
    })),
  });
}

/**
 * Records that reviewed CBT results became official marks — one audit row per
 * student, so "who published what, and when" is answerable in the same log view
 * the paper edits write to. Best-effort by design: a log that cannot be written
 * must never undo a publish that already landed (it is loud in the server log).
 */
async function recordPublish(args: {
  schoolId: string;
  actorId: string;
  assessment: AssessmentContext;
  results: { studentId: string; attemptId: string; totalScore: number }[];
}): Promise<void> {
  if (args.results.length === 0) return;

  if (!args.assessment.class_id || !args.assessment.term_id) {
    console.warn("[cbt/results] publish not audited — the assessment has no class or no term");
    return;
  }

  const service = getServiceClient();
  const { error } = await service.from("report_card_audit_logs").insert(
    args.results.map((r) => ({
      school_id: args.schoolId,
      class_id: args.assessment.class_id,
      term_id: args.assessment.term_id,
      user_id: args.actorId,
      action: "cbt_score_publish",
      details: {
        student_id: r.studentId,
        attempt_id: r.attemptId,
        score: r.totalScore,
        component_id: args.assessment.component_id,
        subject_id: args.assessment.subject_id,
        assessment_title: args.assessment.title,
      },
    })),
  );
  if (error) console.error("[cbt/results] publish audit failed:", error.message);
}
