"use client";

import { useEffect, useState } from "react";
import { Button, Card, Modal } from "@/components/ui";
import { QuestionCard } from "@/components/cbt/QuestionCard";

/**
 * The whole saved paper, moved through ONE QUESTION AT A TIME with the SAME
 * component the student attempt screen uses (`QuestionCard`) — so what the
 * teacher sees is what the student will sit.
 *
 * Nothing here talks to the attempt engine: no attempt is started, nothing is
 * saved, and the endpoint behind it returns no answer keys. A question-time
 * preview (while editing one question) is a different modal — this one answers
 * "what does the whole paper look like?".
 *
 * The drill matches the student's: Previous/Next, a numbered strip to jump, and
 * on the LAST question Next finishes the preview (it closes). There is no submit
 * here — the teacher is only looking.
 */

type PreviewQuestion = {
  question_id: string;
  question_type: string;
  question_text: string;
  marks: number;
  section: string | null;
  media_url: string | null;
  options: { id: string; label: string | null; text: string }[];
};

type PreviewPayload = {
  assessment_id: string;
  title: string;
  instructions: string | null;
  sections: { label: string; instruction: string | null }[];
  questions: PreviewQuestion[];
};

/** The card only understands the three real types; anything else reads as MCQ. */
function cardType(value: string): "mcq" | "true_false" | "theory" {
  if (value === "theory") return "theory";
  if (value === "true_false") return "true_false";
  return "mcq";
}

export function AssessmentPreviewModal({
  isOpen,
  onClose,
  assessmentId,
  contextLabel = null,
  /** The paper has edits that are not saved yet; the preview shows the SAVED paper. */
  dirty = false,
}: {
  isOpen: boolean;
  onClose: () => void;
  assessmentId: string;
  contextLabel?: string | null;
  dirty?: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewPayload | null>(null);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!isOpen || !assessmentId) return;
    let cancelled = false;

    setLoading(true);
    setError(null);
    setPreview(null);
    setIndex(0);

    fetch(`/api/cbt/assessments/${assessmentId}/preview`)
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (!cancelled) setError(body.error || `Could not load the preview (HTTP ${res.status})`);
          return;
        }
        if (!cancelled) setPreview(body.preview as PreviewPayload);
      })
      .catch(() => {
        if (!cancelled) setError("Could not reach the server.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, assessmentId]);

  const questions = preview?.questions ?? [];
  const total = questions.length;
  const current = questions[index] ?? null;
  const last = total > 0 && index >= total - 1;

  const sectionByLabel = new Map(
    (preview?.sections ?? [])
      .filter((s) => s && typeof s.label === "string")
      .map((s) => [s.label.trim().toLowerCase(), s]),
  );

  const currentSection = (() => {
    const label = current?.section?.trim() || null;
    if (!label) return null;
    return {
      label,
      instruction: sectionByLabel.get(label.toLowerCase())?.instruction ?? null,
    };
  })();

  const next = () => {
    if (last) onClose();
    else setIndex((i) => Math.min(total - 1, i + 1));
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Preview — student view"
      size="xl"
      footer={
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      }
    >
      {loading && <p className="text-body text-text-secondary">Loading the paper…</p>}

      {error && (
        <div className="rounded-lg border border-error bg-error-bg px-4 py-3 text-body text-error">
          {error}
        </div>
      )}

      {preview && (
        <div className="space-y-4">
          <div>
            <p className="text-body font-semibold text-text-primary">{preview.title}</p>
            {contextLabel && <p className="text-caption text-text-secondary">{contextLabel}</p>}
          </div>

          {dirty && (
            <div className="rounded-lg border border-warning bg-warning-bg px-4 py-3 text-body text-warning">
              This is the saved paper. Your unsaved question changes are not shown — save the
              paper first to preview them.
            </div>
          )}

          {total === 0 ? (
            <p className="text-body text-text-secondary">
              No questions on this paper yet. Add questions first.
            </p>
          ) : (
            <>
              {/* The paper's instructions are context for the start of the paper,
                  so they read on question 1 only. */}
              {index === 0 && preview.instructions && (
                <Card variant="default">
                  <p className="text-caption font-semibold text-text-secondary">Instructions</p>
                  <p className="text-body text-text-primary whitespace-pre-wrap mt-1">
                    {preview.instructions}
                  </p>
                </Card>
              )}

              {current && (
                <QuestionCard
                  questionText={current.question_text}
                  questionType={cardType(current.question_type)}
                  marks={current.marks}
                  section={currentSection}
                  mediaUrl={current.media_url}
                  options={current.options}
                  position={`Question ${index + 1} of ${total}`}
                  readOnly
                />
              )}

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    disabled={index === 0}
                    onClick={() => setIndex((i) => Math.max(0, i - 1))}
                  >
                    Previous
                  </Button>
                  <Button variant="secondary" onClick={next}>
                    {last ? "Finish" : "Next"}
                  </Button>
                </div>

                <div className="flex flex-wrap gap-1">
                  {questions.map((q, i) => (
                    <button
                      key={`${q.question_id}-${i}`}
                      type="button"
                      onClick={() => setIndex(i)}
                      aria-label={`Go to question ${i + 1}`}
                      className={`w-8 h-8 rounded-md text-caption font-semibold border transition-colors ${
                        i === index
                          ? "border-primary bg-primary text-text-inverse"
                          : "border-border bg-surface text-text-secondary hover:bg-clay"
                      }`}
                    >
                      {i + 1}
                    </button>
                  ))}
                </div>
              </div>

              <p className="text-caption text-text-secondary">
                Students see exactly this. Correct answers and marking guidance are teacher-only and
                are not shown.
                {last ? " This is the last question — Next finishes the preview." : ""}
              </p>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
