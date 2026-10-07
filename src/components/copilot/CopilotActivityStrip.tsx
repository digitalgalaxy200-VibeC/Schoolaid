"use client";

import { useEffect, useState } from "react";
import { activityLabel, formatElapsed, type ChatActivity } from "@/lib/copilot/chat-status";

interface CopilotActivityProps {
  activity: ChatActivity;
  onStop: () => void;
}

/**
 * The line that says what Gwin is doing, for how long — and lets you end it.
 *
 * It sits OUTSIDE the scrolling message list on purpose: a "thinking" bubble
 * scrolls out of view exactly when a long reply makes you want to check whether
 * anything is still happening. This one cannot scroll away, which is also what
 * makes it a dependable home for the Stop button.
 *
 * The clock ticks once a second in its own component so that a reply taking two
 * minutes does not re-render the whole panel two minutes' worth of times.
 */
export function CopilotActivityStrip({ activity, onStop }: CopilotActivityProps) {
  const live = activity.phase !== "stopped";
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [live]);

  const elapsed = formatElapsed((activity.endedAt ?? now) - activity.startedAt);

  return (
    <div
      className={`px-4 py-2 border-b border-border shrink-0 flex items-center gap-2 ${
        live ? "bg-primary-light" : "bg-bg"
      }`}
    >
      {live ? (
        <div className="animate-spin h-3 w-3 border-2 border-primary border-t-transparent rounded-full shrink-0" />
      ) : (
        <svg className="w-3 h-3 text-text-muted shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <rect x="6" y="6" width="12" height="12" rx="2" />
        </svg>
      )}

      <p className="text-caption text-text-primary min-w-0 truncate" title={activityLabel(activity)}>
        {activityLabel(activity)}
      </p>
      <span className="text-caption text-text-muted tabular-nums shrink-0">{elapsed}</span>

      {live && (
        <button
          onClick={onStop}
          className="ml-auto shrink-0 px-2.5 py-1 rounded-sm text-caption font-semibold text-error border border-error hover:bg-error-bg transition-colors cursor-pointer"
          title="Stop Gwin from continuing this reply"
        >
          Stop
        </button>
      )}
    </div>
  );
}
