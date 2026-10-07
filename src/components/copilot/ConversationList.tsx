"use client";

import { useCallback, useEffect, useState } from "react";
import type { CopilotConversation } from "@/lib/copilot/types";
import { formatDate } from "@/lib/dates";

const PAGE_SIZE = 20;

interface ConversationListProps {
  schoolId: string;
  activeId: string | null;
  onSelect: (conversation: CopilotConversation) => void;
  onNew: () => void;
}

/**
 * The History rail. Pages through the chat list and deletes single chats.
 *
 * Newest activity first — which is also the conversation the panel restores
 * when you reopen it, so "continue where I left off" and "the top of the list"
 * are deliberately the same thing. Deleting a chat that approved operations is
 * refused by the API (it is the audit record), and the footer says so.
 */
export function ConversationList({ schoolId, activeId, onSelect, onNew }: ConversationListProps) {
  const [show, setShow] = useState(false);
  const [conversations, setConversations] = useState<CopilotConversation[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [retentionHours, setRetentionHours] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(
    async (offset: number) => {
      if (!schoolId) return;
      if (offset === 0) setLoading(true);
      else setLoadingMore(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/super-admin/copilot/conversations?schoolId=${schoolId}&limit=${PAGE_SIZE}&offset=${offset}`,
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `Could not load history (HTTP ${res.status}).`);
        const batch: CopilotConversation[] = Array.isArray(data.conversations) ? data.conversations : [];
        setConversations((prev) => (offset === 0 ? batch : [...prev, ...batch]));
        setHasMore(!!data.hasMore);
        if (typeof data.retentionHours === "number") setRetentionHours(data.retentionHours);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load history.");
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [schoolId],
  );

  useEffect(() => {
    if (!show || !schoolId) return;
    // Deferred so the reset and the fetch kick off after render — the repo's
    // pattern for effects that load.
    void Promise.resolve().then(() => {
      setConversations([]);
      setHasMore(false);
      return load(0);
    });
  }, [show, schoolId, load]);

  const handleDelete = async (conversation: CopilotConversation) => {
    const title = conversation.title || "this chat";
    if (!window.confirm(`Delete "${title}"? Its messages are removed, and this cannot be undone.`)) {
      return;
    }
    setDeletingId(conversation.id);
    setError(null);
    try {
      const res = await fetch("/api/super-admin/copilot/conversations", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: conversation.id, schoolId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Could not delete the chat (HTTP ${res.status}).`);
      setConversations((prev) => prev.filter((c) => c.id !== conversation.id));
      if (conversation.id === activeId) onNew();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete the chat.");
    } finally {
      setDeletingId(null);
    }
  };

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
          <button onClick={onNew} className="w-6 h-6 rounded-sm flex items-center justify-center text-text-secondary hover:bg-bg transition-colors cursor-pointer" title="New chat">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
          </button>
          <button onClick={() => setShow(false)} className="w-6 h-6 rounded-sm flex items-center justify-center text-text-secondary hover:bg-bg transition-colors cursor-pointer" title="Close">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {loading ? (
          <div className="flex justify-center py-4"><div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" /></div>
        ) : conversations.length === 0 ? (
          <p className="text-caption text-text-muted text-center py-4">No history yet.</p>
        ) : (
          conversations.map((conversation) => (
            <div
              key={conversation.id}
              className={`flex items-center gap-1 rounded-sm ${conversation.id === activeId ? "bg-primary-light" : "hover:bg-bg"}`}
            >
              <button
                onClick={() => onSelect(conversation)}
                className={`flex-1 min-w-0 text-left px-3 py-2 rounded-sm text-caption transition-colors cursor-pointer ${
                  conversation.id === activeId ? "text-primary font-medium" : "text-text-secondary"
                }`}
              >
                <p className="truncate">{conversation.title || "Chat"}</p>
                <p className="text-[10px] text-text-muted mt-0.5">{formatDate(conversation.updated_at || conversation.created_at)}</p>
              </button>
              <button
                onClick={() => void handleDelete(conversation)}
                disabled={deletingId === conversation.id}
                title="Delete chat"
                className="w-6 h-6 mr-1 shrink-0 rounded-sm flex items-center justify-center text-text-muted hover:text-error hover:bg-bg transition-colors cursor-pointer disabled:opacity-50"
              >
                {deletingId === conversation.id ? (
                  <div className="animate-spin h-3 w-3 border-2 border-error border-t-transparent rounded-full" />
                ) : (
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                )}
              </button>
            </div>
          ))
        )}

        {error && <p className="text-[10px] text-error px-2 py-1">{error}</p>}

        {hasMore && !loading && (
          <button
            onClick={() => void load(conversations.length)}
            disabled={loadingMore}
            className="w-full px-3 py-2 rounded-sm text-caption text-primary hover:bg-bg transition-colors cursor-pointer disabled:opacity-50"
          >
            {loadingMore ? "Loading…" : "Load more"}
          </button>
        )}
      </div>

      {retentionHours !== null && (
        <p className="px-3 py-2 border-t border-border text-[10px] text-text-muted leading-snug">
          Plain chats are cleaned up after {retentionHours}h; chats with approved actions are kept as the record.
        </p>
      )}
    </div>
  );
}
