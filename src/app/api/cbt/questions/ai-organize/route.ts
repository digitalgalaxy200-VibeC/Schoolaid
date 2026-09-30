import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { jsonError, openClientOr503, readJson, staffGate } from "@/lib/cbt/api";
import { authorizeQuestionContext, type CbtActor } from "@/lib/cbt/authz";
import { verifyQuestionScope } from "@/lib/cbt/questions";
import {
  MAX_IMPORT_PAGES,
  buildOrganizeMessages,
  buildVisionOrganizeMessages,
  parseImportedDraft,
} from "@/lib/cbt/ai-import";
import { QUESTION_MEDIA_BUCKET } from "@/lib/cbt/media";
import { validateUpload, type ValidatedUpload } from "@/lib/ai/uploads";
import { AI_FEATURE_KEY } from "@/lib/ai/features";
import { runAiCall, type AiCallOutcome } from "@/lib/ai/gateway";
import { getServiceClient } from "@/lib/supabase/service";
import { ValidationErrors, text, uuid } from "@/lib/validate";

/**
 * GET  /api/cbt/questions/ai-organize — is AI question import available here?
 * POST /api/cbt/questions/ai-organize — organise exam material into proposals.
 *
 * TWO INPUT MODES, ONE CONTRACT:
 *
 *   JSON       { class_id, subject_id, text }   pasted exam text (≤20k chars)
 *   MULTIPART  class_id, subject_id, pages[]    page images the browser
 *              (1..MAX_IMPORT_PAGES files)      rendered from a PDF, or photos
 *
 * The POST returns PROPOSALS ONLY — nothing is saved. The teacher reviews and
 * corrects them, and the approved set is saved through /api/cbt/questions/ai-save.
 *
 * THE ORIGINAL PDF NEVER REACHES THE SERVER. The browser renders its pages to
 * images; only those travel. The page images are staged TEMPORARILY in the
 * private media bucket so the vision model can fetch them via short-lived
 * signed URLs (the pattern the legacy score-sheet import proved works with this
 * provider), and they are deleted in a `finally` after the call — analysis
 * leaves nothing stored.
 *
 * The AI call goes through the shared gateway, so the school's `ai` flag is
 * checked first and every outcome (including refusals) is recorded in
 * `ai_usage_events`. In metering-only mode no credits are charged; the usage
 * record is what the future credit system will read.
 */

/** The serverless request ceiling; large documents are refused with a message. */
const MAX_UPLOAD_TOTAL_BYTES = 4 * 1024 * 1024;
/** Long enough for the provider to fetch each page image mid-call. */
const SIGNED_URL_TTL_SECONDS = 600;

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

  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    return organizePages(request, gate.actor, opened.client);
  }
  return organizeText(request, gate.actor, opened.client);
}

/** The original flow: pasted text, fenced as the only untrusted input. */
async function organizeText(
  request: Request,
  actor: CbtActor,
  scoped: SupabaseClient,
): Promise<NextResponse> {
  const body = await readJson(request);
  const errors = new ValidationErrors();
  const classId = uuid(body, "class_id", errors, { required: true });
  const subjectId = uuid(body, "subject_id", errors, { required: true });
  // 20k characters is the cap the guarded prompt fences at; anything longer is
  // refused with a message instead of being silently truncated mid-question.
  const documentText = text(body, "text", errors, { required: true, max: 20000 });
  if (!classId || !subjectId || !documentText) return jsonError(400, errors.summary());

  const scope = await verifyQuestionScope(scoped, actor.schoolId, {
    subject_id: subjectId,
    class_id: classId,
    academic_level_id: null,
  });
  if (!scope.ok) return jsonError(400, `Invalid reference: ${scope.violations.join("; ")}`);

  // School ownership is not enough: the class+subject must be one the actor
  // actually teaches, or a crafted request could organize into another class.
  const access = await authorizeQuestionContext(scoped, actor, { classId, subjectId });
  if (!access.ok) return jsonError(access.status, access.reason);

  // Class and subject NAMES are trusted labels for the prompt; the document is
  // the only untrusted part, and it never travels outside the fence.
  const [{ data: cls }, { data: subj }] = await Promise.all([
    scoped
      .from("classes")
      .select("name")
      .eq("id", classId)
      .eq("school_id", actor.schoolId)
      .maybeSingle(),
    scoped
      .from("subjects")
      .select("name")
      .eq("id", subjectId)
      .eq("school_id", actor.schoolId)
      .maybeSingle(),
  ]);

  const outcome = await runAiCall({
    supabase: getServiceClient(),
    schoolId: actor.schoolId,
    actorProfileId: actor.profileId,
    feature: "question_import",
    capability: "text",
    messages: buildOrganizeMessages({
      className: cls?.name ?? "the selected class",
      subjectName: subj?.name ?? "the selected subject",
      documentText,
    }),
  });

  return finishOrganize(outcome);
}

/** The upload mode: 1..10 page images, analysed by the vision model. */
async function organizePages(
  request: Request,
  actor: CbtActor,
  scoped: SupabaseClient,
): Promise<NextResponse> {
  const form = await request.formData().catch(() => null);
  if (!form) return jsonError(400, "the upload could not be read");

  const errors = new ValidationErrors();
  const classId = uuid({ v: form.get("class_id") }, "class_id", errors, { required: true });
  const subjectId = uuid({ v: form.get("subject_id") }, "subject_id", errors, { required: true });
  if (!classId || !subjectId) return jsonError(400, errors.summary());

  const files = form
    .getAll("pages")
    .filter((v): v is File => typeof v !== "string" && v.size > 0);

  if (files.length === 0) return jsonError(400, "add at least one page image");
  if (files.length > MAX_IMPORT_PAGES) {
    return jsonError(
      413,
      `a document can be analysed up to ${MAX_IMPORT_PAGES} pages at a time`,
    );
  }

  const pages: ValidatedUpload[] = [];
  let totalBytes = 0;
  for (const file of files) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    totalBytes += bytes.length;
    if (totalBytes > MAX_UPLOAD_TOTAL_BYTES) {
      return jsonError(
        413,
        "these pages are too large to analyse in one request — use fewer pages or lower quality",
      );
    }
    // The client declares the type; the BYTES decide it (validateUpload).
    const validated = validateUpload({
      kind: "image",
      bytes,
      declaredMimeType: file.type,
      filename: file.name,
    });
    if (!validated.ok) return jsonError(400, validated.reason);
    pages.push(validated.upload);
  }

  const scope = await verifyQuestionScope(scoped, actor.schoolId, {
    subject_id: subjectId,
    class_id: classId,
    academic_level_id: null,
  });
  if (!scope.ok) return jsonError(400, `Invalid reference: ${scope.violations.join("; ")}`);

  const access = await authorizeQuestionContext(scoped, actor, { classId, subjectId });
  if (!access.ok) return jsonError(access.status, access.reason);

  const [{ data: cls }, { data: subj }] = await Promise.all([
    scoped
      .from("classes")
      .select("name")
      .eq("id", classId)
      .eq("school_id", actor.schoolId)
      .maybeSingle(),
    scoped
      .from("subjects")
      .select("name")
      .eq("id", subjectId)
      .eq("school_id", actor.schoolId)
      .maybeSingle(),
  ]);

  const service = getServiceClient();
  const stagingPaths: string[] = [];

  try {
    const pageUrls: string[] = [];
    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      const path = `imports/${actor.schoolId}/${crypto.randomUUID()}/page-${i + 1}.${page.extension}`;

      const { error: uploadError } = await service.storage
        .from(QUESTION_MEDIA_BUCKET)
        .upload(path, page.bytes, { contentType: page.mimeType, upsert: false });
      if (uploadError) return jsonError(500, "could not stage the upload for analysis");
      stagingPaths.push(path);

      const { data: signed } = await service.storage
        .from(QUESTION_MEDIA_BUCKET)
        .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
      if (!signed?.signedUrl) return jsonError(500, "could not stage the upload for analysis");
      pageUrls.push(signed.signedUrl);
    }

    const outcome = await runAiCall({
      supabase: service,
      schoolId: actor.schoolId,
      actorProfileId: actor.profileId,
      feature: "question_import",
      capability: "vision",
      messages: buildVisionOrganizeMessages({
        className: cls?.name ?? "the selected class",
        subjectName: subj?.name ?? "the selected subject",
        pageUrls,
      }),
    });

    return finishOrganize(outcome);
  } finally {
    // Analysis leaves nothing stored. Best effort: a failed cleanup leaves
    // private, inert orphans, which is the acceptable failure mode.
    if (stagingPaths.length > 0) {
      try {
        await service.storage.from(QUESTION_MEDIA_BUCKET).remove(stagingPaths);
      } catch (err) {
        console.error("[cbt/ai-organize] could not remove staged pages:", err);
      }
    }
  }
}

/** Both modes end the same way: map the outcome, parse the reply, return proposals. */
function finishOrganize(outcome: AiCallOutcome): NextResponse {
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
