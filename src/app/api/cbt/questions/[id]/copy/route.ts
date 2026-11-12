import { NextResponse } from "next/server";
import { jsonError, openClientOr503, readJson, staffGate } from "@/lib/cbt/api";
import { authorizeQuestionContext } from "@/lib/cbt/authz";
import { copyQuestion, getQuestion } from "@/lib/cbt/questions";
import { ValidationErrors, uuid } from "@/lib/validate";

/**
 * POST /api/cbt/questions/{id}/copy — "Reuse & Edit".
 *
 * Produces an INDEPENDENT copy of a historical question: same wording, options,
 * answer key and image reference, but its own row, its own academic context and
 * `derived_from_id` pointing at the original. The teacher edits the copy, so the
 * original — and every paper built from it — is untouched.
 *
 * The target context comes from the caller. The assessment builder sends the
 * examination's class/subject/term/session; a standalone copy falls back to the
 * source question's class/subject and the school's active term.
 *
 * Staff only, and the copy must be filed somewhere the actor may author in —
 * checked here, not merely hidden in the UI.
 */

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const gate = await staffGate(request);
  if (!gate.ok) return gate.response;

  const { id } = await params;
  const errors = new ValidationErrors();
  if (!uuid({ id }, "id", errors)) return jsonError(400, "a valid question id is required");

  const opened = await openClientOr503(gate.actor);
  if (!opened.ok) return opened.response;

  const body = await readJson(request);

  const source = await getQuestion(opened.client, gate.actor.schoolId, id);
  if (!source) return jsonError(404, "question not found");

  const classId = uuid(body, "class_id", errors) ?? source.class_id;
  const subjectId = uuid(body, "subject_id", errors) ?? source.subject_id;

  let sessionId = uuid(body, "session_id", errors);
  let termId = uuid(body, "term_id", errors);

  if (!termId) {
    const { data: activeTerm } = await opened.client
      .from("academic_terms")
      .select("id, session_id")
      .eq("school_id", gate.actor.schoolId)
      .eq("is_active", true)
      .maybeSingle();
    if (activeTerm) {
      termId = activeTerm.id as string;
      sessionId = sessionId ?? ((activeTerm.session_id as string | null) ?? null);
    }
  } else if (!sessionId) {
    const { data: term } = await opened.client
      .from("academic_terms")
      .select("session_id")
      .eq("id", termId)
      .eq("school_id", gate.actor.schoolId)
      .maybeSingle();
    sessionId = (term?.session_id as string | null) ?? null;
  }

  // The copy is a new question, so it must be filed in a context the actor can
  // author in — the same rule as creating one by hand.
  const allowed = await authorizeQuestionContext(opened.client, gate.actor, {
    classId,
    subjectId,
  });
  if (!allowed.ok) return jsonError(allowed.status, allowed.reason);

  const copied = await copyQuestion(opened.client, {
    schoolId: gate.actor.schoolId,
    profileId: gate.actor.profileId,
    questionId: id,
    target: {
      session_id: sessionId ?? null,
      term_id: termId ?? null,
      class_id: classId ?? null,
      subject_id: subjectId ?? null,
    },
  });
  if ("error" in copied) return jsonError(400, copied.error);

  return NextResponse.json({ id: copied.id, derived_from_id: id }, { status: 201 });
}
