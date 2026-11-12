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
    tooltip: string;
    icon: string;
    ai: boolean;
    comingSoon?: boolean;
  }[] = [
    {
      choice: "manual",
      ai: false,
      title: "Type Manually",
      icon: "✍️",
      description: "Type questions and options directly into the system one by one.",
      tooltip:
        "Write questions directly with the question form. You can add as many manual questions as you want, and combine them with uploaded questions anytime.",
    },
    {
      choice: "pdf",
      ai: true,
      title: "Upload PDF / Document",
      icon: "📄",
      description: "Upload an existing PDF or Word test paper. AI will extract and organize the questions for your review.",
      tooltip:
        "Select a PDF file (e.g. from past exams or printed sheets). The AI reads each question, options, and answers, letting you review and append them to your paper.",
    },
    {
      choice: "photo",
      ai: true,
      comingSoon: true,
      title: "Snap a photo of the paper",
      icon: "📷",
      description:
        "Take a picture of a printed test paper. The AI reads it and turns it into questions — the quickest route from paper to a digital test.",
      tooltip:
        "Coming Soon: point your camera at a printed test sheet or a textbook page. The AI reads the text and builds the questions for you, which makes it the fastest way to get an existing paper in.",
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
          const isAIOff = o.ai && !aiEnabled && !o.comingSoon;
          const isDisabled = o.comingSoon || isAIOff;
          // An upload is an ACTION, not a choice of wording: dashed primary
          // border and a tinted panel so it reads as "put a file here", while
          // the manual option stays a plain button.
          const isUpload = o.ai && !o.comingSoon;

          const surface = isDisabled
            ? o.comingSoon
              ? "border border-dashed border-border bg-clay/60 cursor-not-allowed opacity-75"
              : "border border-border bg-clay opacity-60 cursor-not-allowed"
            : isUpload
              ? "border-2 border-dashed border-primary/60 bg-primary/5 hover:border-primary hover:bg-primary/10 shadow-xs hover:shadow-sm"
              : "border border-border bg-surface hover:border-primary/50 hover:bg-clay shadow-xs hover:shadow-sm";

          return (
            <div
              key={o.choice}
              className="group relative"
              title={o.tooltip}
            >
              <button
                type="button"
                disabled={isDisabled}
                onClick={() => {
                  if (!isDisabled) onChoose(o.choice);
                }}
                className={`w-full text-left rounded-lg p-3.5 min-h-[52px] transition-all relative ${surface}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <span className="text-xl shrink-0 mt-0.5 select-none">{o.icon}</span>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-body font-semibold text-text-primary">{o.title}</p>
                        {o.comingSoon && (
                          <span className="rounded-full bg-accent/10 text-accent font-medium text-[11px] px-2 py-0.5 border border-accent/20">
                            Coming Soon
                          </span>
                        )}
                        {!o.comingSoon && o.ai && (
                          <span className="rounded-full bg-primary/10 text-primary font-medium text-[11px] px-2 py-0.5">
                            AI Powered
                          </span>
                        )}
                      </div>
                      <p className="text-caption text-text-secondary mt-1 leading-relaxed">
                        {isAIOff ? "AI is not enabled for this school." : o.description}
                      </p>
                      {isUpload && !isDisabled && (
                        <>
                          <span className="mt-2 inline-flex items-center gap-1 text-caption font-semibold text-primary">
                            <span aria-hidden="true">↑</span> Click here to choose a file
                          </span>
                          <span className="mt-1 block text-caption text-text-secondary">
                            Uses AI credits. A document is charged once the AI processes it, and
                            that credit is not refunded if you discard the result.
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </button>

              {/* Rich hover tooltip */}
              <div className="pointer-events-none absolute left-2 right-2 bottom-full mb-1 z-30 hidden group-hover:block transition-opacity opacity-0 group-hover:opacity-100">
                <div className="bg-gray-900 text-white text-[11px] rounded-md px-3 py-1.5 shadow-lg max-w-sm">
                  {o.tooltip}
                </div>
              </div>
            </div>
          );
        })}

        {!aiEnabled && (
          <p className="text-caption text-text-secondary mt-2">
            💡 AI import is currently disabled for this school. A school admin can enable it in School Settings. Manual creation is always active.
          </p>
        )}
      </div>
    </Modal>
  );
}
