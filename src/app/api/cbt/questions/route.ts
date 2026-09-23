import { NextResponse } from "next/server";
import { jsonError, openClientOr503, readJson, staffGate } from "@/lib/cbt/api";
import {
  QUESTION_STATUSES,
  QUESTION_TYPES,
  createQuestion,
  listQuestions,
  parseQuestionInput,
  verifyQuestionScope,
  type QuestionStatus,
  type QuestionType,
} from "@/lib/cbt/questions";
import { ValidationErrors, uuid } from "@/lib/validate";

/**
 * GET  /api/cbt/questions — the question bank, staff only.
 * POST /api/cbt/questions — create a question with its options and answer key.
 *
 * Bank reads deliberately omit options and the answer key (see `listQuestions`):
 * a list view has no use for them, and never selecting them means they cannot
 * leak through this endpoint by accident.
 */

export async function GET(request: Request) {
  const gate = await staffGate(request);
  if (!gate.ok) return gate.response;

  const opened = await openClientOr503(gate.actor);
  if (!opened.ok) return opened.response;

  const { searchParams } = new URL(request.url);

  // Filter ids are validated for SHAPE before they reach Postgres, which would
  // otherwise answer a malformed uuid with a 500 from the cast.
  const raw = {
    subject_id: searchParams.get("subject_id"),
    class_id: searchParams.get("class_id"),
  };
  const errors = new ValidationErrors();
  const subjectId = uuid(raw, "subject_id", errors);
  const classId = uuid(raw, "class_id", errors);
  if (!errors.ok) return jsonError(400, errors.summary());

  const statusParam = searchParams.get("status");
  const typeParam = searchParams.get("question_type");

  const questions = await listQuestions(opened.client, gate.actor.schoolId, {
    subjectId,
    classId,
    status:
      statusParam && (QUESTION_STATUSES as readonly string[]).includes(statusParam)
        ? (statusParam as QuestionStatus)
        : null,
    questionType:
      typeParam && (QUESTION_TYPES as readonly string[]).includes(typeParam)
        ? (typeParam as QuestionType)
        : null,
  });

  return NextResponse.json({ questions });
}

export async function POST(request: Request) {
  const gate = await staffGate(request);
  if (!gate.ok) return gate.response;

  const opened = await openClientOr503(gate.actor);
  if (!opened.ok) return opened.response;

  const body = await readJson(request);
  const errors = new ValidationErrors();
  const input = parseQuestionInput(body, errors);
  if (!input) return jsonError(400, errors.summary());

  // A foreign key proves the row exists, not that this school owns it.
  const scope = await verifyQuestionScope(opened.client, gate.actor.schoolId, input);
  if (!scope.ok) return jsonError(400, `Invalid reference: ${scope.violations.join("; ")}`);

  const created = await createQuestion(opened.client, {
    schoolId: gate.actor.schoolId,
    profileId: gate.actor.profileId,
    input,
  });
  if ("error" in created) return jsonError(400, created.error);

  return NextResponse.json({ id: created.id }, { status: 201 });
}
