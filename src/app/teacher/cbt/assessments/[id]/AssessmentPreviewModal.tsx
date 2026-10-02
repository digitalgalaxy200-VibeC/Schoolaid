"use client";

import { useEffect, useState } from "react";
import { Button, Card, Modal } from "@/components/ui";
import { QuestionCard } from "@/components/cbt/QuestionCard";

/**
 * The whole saved paper, rendered with the SAME component the student attempt
 * screen uses (`QuestionCard`) — one card per question, in presentation order,
 * with the sections and their instructions above each card.
 *
 * Nothing here talks to the attempt engine: no attempt is started, nothing is
 * saved, and the endpoint behind it returns no answer keys. A question-time
 * preview (while editing one question) is a different modal — this one answers
 * "what does the whole paper look like?".
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

  useEffect(() => {
    if (!isOpen || !assessmentId) return;
    let cancelled = false;

    setLoading(true);
    setError(null);
    setPreview(null);

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

  const sectionByLabel = new Map(
    (preview?.sections ?? [])
      .filter((s) => s && typeof s.label === "string")
      .map((s) => [s.label.trim().toLowerCase(), s]),
  );

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

          {preview.instructions && (
            <Card variant="default">
              <p className="text-caption font-semibold text-text-secondary">Instructions</p>
              <p className="text-body text-text-primary whitespace-pre-wrap mt-1">
                {preview.instructions}
              </p>
            </Card>
          )}

          {preview.questions.length === 0 ? (
            <p className="text-body text-text-secondary">
              No questions on this paper yet. Add questions first.
            </p>
          ) : (
            <>
              {preview.questions.map((q, i) => {
                const label = q.section?.trim() || null;
                const section = label
                  ? {
                      label,
                      instruction: sectionByLabel.get(label.toLowerCase())?.instruction ?? null,
                    }
                  : null;
                return (
                  <QuestionCard
                    key={`${q.question_id}-${i}`}
                    questionText={q.question_text}
                    questionType={cardType(q.question_type)}
                    marks={q.marks}
                    section={section}
                    mediaUrl={q.media_url}
                    options={q.options}
                    position={`Question ${i + 1} of ${preview.questions.length}`}
                    readOnly
                  />
                );
              })}

              <p className="text-caption text-text-secondary">
                Students see exactly this. Correct answers and marking guidance are teacher-only
                and are not shown.
              </p>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
