"use client";

import { Button, Modal } from "@/components/ui";

/**
 * The assessment builder's single entry point for adding questions.
 *
 * "Add Questions" opens this chooser — Upload PDF / Upload or Take Picture /
 * Create Manually — instead of dropping the teacher straight into a form. The
 * AI paths are shown disabled with an explanation when the school's AI is off,
 * so the upload options are visibly "off for now" rather than mysteriously
 * missing; manual creation always works.
 */

export type AddQuestionChoice = "pdf" | "photo" | "manual";

export function AddQuestionsModal({
  isOpen,
  onClose,
  aiEnabled,
  onChoose,
}: {
  isOpen: boolean;
  onClose: () => void;
  aiEnabled: boolean;
  onChoose: (choice: AddQuestionChoice) => void;
}) {
  const options: {
    choice: AddQuestionChoice;
    title: string;
    description: string;
    ai: boolean;
  }[] = [
    {
      choice: "pdf",
      ai: true,
      title: "Upload PDF",
      description: "The AI reads the paper and organises the questions for your review.",
    },
    {
      choice: "photo",
      ai: true,
      title: "Upload / Take Picture",
      description: "Photograph or upload an image of the paper; the AI organises it.",
    },
    {
      choice: "manual",
      ai: false,
      title: "Create Manually",
      description: "Type a question yourself — no AI involved.",
    },
  ];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Add Questions"
      size="md"
      footer={
        <Button variant="ghost" className="w-full tablet:w-auto" onClick={onClose}>
          Cancel
        </Button>
      }
    >
      <div className="space-y-3">
        {options.map((o) => {
          const disabled = o.ai && !aiEnabled;
          return (
            <button
              key={o.choice}
              type="button"
              disabled={disabled}
              onClick={() => onChoose(o.choice)}
              className={`w-full text-left rounded-lg border px-4 py-3 min-h-[44px] transition-colors ${
                disabled
                  ? "border-border bg-clay opacity-60 cursor-not-allowed"
                  : "border-border bg-surface hover:bg-clay active:bg-clay"
              }`}
            >
              <p className="text-body font-semibold text-text-primary">{o.title}</p>
              <p className="text-caption text-text-secondary mt-0.5">
                {disabled ? "AI is not enabled for this school." : o.description}
              </p>
            </button>
          );
        })}

        {!aiEnabled && (
          <p className="text-caption text-text-secondary">
            AI import is off for this school. A school admin can enable it; manual creation always
            works.
          </p>
        )}
      </div>
    </Modal>
  );
}
