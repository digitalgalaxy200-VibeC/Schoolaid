"use client";

import { useEffect, useRef, useState } from "react";
import type { CopilotMessage as CopilotMessageType } from "@/lib/copilot/types";
import { formatMessageBlocks, type MessageBlock } from "@/lib/copilot/message-format";
import { ExecutionPlan } from "./ExecutionPlan";
import { formatDate, formatTime } from "@/lib/dates";

interface CopilotMessageProps {
  message: CopilotMessageType;
}

/**
 * The small set of inline marks a reply actually uses. Italics require a
 * non-space right after the opening `*`, so arithmetic like "₦30,000 * 2 * 3"
 * stays arithmetic instead of turning half the line italic.
 */
const INLINE = /(\*\*[^*\n]+\*\*|`[^`\n]+`|\*\S[^*\n]*\*)/g;

function renderInline(text: string, keyPrefix: string) {
  return text
    .split(INLINE)
    .filter((part) => part !== "")
    .map((part, index) => {
      const key = `${keyPrefix}-${index}`;
      if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
        return (
          <strong key={key} className="font-semibold">
            {part.slice(2, -2)}
          </strong>
        );
      }
      if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
        return (
          <code key={key} className="px-1 py-0.5 rounded-sm bg-bg text-[0.9em]">
            {part.slice(1, -1)}
          </code>
        );
      }
      if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
        return <em key={key}>{part.slice(1, -1)}</em>;
      }
      return <span key={key}>{part}</span>;
    });
}

function Block({ block, index }: { block: MessageBlock; index: number }) {
  const key = `b${index}`;

  switch (block.type) {
    case "heading":
      return (
        <p
          key={key}
          className={
            block.level === 1
              ? "font-semibold text-text-primary"
              : "font-semibold text-text-primary opacity-90"
          }
        >
          {renderInline(block.text, key)}
        </p>
      );
    case "list":
      return block.ordered ? (
        <ol key={key} className="list-decimal pl-5 space-y-1">
          {block.items.map((item, i) => (
            <li key={`${key}-${i}`} className="leading-relaxed">
              {renderInline(item, `${key}-${i}`)}
            </li>
          ))}
        </ol>
      ) : (
        <ul key={key} className="list-disc pl-5 space-y-1">
          {block.items.map((item, i) => (
            <li key={`${key}-${i}`} className="leading-relaxed">
              {renderInline(item, `${key}-${i}`)}
            </li>
          ))}
        </ul>
      );
    case "table":
      return (
        <div key={key} className="overflow-x-auto">
          <table className="w-full text-caption border-collapse">
            <thead>
              <tr>
                {block.headers.map((header, i) => (
                  <th
                    key={`${key}-h${i}`}
                    className="text-left font-semibold px-2 py-1 border-b border-border whitespace-nowrap"
                  >
                    {renderInline(header, `${key}-h${i}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, r) => (
                <tr key={`${key}-r${r}`}>
                  {row.map((cell, c) => (
                    <td
                      key={`${key}-r${r}c${c}`}
                      className="px-2 py-1 border-b border-border/60 align-top"
                    >
                      {renderInline(cell, `${key}-r${r}c${c}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "code":
      return (
        <pre
          key={key}
          className="bg-bg border border-border rounded-sm p-2 overflow-x-auto text-caption"
        >
          <code>{block.text}</code>
        </pre>
      );
    case "divider":
      return <hr key={key} className="border-border" />;
    default:
      return (
        <p key={key} className="leading-relaxed">
          {renderInline(block.text, key)}
        </p>
      );
  }
}

/**
 * Copies the reply. `navigator.clipboard` needs a secure context and permission,
 * so if it is unavailable the text is put on the clipboard the older way rather
 * than leaving the button doing nothing.
 */
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const fallbackCopy = (value: string): boolean => {
    try {
      const area = document.createElement("textarea");
      area.value = value;
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(area);
      return ok;
    } catch {
      return false;
    }
  };

  const handleCopy = async () => {
    let ok = false;
    try {
      await navigator.clipboard.writeText(text);
      ok = true;
    } catch {
      ok = fallbackCopy(text);
    }
    setCopied(ok);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={() => void handleCopy()}
      className="flex items-center gap-1 text-caption text-text-muted hover:text-primary transition-colors cursor-pointer"
      title="Copy this reply"
    >
      {copied ? (
        <>
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
          Copied
        </>
      ) : (
        <>
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75"
            />
          </svg>
          Copy
        </>
      )}
    </button>
  );
}

export function CopilotMessageBubble({ message }: CopilotMessageProps) {
  const isUser = message.role === "user";
  const blocks = isUser ? [] : formatMessageBlocks(message.content);
  const hasText = isUser ? message.content.trim().length > 0 : blocks.length > 0;

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
        {/* A reply that was only a plan has no prose — the plan card is the message. */}
        {(hasText || !message.has_plan) && (
          <div
            className={`px-4 py-3 rounded-sm text-small wrap-break-word ${
              isUser
                ? "bg-primary text-text-inverse rounded-tr-none whitespace-pre-wrap"
                : "bg-surface border border-border rounded-tl-none text-text-primary"
            }`}
          >
            {isUser ? (
              message.content
            ) : (
              <div className="space-y-2">
                {blocks.map((block, index) => (
                  <Block key={index} block={block} index={index} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Execution Plan (if present) */}
        {message.has_plan && message.plan_summary && (
          <ExecutionPlan
            plan={message.plan_summary}
            status={message.plan_status || "pending"}
          />
        )}

        {/* Timestamp, and Copy for the assistant's replies */}
        <span
          className={`flex items-center gap-3 text-caption text-text-muted ${
            isUser ? "justify-end" : ""
          }`}
        >
          {!isUser && hasText && <CopyButton text={message.content.replace(/```json[\s\S]*?```/g, "").trim()} />}
          <span>
            {formatDate(message.created_at)} {formatTime(message.created_at)}
          </span>
        </span>
      </div>
    </div>
  );
}
