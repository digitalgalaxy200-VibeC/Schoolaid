import { NextResponse } from "next/server";
import { jsonError, openClientOr503, readJson, staffGate } from "@/lib/cbt/api";
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

  return NextResponse.json({ question });
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
