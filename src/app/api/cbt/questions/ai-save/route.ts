import { NextResponse } from "next/server";
import { jsonError, openClientOr503, readJson, staffGate } from "@/lib/cbt/api";
import { createQuestion, parseQuestionInput, verifyQuestionScope } from "@/lib/cbt/questions";
import { ValidationErrors, objectList, uuid } from "@/lib/validate";

/**
 * POST /api/cbt/questions/ai-save — save the teacher-approved AI import.
 *
 * This is the ONLY place an AI-organised import touches the database, and it
 * receives exactly what the review screen showed: the teacher's corrected rows.
 * Questions are inserted with status "approved" (the review IS the approval
 * step) and a pointer-style provenance; the full text lives on the question
 * itself, never in the usage log.
 *
 * The class + subject were chosen BEFORE the paste and are injected here — the
 * model neither chose nor can change the academic context.
 */

export async function POST(request: Request) {
  const gate = await staffGate(request);
  if (!gate.ok) return gate.response;

  const opened = await openClientOr503(gate.actor);
  if (!opened.ok) return opened.response;

  const body = await readJson(request);
  const errors = new ValidationErrors();
  const classId = uuid(body, "class_id", errors, { required: true });
  const subjectId = uuid(body, "subject_id", errors, { required: true });
  const rawQuestions = objectList(body, "questions", errors, { required: true, min: 1, max: 100 });
  const rawSections = objectList(body, "sections", errors, { max: 30 });
  if (!classId || !subjectId || !rawQuestions) return jsonError(400, errors.summary());

  const scope = await verifyQuestionScope(opened.client, gate.actor.schoolId, {
    subject_id: subjectId,
    class_id: classId,
    academic_level_id: null,
  });
  if (!scope.ok) return jsonError(400, `Invalid reference: ${scope.violations.join("; ")}`);

  // Section instructions captured at import time travel ON the questions'
  // metadata, so the assessment builder can prefill them later.
  const instructionByLabel = new Map<string, string>();
  for (const section of rawSections ?? []) {
    const label = typeof section.label === "string" ? section.label.trim().toLowerCase() : "";
    const instruction = typeof section.instruction === "string" ? section.instruction.trim() : "";
    if (label && instruction) instructionByLabel.set(label, instruction.slice(0, 2000));
  }

  const provenance = {
    source: "ai_import",
    imported_by: gate.actor.profileId,
    imported_at: new Date().toISOString(),
  };

  const ids: string[] = [];
  for (let i = 0; i < rawQuestions.length; i++) {
    const itemErrors = new ValidationErrors();
    const input = parseQuestionInput(rawQuestions[i], itemErrors);
    if (!input) return jsonError(400, `Question ${i + 1}: ${itemErrors.summary()}`);

    // The context chosen before the paste wins over anything in the row.
    input.class_id = classId;
    input.subject_id = subjectId;

    const instruction = input.section
      ? instructionByLabel.get(input.section.trim().toLowerCase())
      : undefined;

    const created = await createQuestion(opened.client, {
      schoolId: gate.actor.schoolId,
      profileId: gate.actor.profileId,
      input,
      aiProvenance: provenance,
      metadata: instruction ? { section_instruction: instruction } : null,
      initialStatus: "approved",
    });
    if ("error" in created) return jsonError(500, `Question ${i + 1}: ${created.error}`);
    ids.push(created.id);
  }

  return NextResponse.json({ created: ids.length, ids }, { status: 201 });
}
