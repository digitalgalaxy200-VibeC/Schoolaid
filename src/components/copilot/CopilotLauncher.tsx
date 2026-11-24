"use client";

/**
 * The launcher for Gwin, the super-admin AI copilot.
 *
 * Previously a bare circle with an unlabelled glyph: nothing on screen said what
 * it opened, and on a phone it sat on top of the bottom navigation. It is now a
 * pill with a written label, and it clears the mobile tab bar.
 */
export function CopilotLauncher({
  onClick,
  hasUnread,
}: {
  onClick: () => void;
  hasUnread?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      aria-label="Open Gwin, the AI copilot"
      className="fixed right-4 bottom-24 z-50 flex h-12 items-center gap-2 rounded-full bg-primary px-4 text-text-inverse shadow-lg transition-all duration-200 hover:bg-primary-dark hover:shadow-xl active:scale-95 tablet:right-6 tablet:bottom-6"
    >
      <svg
        className="h-5 w-5 shrink-0"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z"
        />
      </svg>
      <span className="text-label-md font-semibold">Ask Gwin</span>

      {hasUnread && (
        <span
          className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-surface bg-error"
          aria-hidden="true"
        />
      )}
    </button>
  );
}
