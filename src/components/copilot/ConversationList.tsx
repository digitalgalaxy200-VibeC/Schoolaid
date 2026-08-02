"use client";

import { useState, useEffect } from "react";
import type { CopilotConversation } from "@/lib/copilot/types";

interface ConversationListProps {
  schoolId: string;
  activeId: string | null;
  onSelect: (conversation: CopilotConversation) => void;
  onNew: () => void;
}

export function ConversationList({ schoolId, activeId, onSelect, onNew }: ConversationListProps) {
  const [conversation, setConversation] = useState<CopilotConversation | null>(null);
  const [loading, setLoading] = useState(false);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (show && schoolId) {
      setLoading(true);
      fetch(`/api/super-admin/copilot/conversations?schoolId=${schoolId}`)
        .then((r) => r.json())
        .then((data) => {
          const list = Array.isArray(data) ? data : [];
          // Use the most recent conversation for this school
          if (list.length > 0) setConversation(list[0]);
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [show, schoolId]);

  if (!show) {
    return (
      <button
        onClick={() => setShow(true)}
        className="px-3 py-2 text-caption text-text-secondary hover:text-primary transition-colors cursor-pointer flex items-center gap-1.5 shrink-0 border-r border-border"
        title="Chat history"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12" />
        </svg>
        History
      </button>
    );
  }

  return (
    <div className="w-56 shrink-0 border-r border-border bg-surface flex flex-col max-h-full">
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
        <span className="text-caption font-semibold text-text-primary">History</span>
        <div className="flex items-center gap-1">
          <button onClick={onNew} className="w-6 h-6 rounded-sm flex items-center justify-center text-text-secondary hover:bg-bg transition-colors cursor-pointer" title="Clear chat">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
          </button>
          <button onClick={() => setShow(false)} className="w-6 h-6 rounded-sm flex items-center justify-center text-text-secondary hover:bg-bg transition-colors cursor-pointer" title="Close">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {loading ? (
          <div className="flex justify-center py-4"><div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" /></div>
        ) : conversation ? (
          <button
            onClick={() => onSelect(conversation)}
            className={`w-full text-left px-3 py-2 rounded-sm text-caption transition-colors cursor-pointer ${conversation.id === activeId ? "bg-primary-light text-primary font-medium" : "text-text-secondary hover:bg-bg"}`}
          >
            <p className="truncate">{conversation.title || "Chat"}</p>
            <p className="text-[10px] text-text-muted mt-0.5">{new Date(conversation.updated_at || conversation.created_at).toLocaleDateString()}</p>
          </button>
        ) : (
          <p className="text-caption text-text-muted text-center py-4">No history yet.</p>
        )}
      </div>
    </div>
  );
}
