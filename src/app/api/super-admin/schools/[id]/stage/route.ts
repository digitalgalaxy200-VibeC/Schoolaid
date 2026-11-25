import { NextResponse } from "next/server";
import { verifySuperAdmin } from "@/lib/api-auth";
import { getServiceClient } from "@/lib/supabase/service";
import { PIPELINE_STAGE_LABELS, isPipelineStage } from "@/lib/super-admin/pipeline";
import { ValidationErrors, text, uuid } from "@/lib/validate";

/**
 * PATCH /api/super-admin/schools/{id}/stage
 *
 * Moves a school along the partnership pipeline. Deliberately its own endpoint
 * rather than a field on the general school PUT, which accepts any body: a stage
 * change must be validated against the known list and must leave a trail, because
 * it is the one field that says what we promised a school and how far we got.
 *
 * The write and its audit row are both performed here. If the audit insert fails,
 * the request reports failure — a stage change nobody can trace is worse than no
 * change.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { authorized, userId } = await verifySuperAdmin(request);
  if (!authorized || !userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const errors = new ValidationErrors();
  if (!uuid({ id }, "id", errors)) {
    return NextResponse.json({ error: "a valid school id is required" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const rawStage = (body as { stage?: unknown }).stage;
  const owner = text(body, "owner", errors, { max: 120 });

  // `null` is a legitimate value: it means "not triaged yet", and a super admin
  // must be able to send a school back to that state.
  const stage = rawStage === null ? null : rawStage;
  if (stage !== null && !isPipelineStage(stage)) {
    return NextResponse.json(
      {
        error: `Unknown stage. Expected one of: ${Object.keys(PIPELINE_STAGE_LABELS).join(", ")}.`,
      },
      { status: 400 },
    );
  }

  const supabase = getServiceClient();

  const { data: school } = await supabase
    .from("schools")
    .select("id, name, pipeline_stage")
    .eq("id", id)
    .maybeSingle();
  if (!school) return NextResponse.json({ error: "School not found" }, { status: 404 });

  const { data: updated, error } = await supabase
    .from("schools")
    .update({
      pipeline_stage: stage,
      pipeline_stage_changed_at: new Date().toISOString(),
      ...(owner !== null ? { pipeline_owner: owner || null } : {}),
    })
    .eq("id", id)
    .select("id, pipeline_stage, pipeline_stage_changed_at, pipeline_owner")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const from = school.pipeline_stage
    ? PIPELINE_STAGE_LABELS[school.pipeline_stage as keyof typeof PIPELINE_STAGE_LABELS]
    : "not set";
  const to = stage ? PIPELINE_STAGE_LABELS[stage] : "not set";

  // support_logs is the existing super-admin trail (impersonation already writes
  // there). Reusing it keeps one place to read admin history from.
  const { error: logError } = await supabase.from("support_logs").insert({
    school_id: id,
    super_admin_id: userId,
    action: `Pipeline stage: ${school.name} — ${from} → ${to}`,
  });
  if (logError) {
    console.error("[schools/stage] audit write failed:", logError.message);
    return NextResponse.json(
      { error: "The stage changed but could not be recorded in the audit trail." },
      { status: 500 },
    );
  }

  return NextResponse.json(updated);
}
