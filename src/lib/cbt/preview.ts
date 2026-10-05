/**
 * Assessment preview assembly (teacher-facing).
 *
 * Shapes the SAVED paper the way the student will meet it: questions in
 * presentation order, each with its options, marks, section and image.
 *
 * ANSWER KEYS ARE ABSENT BY TYPE. The preview is read-only and there is no field
 * here that could carry a correct answer, a model answer or a rubric — the same
 * guarantee `toStudentView` makes for an attempt, made structurally.
 */

/** The paper's question as the preview delivers it, before media signing. */
export type PreviewQuestionSource = {
  question_id: string;
  question_type: string;
  question_text: string;
  marks: number;
  marks_override: number | null;
  section: string | null;
  media_url: string | null;
};

export type PreviewOptionRow = {
  id: string;
  question_id: string;
  label: string | null;
  option_text: string;
  display_order: number;
};

export type PreviewQuestion = {
  question_id: string;
  question_type: string;
  question_text: string;
  marks: number;
  section: string | null;
  media_url: string | null;
  options: { id: string; label: string | null; text: string }[];
};

/**
 * Joins the assessment's questions to their options.
 *
 * Order is the assessment's order (the caller supplies the links in
 * `display_order`), and within a question the options keep their own
 * `display_order` — the same order the attempt snapshot will freeze.
 */
export function assemblePreviewQuestions(
  questions: PreviewQuestionSource[],
  options: PreviewOptionRow[],
): PreviewQuestion[] {
  const byQuestion = new Map<string, PreviewOptionRow[]>();
  for (const option of [...options].sort((a, b) => a.display_order - b.display_order)) {
    const list = byQuestion.get(option.question_id);
    if (list) list.push(option);
    else byQuestion.set(option.question_id, [option]);
  }

  return questions.map((q) => ({
    question_id: q.question_id,
    question_type: q.question_type,
    question_text: q.question_text,
    // The override wins here for the same reason it will in the snapshot: the
    // paper's total is what the teacher set, not what the bank holds.
    marks: q.marks_override ?? q.marks,
    section: q.section,
    media_url: q.media_url,
    options: (byQuestion.get(q.question_id) ?? []).map((o) => ({
      id: o.id,
      label: o.label,
      text: o.option_text,
    })),
  }));
}
