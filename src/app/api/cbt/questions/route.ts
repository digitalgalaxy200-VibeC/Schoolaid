import { NextResponse } from "next/server";
import { jsonError, openClientOr503, readJson, staffGate } from "@/lib/cbt/api";
import { questionContextAllows, resolveQuestionContexts } from "@/lib/cbt/authz";
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
 * SERVER-SIDE CONTEXT ENFORCEMENT. A teacher may only read or create questions
 * under a class+subject the school has assigned them (`resolveQuestionContexts`
 * reads `teacher_subjects`). The UI offering authorized classes is convenience;
 * these checks are the control — a crafted request naming another class is
 * refused here, not merely filtered from a dropdown.
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
  // Context views ask for "this class/subject, plus untagged legacy questions".
  // Only an unrestricted actor may use it; for a teacher the server decides.
  const includeUnscoped = searchParams.get("include_unscoped") === "1";

  const contexts = await resolveQuestionContexts(opened.client, gate.actor);

  if (contexts.kind === "pairs") {
    // Refuse outright rather than silently degrade: an empty list would read as
    // "this class has no questions", which is a different (and false) answer.
    if (classId && subjectId && !questionContextAllows(contexts, classId, subjectId)) {
      return jsonError(403, "that class and subject are not ones you teach");
    }
    if (classId && !subjectId && !contexts.pairs.some((p) => p.classId === classId)) {
      return jsonError(403, "that class is not one you teach");
    }
    if (subjectId && !classId && !contexts.pairs.some((p) => p.subjectId === subjectId)) {
      return jsonError(403, "that subject is not one you teach");
    }
  }

  const questions = await listQuestions(opened.client, gate.actor.schoolId, {
    subjectId,
    classId,
    includeUnscoped: contexts.kind === "all" && includeUnscoped,
    allowedPairs: contexts.kind === "pairs" ? contexts.pairs : null,
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

  // ...and ownership by the school does not mean it belongs to THIS teacher's
  // classes: a question must be filed under a class+subject they are assigned.
  const contexts = await resolveQuestionContexts(opened.client, gate.actor);
  if (contexts.kind === "pairs") {
    if (!input.class_id || !input.subject_id) {
      return jsonError(400, "choose the class and subject this question belongs to");
    }
    if (!questionContextAllows(contexts, input.class_id, input.subject_id)) {
      return jsonError(403, "that class and subject are not ones you teach");
    }
  }

  const created = await createQuestion(opened.client, {
    schoolId: gate.actor.schoolId,
    profileId: gate.actor.profileId,
    input,
    // The simplified bank has no review screen: SAVING IS THE APPROVAL STEP,
    // so a question enters the pool ready to use. The publish gate still checks
    // `approved` — this is what satisfies it, and the status lifecycle remains
    // available to administrative tooling.
    initialStatus: "approved",
  });
  if ("error" in created) return jsonError(400, created.error);

  return NextResponse.json({ id: created.id }, { status: 201 });
}
