import { NextResponse } from "next/server";
import { jsonError, openClientOr503, staffGate } from "@/lib/cbt/api";
import { getAssessment } from "@/lib/cbt/assessments";
import { readQuestionMediaMap, signQuestionMedia } from "@/lib/cbt/media";
import {
  assemblePreviewQuestions,
  type PreviewOptionRow,
  type PreviewQuestionSource,
} from "@/lib/cbt/preview";
import { getServiceClient } from "@/lib/supabase/service";
import { ValidationErrors, uuid } from "@/lib/validate";

/**
 * GET /api/cbt/assessments/{id}/preview — the whole saved paper, in order, as
 * the student will meet it.
 *
 * READ-ONLY BY CONSTRUCTION: it starts no attempt, saves no answer and reveals
 * no answer key (see `src/lib/cbt/preview.ts`, whose result type has no field
 * that could carry one). The teacher's question-time preview of a SINGLE
 * question is a different screen (`QuestionPreviewModal`); this one is the
 * paper.
 *
 * Media is signed for 15 minutes — a preview is a glance, not a sitting, which
 * is why it does not use the attempt's time-limit-derived window.
 */

type Params = { params: Promise<{ id: string }> };

const PREVIEW_MEDIA_TTL_SECONDS = 900;

export async function GET(request: Request, { params }: Params) {
  const gate = await staffGate(request);
  if (!gate.ok) return gate.response;

  const { id } = await params;
  const errors = new ValidationErrors();
  if (!uuid({ id }, "id", errors)) return jsonError(400, "a valid assessment id is required");

  const opened = await openClientOr503(gate.actor);
  if (!opened.ok) return opened.response;

  const assessment = await getAssessment(opened.client, gate.actor.schoolId, id);
  if (!assessment) return jsonError(404, "assessment not found");

  const questionIds = assessment.questions.map((q) => q.question_id);

  const [{ data: optionRows }, { data: questionRows }, mediaMap] = await Promise.all([
    questionIds.length
      ? opened.client
          .from("cbt_question_options")
          .select("id, question_id, label, option_text, display_order")
          .eq("school_id", gate.actor.schoolId)
          .in("question_id", questionIds)
      : Promise.resolve({ data: [] }),
    questionIds.length
      ? opened.client
          .from("cbt_questions")
          .select("id, section")
          .eq("school_id", gate.actor.schoolId)
          .in("id", questionIds)
      : Promise.resolve({ data: [] }),
    readQuestionMediaMap(opened.client, gate.actor.schoolId, questionIds),
  ]);

  const sectionById = new Map(
    (questionRows ?? []).map((q) => [q.id as string, (q.section as string | null) ?? null]),
  );

  // Storage access needs the service client, so it is opened only when there is
  // actually an image to sign — a school with no question media never needs it.
  const service = mediaMap.size > 0 ? getServiceClient() : null;

  const questions: PreviewQuestionSource[] = await Promise.all(
    assessment.questions.map(async (q) => {
      const media = mediaMap.get(q.question_id);
      return {
        question_id: q.question_id,
        question_type: q.question_type,
        question_text: q.question_text,
        marks: q.marks,
        marks_override: q.marks_override,
        section: sectionById.get(q.question_id) ?? null,
        media_url:
          media && service
            ? await signQuestionMedia(service, media.storage_path, PREVIEW_MEDIA_TTL_SECONDS)
            : null,
      };
    }),
  );

  return NextResponse.json({
    preview: {
      assessment_id: assessment.id,
      title: assessment.title,
      instructions: assessment.instructions,
      sections: assessment.sections ?? [],
      questions: assemblePreviewQuestions(questions, (optionRows ?? []) as PreviewOptionRow[]),
    },
  });
}
