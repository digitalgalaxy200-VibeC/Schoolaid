import { NextResponse } from "next/server";
import { jsonError, openClientOr503, readJson, staffGate } from "@/lib/cbt/api";
import { verifyQuestionScope } from "@/lib/cbt/questions";
import { buildOrganizeMessages, parseImportedDraft } from "@/lib/cbt/ai-import";
import { AI_FEATURE_KEY } from "@/lib/ai/features";
import { runAiCall } from "@/lib/ai/gateway";
import { getServiceClient } from "@/lib/supabase/service";
import { ValidationErrors, text, uuid } from "@/lib/validate";

/**
 * GET  /api/cbt/questions/ai-organize — is AI question import available here?
 * POST /api/cbt/questions/ai-organize — organise pasted exam text into proposals.
 *
 * The POST returns PROPOSALS ONLY — nothing is saved. The teacher reviews and
 * corrects them, and the approved set is saved through /api/cbt/questions/ai-save.
 * See the extraction contract in `src/lib/cbt/ai-import.ts`.
 *
 * The AI call goes through the shared gateway, so the school's `ai` flag is
 * checked first and every outcome (including refusals) is recorded in
 * `ai_usage_events`. In metering-only mode no credits are charged; the usage
 * record is what the future credit system will read.
 */

export async function GET(request: Request) {
  const gate = await staffGate(request);
  if (!gate.ok) return gate.response;

  const opened = await openClientOr503(gate.actor);
  if (!opened.ok) return opened.response;

  const { data, error } = await opened.client
    .from("school_features")
    .select("is_enabled")
    .eq("school_id", gate.actor.schoolId)
    .eq("feature_key", AI_FEATURE_KEY)
    .maybeSingle();

  // A check that could not be performed is not permission — the UI keeps the
  // button hidden, and the POST re-checks through the gateway regardless.
  return NextResponse.json({ enabled: !error && data?.is_enabled === true });
}

export async function POST(request: Request) {
  const gate = await staffGate(request);
  if (!gate.ok) return gate.response;

  const opened = await openClientOr503(gate.actor);
  if (!opened.ok) return opened.response;

  const body = await readJson(request);
  const errors = new ValidationErrors();
  const classId = uuid(body, "class_id", errors, { required: true });
  const subjectId = uuid(body, "subject_id", errors, { required: true });
  // 20k characters is the cap the guarded prompt fences at; anything longer is
  // refused with a message instead of being silently truncated mid-question.
  const documentText = text(body, "text", errors, { required: true, max: 20000 });
  if (!classId || !subjectId || !documentText) return jsonError(400, errors.summary());

  const scope = await verifyQuestionScope(opened.client, gate.actor.schoolId, {
    subject_id: subjectId,
    class_id: classId,
    academic_level_id: null,
  });
  if (!scope.ok) return jsonError(400, `Invalid reference: ${scope.violations.join("; ")}`);

  // Class and subject NAMES are trusted labels for the prompt; the document is
  // the only untrusted part, and it never travels outside the fence.
  const [{ data: cls }, { data: subj }] = await Promise.all([
    opened.client
      .from("classes")
      .select("name")
      .eq("id", classId)
      .eq("school_id", gate.actor.schoolId)
      .maybeSingle(),
    opened.client
      .from("subjects")
      .select("name")
      .eq("id", subjectId)
      .eq("school_id", gate.actor.schoolId)
      .maybeSingle(),
  ]);

  const outcome = await runAiCall({
    supabase: getServiceClient(),
    schoolId: gate.actor.schoolId,
    actorProfileId: gate.actor.profileId,
    feature: "question_import",
    capability: "text",
    messages: buildOrganizeMessages({
      className: cls?.name ?? "the selected class",
      subjectName: subj?.name ?? "the selected subject",
      documentText,
    }),
  });

  switch (outcome.status) {
    case "refused_disabled":
      return jsonError(403, "AI is not enabled for this school.");
    case "refused_no_credits":
      return jsonError(402, "This school has run out of AI credits.");
    case "failed":
      return jsonError(
        502,
        outcome.error || "The AI service could not complete this request. Please try again.",
      );
  }

  if (outcome.result.kind !== "chat") {
    return jsonError(502, "The AI returned an unexpected result.");
  }

  const parsed = parseImportedDraft(outcome.result.text);
  if (!parsed.ok) {
    return jsonError(502, `The AI reply could not be read: ${parsed.reason}`);
  }

  return NextResponse.json(parsed.draft);
}
