"use client";

import { Modal } from "@/components/ui";
import { QuestionCard, type QuestionCardOption } from "./QuestionCard";

/**
 * Teacher preview of a single question, rendered with the SAME component the
 * student attempt screen uses (`QuestionCard`). Nothing here talks to the API:
 * the preview cannot start an attempt, save an answer, or reveal the key.
 *
 * It exists so that "what the student sees" is checkable — especially for
 * questions carrying an image — BEFORE the question is approved or published.
 */

export type PreviewQuestion = {
  questionText: string;
  questionType: "mcq" | "true_false" | "theory";
  marks: number;
  section?: string | null;
  topic?: string | null;
  mediaUrl?: string | null;
  options: QuestionCardOption[];
};

export function QuestionPreviewModal({
  isOpen,
  onClose,
  question,
  contextLabel = null,
}: {
  isOpen: boolean;
  onClose: () => void;
  question: PreviewQuestion | null;
  /** e.g. "Basic 1 · Mathematics" — shown above the card. */
  contextLabel?: string | null;
}) {
  return (
    <Modal
      isOpen={isOpen && question !== null}
      onClose={onClose}
      title="Preview — student view"
      size="lg"
    >
      {question && (
        <div className="space-y-4">
          {contextLabel && <p className="text-caption text-text-secondary">{contextLabel}</p>}

          <QuestionCard
            questionText={question.questionText}
            questionType={question.questionType}
            marks={question.marks}
            section={question.section ? { label: question.section } : null}
            mediaUrl={question.mediaUrl ?? null}
            options={question.options}
            position="Preview"
            readOnly
          />

          <p className="text-caption text-text-secondary">
            Students see exactly this. The topic{question.topic ? ` (“${question.topic}”)` : ""} and
            the correct answer are teacher-only and are not shown.
          </p>
        </div>
      )}
    </Modal>
  );
}
