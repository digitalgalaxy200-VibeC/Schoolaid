"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { CopilotChat } from "./CopilotChat";
import { CopilotInput } from "./CopilotInput";
import { ProgressTracker } from "./ProgressTracker";
import { OperationReport } from "./OperationReport";
import { ConversationList } from "./ConversationList";
import type {
  CopilotMessage as CopilotMessageType,
  ExecutionPlan,
  CopilotOperation,
  CopilotConversation,
  OperationStep,
} from "@/lib/copilot/types";

interface SchoolOption { id: string; name: string; slug: string; }

interface CopilotPanelProps {
  schoolId: string;
  schoolName: string;
  isOpen: boolean;
  onClose: () => void;
}

type ExecutionState =
  | { phase: "idle" }
  | { phase: "plan_pending"; plan: ExecutionPlan; messageId: string }
  | { phase: "executing"; operation: CopilotOperation; steps: OperationStep[] }
  | { phase: "completed"; operation: CopilotOperation; steps: OperationStep[]; summary: string };

export function CopilotPanel({ schoolId: initialSchoolId, schoolName: initialSchoolName, isOpen, onClose }: CopilotPanelProps) {
  const [messages, setMessages] = useState<CopilotMessageType[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"read_only" | "operations">("read_only");
  const [execution, setExecution] = useState<ExecutionState>({ phase: "idle" });
  const [streamingContent, setStreamingContent] = useState<string>("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [rollingBack, setRollingBack] = useState(false);
  const initialized = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const selectedSchoolRef = useRef(initialSchoolId);

  const [schools, setSchools] = useState<SchoolOption[]>([]);
  const [selectedSchoolId, setSelectedSchoolId] = useState(initialSchoolId);
  const [selectedSchoolName, setSelectedSchoolName] = useState(initialSchoolName);
  const [loadingSchools, setLoadingSchools] = useState(false);

  const isSuperAdminLevel = !initialSchoolId || initialSchoolId === "";

  // Sync ref so callbacks always have latest value
  useEffect(() => { selectedSchoolRef.current = selectedSchoolId; }, [selectedSchoolId]);

  // Fetch schools list
  useEffect(() => {
    if (isOpen) {
      setLoadingSchools(true);
      fetch("/api/super-admin/schools?archived=false")
        .then((r) => r.json())
        .then((data) => {
          if (Array.isArray(data)) setSchools(data.map((s: any) => ({ id: s.id, name: s.name, slug: s.slug })));
        })
        .catch(() => {})
        .finally(() => setLoadingSchools(false));
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && !initialized.current) {
      setMessages([]); setConversationId(null); setError(null);
      setExecution({ phase: "idle" }); setStreamingContent(""); setIsStreaming(false);
      initialized.current = true;
    }
    if (!isOpen) initialized.current = false;
  }, [isOpen, initialSchoolId]);

  useEffect(() => {
    if (initialSchoolId) { setSelectedSchoolId(initialSchoolId); setSelectedSchoolName(initialSchoolName); }
  }, [initialSchoolId, initialSchoolName]);

  const loadConversation = useCallback(async (conv: CopilotConversation) => {
    setConversationId(conv.id); setExecution({ phase: "idle" }); setError(null);
    setStreamingContent(""); setIsStreaming(false);
    const sid = selectedSchoolRef.current || initialSchoolId || "";
    try {
      const res = await fetch(`/api/super-admin/copilot/history?conversationId=${conv.id}&schoolId=${sid}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setMessages(data);
        const pendingMsg = data.find((m: CopilotMessageType) => m.has_plan && m.plan_status === "pending");
        if (pendingMsg?.plan_summary) setExecution({ phase: "plan_pending", plan: pendingMsg.plan_summary, messageId: pendingMsg.id });
      }
    } catch { setMessages([]); }
  }, [initialSchoolId]);

  const handleSelectSchool = (school: SchoolOption) => {
    if (school.id !== selectedSchoolId) {
      setSelectedSchoolId(school.id); setSelectedSchoolName(school.name);
      setMessages([]); setConversationId(null); setExecution({ phase: "idle" }); setStreamingContent("");
    }
  };

  const handleNewConversation = () => {
    setMessages([]); setConversationId(null); setError(null);
    setExecution({ phase: "idle" }); setStreamingContent("");
  };

  const activeSchoolId = initialSchoolId || selectedSchoolId;
  const activeSchoolName = initialSchoolName || selectedSchoolName;

  const sendMessage = useCallback(async (text: string) => {
    if (isStreaming) return;
    const sid = selectedSchoolRef.current || initialSchoolId || "";
    setIsStreaming(true); setLoading(true); setError(null); setExecution({ phase: "idle" }); setStreamingContent("");

    const tempUserMsg: CopilotMessageType = { id: `temp-${Date.now()}`, conversation_id: conversationId || "", role: "user", content: text, has_plan: false, plan_status: null, plan_summary: null, created_at: new Date().toISOString() };
    const tempAssistantMsg: CopilotMessageType = { id: `streaming-${Date.now()}`, conversation_id: conversationId || "", role: "assistant", content: "", has_plan: false, plan_status: null, plan_summary: null, created_at: new Date().toISOString() };
    setMessages((prev) => [...prev, tempUserMsg, tempAssistantMsg]);

    const controller = new AbortController(); abortRef.current = controller;

    try {
      const res = await fetch("/api/super-admin/copilot/stream", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schoolId: sid, conversationId, message: text, mode }), signal: controller.signal,
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({ error: "Stream failed" }))).error);
      const reader = res.body?.getReader(); if (!reader) throw new Error("No response stream");
      const decoder = new TextDecoder(); let buffer = "", fullContent = "", resolvedCid = conversationId;

      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        buffer += decoder.decode(value, { stream: true }); const lines = buffer.split("\n"); buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.trim().startsWith("data: ")) continue;
          const d = JSON.parse(line.trim().slice(6));
          if (d.type === "meta") { resolvedCid = d.conversationId; setConversationId(d.conversationId); }
          else if (d.type === "chunk") { fullContent += d.content; setStreamingContent(fullContent); setMessages((prev) => prev.map((m) => m.id === tempAssistantMsg.id ? { ...m, content: fullContent } : m)); }
          else if (d.type === "plan") { setExecution({ phase: "plan_pending", plan: d.plan, messageId: tempAssistantMsg.id }); setMessages((prev) => prev.map((m) => m.id === tempAssistantMsg.id ? { ...m, has_plan: true, plan_status: "pending", plan_summary: d.plan } : m)); }
          else if (d.type === "done") { setMessages((prev) => prev.map((m) => m.id === tempAssistantMsg.id ? { ...m, id: d.messageId || m.id } : m)); }
          else if (d.type === "error") throw new Error(d.error);
        }
      }
    } catch (err: any) {
      if (err.name !== "AbortError") { setError(err.message); setMessages((prev) => prev.filter((m) => m.id !== tempUserMsg.id && m.id !== tempAssistantMsg.id)); }
    } finally { setLoading(false); setIsStreaming(false); setStreamingContent(""); abortRef.current = null; }
  }, [conversationId, mode, isStreaming, initialSchoolId]);

  const handleApprove = useCallback(async () => {
    if (execution.phase !== "plan_pending") return;
    const sid = selectedSchoolRef.current || initialSchoolId || "";
    setError(null);
    setExecution({ phase: "executing", operation: {} as CopilotOperation, steps: execution.plan.steps.map((s, i) => ({
      id: `opt-${i}`, operation_id: "", step_order: s.order, capability: s.capability, description: s.description,
      input_params: s.params as Record<string, unknown>, api_endpoint: null, api_method: null, response_data: null,
      status: "pending", error_message: null, rollback_info: null, started_at: null, completed_at: null, created_at: new Date().toISOString(),
    })) });
    try {
      const res = await fetch("/api/super-admin/copilot/execute", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schoolId: sid, conversationId, messageId: execution.messageId, plan: execution.plan }),
      });
      const data = await res.json(); if (!res.ok) throw new Error(data.error || "Execution failed");
      setMessages((prev) => prev.map((m) => m.id === execution.messageId ? { ...m, plan_status: data.operation.status === "completed" ? "completed" : "failed" } : m));
      setExecution({ phase: "completed", operation: data.operation, steps: data.steps, summary: data.summary });
    } catch (err: any) { setError(err.message); setMessages((prev) => prev.map((m) => m.id === execution.messageId ? { ...m, plan_status: "failed" } : m)); setExecution({ phase: "idle" }); }
  }, [execution, conversationId, initialSchoolId]);

  const handleCancel = useCallback(async () => {
    if (execution.phase !== "plan_pending") return;
    const sid = selectedSchoolRef.current || initialSchoolId || "";
    try { await fetch("/api/super-admin/copilot/cancel", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ schoolId: sid, messageId: execution.messageId }) }); } catch {}
    setMessages((prev) => prev.map((m) => m.id === execution.messageId ? { ...m, plan_status: "cancelled" } : m));
    setExecution({ phase: "idle" });
  }, [execution, initialSchoolId]);

  const handleRollback = useCallback(async () => {
    if (execution.phase !== "completed" || !execution.operation.id) return;
    const sid = selectedSchoolRef.current || initialSchoolId || "";
    setRollingBack(true); setError(null);
    try {
      const res = await fetch("/api/super-admin/copilot/rollback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ schoolId: sid, operationId: execution.operation.id }) });
      const data = await res.json(); if (!res.ok) throw new Error(data.error || "Rollback failed");
      setExecution({ phase: "completed", operation: data.operation, steps: data.steps, summary: data.summary });
    } catch (err: any) { setError(err.message); }
    finally { setRollingBack(false); }
  }, [execution, initialSchoolId]);

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20 transition-opacity" onClick={onClose} />
      <div className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-lg bg-bg shadow-2xl flex flex-row border-l border-border animate-slide-in-right">
        {activeSchoolId && <ConversationList schoolId={activeSchoolId} activeId={conversationId} onSelect={loadConversation} onNew={handleNewConversation} />}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-surface shrink-0">
            <div>
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
                </svg>
                <h2 className="text-body font-bold text-text-primary">Gwin</h2>
              </div>
              <p className="text-caption text-text-muted mt-0.5">{activeSchoolName || "All Schools"}</p>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-sm flex items-center justify-center text-text-secondary hover:bg-bg transition-colors cursor-pointer" aria-label="Close">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>

          {/* School context bar + compact picker for super-admin level */}
          <div className="px-4 py-2 border-b border-border bg-bg flex items-center gap-2 shrink-0">
            <span className="text-caption text-text-muted shrink-0">School:</span>
            {activeSchoolId ? (
              <span className="text-caption font-semibold text-primary">{activeSchoolName}</span>
            ) : (
              <span className="text-caption font-semibold text-text-primary">All Schools (Super Admin)</span>
            )}
          </div>
          {!activeSchoolId && schools.length > 0 && (
            <div className="px-3 py-1.5 border-b border-border bg-bg flex items-center gap-1 overflow-x-auto shrink-0">
              {loadingSchools && <div className="animate-spin h-3 w-3 border-2 border-primary border-t-transparent rounded-full shrink-0" />}
              {schools.slice(0, 8).map((s) => (
                <button key={s.id} onClick={() => handleSelectSchool(s)}
                  className={`shrink-0 px-2 py-0.5 rounded-sm text-[11px] font-medium transition-colors cursor-pointer border whitespace-nowrap ${s.id === selectedSchoolId ? "bg-primary text-text-inverse border-primary" : "text-text-secondary border-border hover:bg-primary-light hover:text-primary"}`}>
                  {s.name}
                </button>
              ))}
              {schools.length > 8 && <span className="text-[10px] text-text-muted shrink-0">+{schools.length - 8} more</span>}
            </div>
          )}

          {/* Mode Toggle */}
          <div className="px-4 py-2 border-b border-border bg-bg flex items-center gap-2 shrink-0">
            <button onClick={() => setMode("read_only")} className={`px-3 py-1 rounded-sm text-caption font-semibold transition-colors cursor-pointer ${mode === "read_only" ? "bg-primary text-text-inverse" : "bg-surface text-text-secondary border border-border hover:bg-border"}`}>Read-Only</button>
            <button onClick={() => setMode("operations")} className={`px-3 py-1 rounded-sm text-caption font-semibold transition-colors cursor-pointer ${mode === "operations" ? "bg-primary text-text-inverse" : "bg-surface text-text-secondary border border-border hover:bg-border"}`}>Operations</button>
            <span className="text-caption text-text-muted ml-auto">{mode === "read_only" ? "Analysis only" : "Plan & execute"}</span>
          </div>

          {error && <div className="px-4 py-2 bg-error-bg border-b border-error shrink-0"><p className="text-caption text-error font-medium">{error}</p></div>}

          {execution.phase === "executing" && <div className="px-4 py-3 border-b border-border shrink-0"><ProgressTracker steps={execution.steps} totalSteps={execution.operation.total_steps || execution.steps.length} /></div>}

          {execution.phase === "completed" && (
            <div className="px-4 py-3 border-b border-border shrink-0 space-y-2">
              <OperationReport operation={execution.operation} steps={execution.steps} summary={execution.summary} />
              {execution.operation.status === "completed" && execution.operation.id && (
                <button onClick={handleRollback} disabled={rollingBack} className="w-full px-4 py-2 rounded-sm text-caption font-semibold text-warning border border-warning hover:bg-warning-bg transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2">
                  {rollingBack ? <><div className="animate-spin h-3 w-3 border-2 border-warning border-t-transparent rounded-full" />Rolling back...</> : <><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" /></svg>Undo All Operations</>}
                </button>
              )}
            </div>
          )}

          <CopilotChat messages={messages} loading={loading} />

          {execution.phase === "plan_pending" ? (
            <div className="border-t border-border p-4 bg-surface flex gap-2 justify-end">
              <button onClick={handleCancel} className="px-4 py-2 rounded-sm text-small font-semibold text-text-secondary hover:bg-bg transition-colors cursor-pointer border border-border">Cancel Plan</button>
              <button onClick={handleApprove} className="px-4 py-2 rounded-sm text-small font-semibold bg-primary text-text-inverse hover:bg-primary-dark transition-colors cursor-pointer">Approve & Execute</button>
            </div>
          ) : (
            <CopilotInput onSend={sendMessage} disabled={loading || execution.phase === "executing" || isStreaming} />
          )}
        </div>
      </div>
      <style jsx>{`@keyframes slideInRight{from{transform:translateX(100%)}to{transform:translateX(0)}}.animate-slide-in-right{animation:slideInRight .25s ease-out}`}</style>
    </>
  );
}
