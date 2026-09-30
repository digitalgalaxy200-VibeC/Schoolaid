import { NextResponse } from "next/server";
import { jsonError, openClientOr503, readJson, staffGate } from "@/lib/cbt/api";
import { questionContextAllows, resolveQuestionContexts } from "@/lib/cbt/authz";
import { signQuestionMedia } from "@/lib/cbt/media";
import { getServiceClient } from "@/lib/supabase/service";
import {
  QUESTION_STATUSES,
  getQuestion,
  parseQuestionInput,
  setQuestionStatus,
  updateQuestion,
  verifyQuestionScope,
  type QuestionStatus,
} from "@/lib/cbt/questions";
import { ValidationErrors, oneOf, uuid } from "@/lib/validate";

/**
 * GET   /api/cbt/questions/{id} — one question, including its answer key.
 * PATCH /api/cbt/questions/{id} — apply a content edit.
 * POST  /api/cbt/questions/{id} — move the question through its lifecycle.
 *
 * Staff only throughout. The answer key is returned here and ONLY here: a single
 * question's detail view for a teacher who is allowed to see it.
 *
 * Archive is a status change (`POST {status:"archived"}`), not a DELETE. The row
 * is referenced by assessments, and history — including what a past student was
 * shown — must not become unresolvable because a question was removed.
 */

type Params = { params: Promise<{ id: string }> };

async function questionId(params: Params["params"]): Promise<string | null> {
  const { id } = await params;
  const errors = new ValidationErrors();
  return uuid({ id }, "id", errors);
}

export async function GET(request: Request, { params }: Params) {
  const gate = await staffGate(request);
  if (!gate.ok) return gate.response;

  const id = await questionId(params);
  if (!id) return jsonError(400, "a valid question id is required");

  const opened = await openClientOr503(gate.actor);
  if (!opened.ok) return opened.response;

  const question = await getQuestion(opened.client, gate.actor.schoolId, id);
  if (!question) return jsonError(404, "question not found");

  // A question outside the caller's assigned classes is not theirs to read —
  // including its answer key, which this route is the only place to return.
  const contexts = await resolveQuestionContexts(opened.client, gate.actor);
  if (
    contexts.kind === "pairs" &&
    !questionContextAllows(contexts, question.class_id, question.subject_id)
  ) {
    return jsonError(403, "that question is not in a class and subject you teach");
  }

  // The edit form shows the current image; sign it per read (the bucket stays
  // private and URLs are dynamic by design).
  const imageUrl = question.media
    ? await signQuestionMedia(getServiceClient(), question.media.storage_path, 900)
    : null;

  return NextResponse.json({ question: { ...question, image_url: imageUrl } });
}

export async function PATCH(request: Request, { params }: Params) {
  const gate = await staffGate(request);
  if (!gate.ok) return gate.response;

  const id = await questionId(params);
  if (!id) return jsonError(400, "a valid question id is required");

  const opened = await openClientOr503(gate.actor);
  if (!opened.ok) return opened.response;

  const body = await readJson(request);
  const errors = new ValidationErrors();
  const input = parseQuestionInput(body, errors);
  if (!input) return jsonError(400, errors.summary());

  const scope = await verifyQuestionScope(opened.client, gate.actor.schoolId, input);
  if (!scope.ok) return jsonError(400, `Invalid reference: ${scope.violations.join("; ")}`);

  // Both ends of the edit must be the caller's own context: a teacher cannot
  // reach into another class's bank, and cannot file a question into one either.
  const contexts = await resolveQuestionContexts(opened.client, gate.actor);
  if (contexts.kind === "pairs") {
    if (!input.class_id || !input.subject_id) {
      return jsonError(403, "questions must be filed under a class and subject you teach");
    }
    if (!questionContextAllows(contexts, input.class_id, input.subject_id)) {
      return jsonError(403, "that class and subject are not ones you teach");
    }

    const { data: current } = await opened.client
      .from("cbt_questions")
      .select("class_id, subject_id")
      .eq("id", id)
      .eq("school_id", gate.actor.schoolId)
      .maybeSingle();
    if (!current) return jsonError(404, "question not found");
    if (!questionContextAllows(contexts, current.class_id ?? null, current.subject_id ?? null)) {
      return jsonError(403, "that question is not in a class and subject you teach");
    }
  }

  const updated = await updateQuestion(opened.client, {
    schoolId: gate.actor.schoolId,
    questionId: id,
    input,
  });
  // The reopen rule and "not found" surface as distinct statuses the caller can
  // act on — "reopen the question first" is actionable; a generic 500 is not.
  if ("error" in updated) {
    if (updated.error === "question not found") return jsonError(404, updated.error);
    return jsonError(409, updated.error);
  }

  return NextResponse.json({ ok: true });
}

export async function POST(request: Request, { params }: Params) {
  const gate = await staffGate(request);
  if (!gate.ok) return gate.response;

  const id = await questionId(params);
  if (!id) return jsonError(400, "a valid question id is required");

  const opened = await openClientOr503(gate.actor);
  if (!opened.ok) return opened.response;

  const body = await readJson(request);
  const errors = new ValidationErrors();
  const to = oneOf(body, "status", QUESTION_STATUSES, errors, {
    required: true,
  }) as QuestionStatus | null;
  if (!to) return jsonError(400, errors.summary());

  // Lifecycle moves are administrative; they still respect the class+subject
  // boundary, so a teacher cannot retire or resurrect another class's question.
  const contexts = await resolveQuestionContexts(opened.client, gate.actor);
  if (contexts.kind === "pairs") {
    const { data: current } = await opened.client
      .from("cbt_questions")
      .select("class_id, subject_id")
      .eq("id", id)
      .eq("school_id", gate.actor.schoolId)
      .maybeSingle();
    if (!current) return jsonError(404, "question not found");
    if (!questionContextAllows(contexts, current.class_id ?? null, current.subject_id ?? null)) {
      return jsonError(403, "that question is not in a class and subject you teach");
    }
  }

  const moved = await setQuestionStatus(opened.client, {
    schoolId: gate.actor.schoolId,
    questionId: id,
    to,
  });
  if ("error" in moved) {
    if (moved.error === "question not found") return jsonError(404, moved.error);
    return jsonError(409, moved.error);
  }

  return NextResponse.json({ ok: true, status: to });
}
