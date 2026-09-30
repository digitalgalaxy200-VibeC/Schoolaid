import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { jsonError, openClientOr503, staffGate } from "@/lib/cbt/api";
import { authorizeQuestionContext, type CbtActor } from "@/lib/cbt/authz";
import {
  attachQuestionImage,
  getQuestionMedia,
  removeQuestionMedia,
  signQuestionMedia,
} from "@/lib/cbt/media";
import { validateUpload } from "@/lib/ai/uploads";
import { getServiceClient } from "@/lib/supabase/service";
import { ValidationErrors, uuid } from "@/lib/validate";

/**
 * Question image endpoint (V1: at most one image per question).
 *
 *   POST   /api/cbt/questions/{id}/media — multipart, one `file` (attach/replace)
 *   DELETE /api/cbt/questions/{id}/media — detach the image
 *   GET    /api/cbt/questions/{id}/media — a short-lived signed URL for staff
 *
 * WHY A DEDICATED ENDPOINT: the question create/edit API stays JSON — an image
 * never rides along with a question payload. This is also the single writer for
 * question media (manual attach and the AI-import review both come through here).
 *
 * AUTHORIZATION: the question's CURRENT class+subject must be one the actor
 * teaches (`authorizeQuestionContext`) — a crafted id cannot attach an image to
 * another class's question. All responses are JSON; the UI turns `error` into an
 * in-app message, never a browser dialog.
 */

type Params = { params: Promise<{ id: string }> };

const SIGNED_URL_TTL_SECONDS = 900;

async function loadQuestionScope(
  scoped: SupabaseClient,
  schoolId: string,
  questionId: string,
): Promise<{ class_id: string | null; subject_id: string | null } | null> {
  const { data } = await scoped
    .from("cbt_questions")
    .select("class_id, subject_id")
    .eq("id", questionId)
    .eq("school_id", schoolId)
    .maybeSingle();
  if (!data) return null;
  return {
    class_id: (data.class_id as string | null) ?? null,
    subject_id: (data.subject_id as string | null) ?? null,
  };
}

async function gate(
  request: Request,
): Promise<
  | { ok: true; actor: CbtActor; scoped: SupabaseClient }
  | { ok: false; response: NextResponse }
> {
  const gated = await staffGate(request);
  if (!gated.ok) return { ok: false, response: gated.response };

  const opened = await openClientOr503(gated.actor);
  if (!opened.ok) return { ok: false, response: opened.response };

  return { ok: true, actor: gated.actor, scoped: opened.client };
}

export async function POST(request: Request, { params }: Params) {
  const base = await gate(request);
  if (!base.ok) return base.response;
  const { actor, scoped } = base;

  const { id } = await params;
  const errors = new ValidationErrors();
  const questionId = uuid({ id }, "id", errors);
  if (!questionId) return jsonError(400, "a valid question id is required");

  const question = await loadQuestionScope(scoped, actor.schoolId, questionId);
  if (!question) return jsonError(404, "question not found");

  const access = await authorizeQuestionContext(scoped, actor, {
    classId: question.class_id,
    subjectId: question.subject_id,
  });
  if (!access.ok) return jsonError(access.status, access.reason);

  const form = await request.formData().catch(() => null);
  if (!form) return jsonError(400, "the upload could not be read");

  const file = form.get("file");
  if (typeof file === "string" || !file || file.size === 0) {
    return jsonError(400, "choose an image to attach");
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const validated = validateUpload({
    kind: "image",
    bytes,
    declaredMimeType: file.type,
    filename: file.name,
  });
  if (!validated.ok) return jsonError(400, validated.reason);

  const attached = await attachQuestionImage(getServiceClient(), {
    schoolId: actor.schoolId,
    questionId,
    upload: validated.upload,
  });
  if ("error" in attached) return jsonError(500, attached.error);

  return NextResponse.json({
    ok: true,
    media: { content_type: validated.upload.mimeType },
  });
}

export async function DELETE(request: Request, { params }: Params) {
  const base = await gate(request);
  if (!base.ok) return base.response;
  const { actor, scoped } = base;

  const { id } = await params;
  const errors = new ValidationErrors();
  const questionId = uuid({ id }, "id", errors);
  if (!questionId) return jsonError(400, "a valid question id is required");

  const question = await loadQuestionScope(scoped, actor.schoolId, questionId);
  if (!question) return jsonError(404, "question not found");

  const access = await authorizeQuestionContext(scoped, actor, {
    classId: question.class_id,
    subjectId: question.subject_id,
  });
  if (!access.ok) return jsonError(access.status, access.reason);

  const removed = await removeQuestionMedia(getServiceClient(), {
    schoolId: actor.schoolId,
    questionId,
  });
  if ("error" in removed) return jsonError(500, removed.error);

  return NextResponse.json({ ok: true });
}

export async function GET(request: Request, { params }: Params) {
  const base = await gate(request);
  if (!base.ok) return base.response;
  const { actor, scoped } = base;

  const { id } = await params;
  const errors = new ValidationErrors();
  const questionId = uuid({ id }, "id", errors);
  if (!questionId) return jsonError(400, "a valid question id is required");

  const question = await loadQuestionScope(scoped, actor.schoolId, questionId);
  if (!question) return jsonError(404, "question not found");

  const access = await authorizeQuestionContext(scoped, actor, {
    classId: question.class_id,
    subjectId: question.subject_id,
  });
  if (!access.ok) return jsonError(access.status, access.reason);

  const media = await getQuestionMedia(scoped, actor.schoolId, questionId);
  if (!media) return jsonError(404, "this question has no image");

  const url = await signQuestionMedia(
    getServiceClient(),
    media.storage_path,
    SIGNED_URL_TTL_SECONDS,
  );
  if (!url) return jsonError(500, "the image could not be opened");

  return NextResponse.json({ url, content_type: media.content_type });
}
