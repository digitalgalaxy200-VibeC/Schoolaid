"use client";

import type { CopilotMessage as CopilotMessageType } from "@/lib/copilot/types";
import { ExecutionPlan } from "./ExecutionPlan";

interface CopilotMessageProps {
  message: CopilotMessageType;
}

function formatContent(content: string): string {
  // Remove the JSON plan block from displayed content — it's shown separately
  return content.replace(/```json[\s\S]*?```/g, "").trim();
}

export function CopilotMessageBubble({ message }: CopilotMessageProps) {
  const isUser = message.role === "user";
  const displayContent = isUser ? message.content : formatContent(message.content);

  return (
    <div className={`flex items-start gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
      {/* Avatar */}
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
          isUser ? "bg-primary text-text-inverse" : "bg-primary-light text-primary"
        }`}
      >
        {isUser ? (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
          </svg>
        ) : (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
          </svg>
        )}
      </div>

      {/* Bubble */}
      <div className="flex flex-col gap-2 max-w-[80%]">
        <div
          className={`px-4 py-3 rounded-sm text-small whitespace-pre-wrap wrap-break-word ${
            isUser
              ? "bg-primary text-text-inverse rounded-tr-none"
              : "bg-surface border border-border rounded-tl-none text-text-primary"
          }`}
        >
          {displayContent}
        </div>

        {/* Execution Plan (if present) */}
        {message.has_plan && message.plan_summary && (
          <ExecutionPlan
            plan={message.plan_summary}
            status={message.plan_status || "pending"}
          />
        )}

        {/* Timestamp */}
        <span className={`text-caption text-text-muted ${isUser ? "text-right" : ""}`}>
          {new Date(message.created_at).toLocaleDateString([], { month: "short", day: "numeric" })}{" "}
          {new Date(message.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>
    </div>
  );
}
