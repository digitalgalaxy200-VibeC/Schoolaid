"use client";

import { Card, Badge } from "@/components/ui";

/**
 * The paper's question card — ONE component, used by the student attempt screen
 * and by every teacher preview.
 *
 * The preview must be the student experience, not an approximation of it: if
 * this markup lived twice, the two copies would drift and a teacher would one
 * day approve a layout the student never sees. Keeping it here means the only
 * difference between "preview" and "taking the test" is which props are wired:
 * previews pass `readOnly` and no handlers, so nothing can be answered and
 * nothing is saved.
 */

export type QuestionCardOption = {
  /** Stable identity: the option uuid in an attempt, a synthetic key in previews. */
  id: string;
  /** Display bullet/letter (A, B, •). Null renders the neutral bullet. */
  label: string | null;
  text: string;
};

export type QuestionCardProps = {
  questionText: string;
  questionType: "mcq" | "true_false" | "theory";
  marks: number;
  /** The section this question sits in, with its instruction. */
  section?: { label: string; instruction?: string | null } | null;
  mediaUrl?: string | null;
  options: QuestionCardOption[];
  selectedOptionId?: string | null;
  answerText?: string;
  /** Student screen after the deadline: controls are inert and visibly so. */
  disabled?: boolean;
  /** Preview: interactive-looking but with nothing wired — no answering, no saving. */
  readOnly?: boolean;
  onSelectOption?: (optionId: string) => void;
  onAnswerTextChange?: (text: string) => void;
  onAnswerTextBlur?: () => void;
  /** e.g. "Question 4 of 20". Omitted in a single-question preview. */
  position?: string | null;
};

export function QuestionCard({
  questionText,
  questionType,
  marks,
  section = null,
  mediaUrl = null,
  options,
  selectedOptionId = null,
  answerText = "",
  disabled = false,
  readOnly = false,
  onSelectOption,
  onAnswerTextChange,
  onAnswerTextBlur,
  position = null,
}: QuestionCardProps) {
  return (
    <Card variant="default" className="space-y-4">
      {section && (
        <div className="rounded-lg border border-border bg-clay px-3 py-2 space-y-1">
          <p className="text-body font-semibold text-text-primary">{section.label}</p>
          {section.instruction && (
            <p className="text-caption text-text-secondary whitespace-pre-wrap">
              {section.instruction}
            </p>
          )}
        </div>
      )}

      <div className={`flex items-start gap-3 ${position ? "justify-between" : "justify-end"}`}>
        {position && <p className="text-caption text-text-secondary">{position}</p>}
        <Badge variant="default">{marks} mark(s)</Badge>
      </div>

      <p className="text-body-lg text-text-primary whitespace-pre-wrap">{questionText}</p>

      {mediaUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={mediaUrl}
          alt=""
          className="w-full max-h-[50vh] object-contain rounded-lg border border-border bg-surface"
        />
      )}

      {questionType === "theory" ? (
        <>
          <textarea
            rows={8}
            value={answerText}
            disabled={disabled}
            readOnly={readOnly}
            onChange={
              onAnswerTextChange ? (e) => onAnswerTextChange(e.target.value) : undefined
            }
            // Saved on blur rather than on every keystroke: a request per
            // character would be noise, and blur is a natural pause.
            onBlur={onAnswerTextBlur ? () => onAnswerTextBlur() : undefined}
            placeholder="Write your answer here."
            className="w-full px-3 py-2.5 border border-border rounded-lg text-body bg-surface resize-y focus:outline-none focus:border-primary transition-colors disabled:opacity-60"
          />
          {onAnswerTextBlur && (
            <p className="text-caption text-text-secondary">
              Your answer is saved when you leave the box.
            </p>
          )}
        </>
      ) : (
        <div className="space-y-2">
          {options.map((o) => {
            const chosen = selectedOptionId === o.id;
            return (
              <button
                key={o.id}
                type="button"
                disabled={disabled}
                onClick={onSelectOption ? () => onSelectOption(o.id) : undefined}
                className={`w-full text-left flex items-center gap-3 rounded-lg border px-3 py-3 transition-colors disabled:opacity-60 ${
                  chosen
                    ? "border-primary bg-primary-light"
                    : "border-border bg-surface hover:bg-clay"
                }`}
              >
                <span
                  className={`w-6 h-6 shrink-0 rounded-full border flex items-center justify-center text-caption font-semibold ${
                    chosen
                      ? "border-primary bg-primary text-text-inverse"
                      : "border-border-strong text-text-secondary"
                  }`}
                >
                  {o.label ?? "•"}
                </span>
                <span className="text-body text-text-primary">{o.text}</span>
              </button>
            );
          })}
        </div>
      )}
    </Card>
  );
}
