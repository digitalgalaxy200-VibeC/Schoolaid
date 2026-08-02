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

interface CopilotPanelProps { schoolId: string; schoolName: string; isOpen: boolean; onClose: () => void; }

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
  const schoolRef = useRef({ id: initialSchoolId, name: initialSchoolName });

  const [schools, setSchools] = useState<SchoolOption[]>([]);
  const [selectedSchoolId, setSelectedSchoolId] = useState(initialSchoolId);
  const [selectedSchoolName, setSelectedSchoolName] = useState(initialSchoolName);
  const [loadingSchools, setLoadingSchools] = useState(false);

  useEffect(() => { schoolRef.current = { id: selectedSchoolId, name: selectedSchoolName }; }, [selectedSchoolId, selectedSchoolName]);

  useEffect(() => {
    if (isOpen) {
      setLoadingSchools(true);
      fetch("/api/super-admin/schools?archived=false")
        .then((r) => r.json()).then((data) => { if (Array.isArray(data)) setSchools(data.map((s: any) => ({ id: s.id, name: s.name, slug: s.slug }))); })
        .catch(() => {}).finally(() => setLoadingSchools(false));
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && !initialized.current) { setMessages([]); setConversationId(null); setError(null); setExecution({ phase: "idle" }); setStreamingContent(""); setIsStreaming(false); initialized.current = true; }
    if (!isOpen) initialized.current = false;
  }, [isOpen, initialSchoolId]);

  useEffect(() => { if (initialSchoolId) { setSelectedSchoolId(initialSchoolId); setSelectedSchoolName(initialSchoolName); } }, [initialSchoolId, initialSchoolName]);

  const loadConversation = useCallback(async (conv: CopilotConversation) => {
    setConversationId(conv.id); setExecution({ phase: "idle" }); setError(null); setStreamingContent(""); setIsStreaming(false);
    const sid = schoolRef.current.id || "";
    try {
      const res = await fetch(`/api/super-admin/copilot/history?conversationId=${conv.id}&schoolId=${sid}`);
      if (!res.ok) throw new Error("Failed to load history");
      const data = await res.json();
      if (Array.isArray(data)) { setMessages(data); const pm = data.find((m: CopilotMessageType) => m.has_plan && m.plan_status === "pending"); if (pm?.plan_summary) setExecution({ phase: "plan_pending", plan: pm.plan_summary, messageId: pm.id }); }
    } catch { setMessages([]); }
  }, []);

  const handleSelectSchool = (schoolId: string) => {
    const school = schools.find((s) => s.id === schoolId);
    if (!school || school.id === selectedSchoolId) return;
    setSelectedSchoolId(school.id); setSelectedSchoolName(school.name);
    setMessages([]); setConversationId(null); setExecution({ phase: "idle" }); setStreamingContent("");
  };

  const handleNewConversation = () => { setMessages([]); setConversationId(null); setError(null); setExecution({ phase: "idle" }); setStreamingContent(""); };

  const activeSchoolId = selectedSchoolId;
  const activeSchoolName = selectedSchoolName;

  const sendMessage = useCallback(async (text: string) => {
    if (isStreaming) return;
    const sid = schoolRef.current.id || "";
    setIsStreaming(true); setLoading(true); setError(null); setExecution({ phase: "idle" }); setStreamingContent("");
    const tu: CopilotMessageType = { id: `t-${Date.now()}`, conversation_id: conversationId || "", role: "user", content: text, has_plan: false, plan_status: null, plan_summary: null, created_at: new Date().toISOString() };
    const ta: CopilotMessageType = { id: `s-${Date.now()}`, conversation_id: conversationId || "", role: "assistant", content: "", has_plan: false, plan_status: null, plan_summary: null, created_at: new Date().toISOString() };
    setMessages((prev) => [...prev, tu, ta]);
    const controller = new AbortController(); abortRef.current = controller;
    try {
      const res = await fetch("/api/super-admin/copilot/stream", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schoolId: sid || undefined, conversationId, message: text, mode }), signal: controller.signal,
      });
      if (!res.ok) {
        // Read SSE error from stream body
        const text = await res.text();
        const match = text.match(/"error":"([^"]+)"/);
        throw new Error(match ? match[1] : `Request failed (${res.status})`);
      }
      const reader = res.body?.getReader(); if (!reader) throw new Error("No response");
      const decoder = new TextDecoder(); let buf = "", fc = "";
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        buf += decoder.decode(value, { stream: true }); const lines = buf.split("\n"); buf = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const d = JSON.parse(line.slice(6));
            if (d.type === "meta") setConversationId(d.conversationId);
            else if (d.type === "chunk") { fc += d.content; setStreamingContent(fc); setMessages((prev) => prev.map((m) => m.id === ta.id ? { ...m, content: fc } : m)); }
            else if (d.type === "plan") { setExecution({ phase: "plan_pending", plan: d.plan, messageId: ta.id }); setMessages((prev) => prev.map((m) => m.id === ta.id ? { ...m, has_plan: true, plan_status: "pending", plan_summary: d.plan } : m)); }
            else if (d.type === "done") setMessages((prev) => prev.map((m) => m.id === ta.id ? { ...m, id: d.messageId || m.id } : m));
            else if (d.type === "error") throw new Error(d.error);
          } catch (e: any) {
            if (e.message && !e.message.includes("JSON")) throw e;
          }
        }
      }
    } catch (err: any) {
      if (err.name !== "AbortError") { setError(err.message); setMessages((prev) => prev.filter((m) => m.id !== tu.id && m.id !== ta.id)); }
    } finally { setLoading(false); setIsStreaming(false); setStreamingContent(""); abortRef.current = null; }
  }, [conversationId, mode, isStreaming]);

  const handleApprove = useCallback(async () => {
    if (execution.phase !== "plan_pending") return;
    const sid = schoolRef.current.id || "";
    setError(null);
    setExecution({ phase: "executing", operation: {} as CopilotOperation, steps: execution.plan.steps.map((s, i) => ({ id: `opt-${i}`, operation_id: "", step_order: s.order, capability: s.capability, description: s.description, input_params: s.params as Record<string, unknown>, api_endpoint: null, api_method: null, response_data: null, status: "pending", error_message: null, rollback_info: null, started_at: null, completed_at: null, created_at: new Date().toISOString() })) });
    try {
      const res = await fetch("/api/super-admin/copilot/execute", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ schoolId: sid || undefined, conversationId, messageId: execution.messageId, plan: execution.plan }) });
      const data = await res.json(); if (!res.ok) throw new Error(data.error || "Execution failed");
      setMessages((prev) => prev.map((m) => m.id === execution.messageId ? { ...m, plan_status: data.operation.status === "completed" ? "completed" : "failed" } : m));
      setExecution({ phase: "completed", operation: data.operation, steps: data.steps, summary: data.summary });
    } catch (err: any) { setError(err.message); setMessages((prev) => prev.map((m) => m.id === execution.messageId ? { ...m, plan_status: "failed" } : m)); setExecution({ phase: "idle" }); }
  }, [execution, conversationId]);

  const handleCancel = useCallback(async () => {
    if (execution.phase !== "plan_pending") return;
    const sid = schoolRef.current.id || "";
    try { await fetch("/api/super-admin/copilot/cancel", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ schoolId: sid || undefined, messageId: execution.messageId }) }); } catch {}
    setMessages((prev) => prev.map((m) => m.id === execution.messageId ? { ...m, plan_status: "cancelled" } : m)); setExecution({ phase: "idle" });
  }, [execution]);

  const handleRollback = useCallback(async () => {
    if (execution.phase !== "completed" || !execution.operation.id) return;
    const sid = schoolRef.current.id || "";
    setRollingBack(true); setError(null);
    try {
      const res = await fetch("/api/super-admin/copilot/rollback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ schoolId: sid || undefined, operationId: execution.operation.id }) });
      const data = await res.json(); if (!res.ok) throw new Error(data.error || "Rollback failed");
      setExecution({ phase: "completed", operation: data.operation, steps: data.steps, summary: data.summary });
    } catch (err: any) { setError(err.message); } finally { setRollingBack(false); }
  }, [execution]);

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20 transition-opacity" onClick={onClose} />
      <div className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-lg bg-bg shadow-2xl flex flex-row border-l border-border animate-slide-in-right">
        {activeSchoolId ? <ConversationList schoolId={activeSchoolId} activeId={conversationId} onSelect={loadConversation} onNew={handleNewConversation} /> : null}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-surface shrink-0">
            <div>
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" /></svg>
                <h2 className="text-body font-bold text-text-primary">Gwin</h2>
              </div>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-sm flex items-center justify-center text-text-secondary hover:bg-bg transition-colors cursor-pointer" aria-label="Close">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>

          {/* School Selector Dropdown */}
          <div className="px-4 py-2 border-b border-border bg-bg flex items-center gap-2 shrink-0">
            <label className="text-caption text-text-muted shrink-0">School:</label>
            {loadingSchools ? (
              <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
            ) : (
              <select
                value={activeSchoolId || ""}
                onChange={(e) => handleSelectSchool(e.target.value)}
                className="flex-1 bg-surface border border-border rounded-sm px-2 py-1.5 text-small text-text-primary focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer"
              >
                <option value="">All Schools (Super Admin)</option>
                {schools.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            )}
          </div>

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
