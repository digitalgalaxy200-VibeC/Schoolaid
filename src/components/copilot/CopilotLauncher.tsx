"use client";

import { Button } from "@/components/ui";

interface CopilotLauncherProps {
  onClick: () => void;
  hasUnread?: boolean;
}

export function CopilotLauncher({ onClick, hasUnread }: CopilotLauncherProps) {
  return (
    <button
      onClick={onClick}
      className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-primary text-text-inverse shadow-lg hover:bg-primary-dark hover:shadow-xl transition-all duration-200 flex items-center justify-center cursor-pointer active:scale-95 group"
      aria-label="Open AI Copilot"
    >
      {/* Sparkle icon */}
      <svg
        className="w-6 h-6 group-hover:scale-110 transition-transform"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z"
        />
      </svg>

      {hasUnread && (
        <span className="absolute -top-1 -right-1 w-3 h-3 bg-error rounded-full border-2 border-surface" />
      )}
    </button>
  );
}
