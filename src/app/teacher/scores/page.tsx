"use client";
import { Suspense, useEffect, useState, useRef, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Card, Badge, Button } from "@/components/ui";
import { AiImportModal } from "./AiImportModal";
import { AiReviewModal } from "./AiReviewModal";

/** localStorage draft helpers for scores page */
const DRAFT_KEY = "schoolaid_scores_draft";

function saveScoresDraft(data: { classId: string; subjectId: string; scores: any[]; dirtyIds: string[] }) {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...data, savedAt: new Date().toISOString() })); } catch {}
}
function loadScoresDraft() {
  try { const raw = localStorage.getItem(DRAFT_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
function clearScoresDraft() {
  try { localStorage.removeItem(DRAFT_KEY); } catch {}
}

function ScoresContent() {
  const searchParams = useSearchParams();
  const initialClass = searchParams.get("class") || "";

  const [classes, setClasses] = useState<
    { id: string; name: string; subjects: { id: string; name: string }[] }[]
  >([]);
  const [classId, setClassId] = useState(initialClass);
  const [subjectId, setSubjectId] = useState("");
  const [students, setStudents] = useState<any[]>([]);
  const [components, setComponents] = useState<any[]>([]);
  const [scores, setScores] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [dirtyIds, setDirtyIds] = useState<Set<string>>(new Set());
  const [activeTermId, setActiveTermId] = useState("");
  const [activeTermName, setActiveTermName] = useState("");
  const [sessionName, setSessionName] = useState("");

  // Draft recovery
  const [showDraftDialog, setShowDraftDialog] = useState(false);
  const draftTimer = useRef<NodeJS.Timeout | null>(null);
  const dirtyRef = useRef(dirtyIds);
  dirtyRef.current = dirtyIds;

  // AI Import
  const [aiEnabled, setAiEnabled] = useState(false);
  const [aiImportOpen, setAiImportOpen] = useState(false);
  const [aiReviewOpen, setAiReviewOpen] = useState(false);
  const [aiResults, setAiResults] = useState<any[]>([]);

  const hasUnsaved = dirtyIds.size > 0;

  // beforeunload
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (hasUnsaved) { e.preventDefault(); e.returnValue = ""; }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasUnsaved]);

  // Check AI import feature flag
  useEffect(() => {
    fetch("/api/teacher/ai-import").then(r=>r.json()).then(d=>setAiEnabled(d.enabled)).catch(()=>{});
  }, []);

  // Debounced localStorage draft
  const persistScoresDraft = useCallback(() => {
    if (!classId || !subjectId) return;
    saveScoresDraft({ classId, subjectId, scores, dirtyIds: [...dirtyIds] });
  }, [classId, subjectId, scores, dirtyIds]);

  useEffect(() => {
    if (!hasUnsaved) return;
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(persistScoresDraft, 1000);
    return () => { if (draftTimer.current) clearTimeout(draftTimer.current); };
  }, [hasUnsaved, persistScoresDraft]);

  useEffect(() => {
    fetch("/api/teacher/dashboard")
      .then((r) => r.json())
      .then((d) => {
        setClasses(d.classes || []);
        if (d.activeTerm) {
          setActiveTermId(d.activeTerm.id);
          setActiveTermName(d.activeTerm.name);
          setSessionName(d.activeTerm.session_name || "");
        }
      });
  }, []);

  useEffect(() => {
    if (!classId) return;
    fetch(`/api/teacher/class-subjects?class_id=${classId}`)
      .then((r) => r.json())
      .then((data) => {
        const subs = (Array.isArray(data) ? data : []).map((cs: any) => ({
          id: cs.subject_id,
          name: cs.subjects?.name || "Unknown",
        }));
        const sorted = subs.sort((a: any, b: any) => a.name.localeCompare(b.name));
        const cls = classes.find((c) => c.id === classId);
        if (cls) cls.subjects = sorted;
        if (sorted.length > 0) setSubjectId(sorted[0].id);
      })
      .catch(() => {});
  }, [classId]);

  const loadScores = useCallback(async () => {
    if (!classId || !activeTermId || !subjectId) return;
    setLoading(true);
    const params = new URLSearchParams({ term_id: activeTermId, class_id: classId });
    if (subjectId) params.set("subject_id", subjectId);
    const res = await fetch(`/api/teacher/scores?${params}`);
    const data = await res.json();
    setStudents(data.students || []);
    setComponents(data.components || []);

    // Check for existing draft
    const draft = loadScoresDraft();
    if (draft && draft.classId === classId && draft.subjectId === subjectId && draft.dirtyIds?.length > 0) {
      setScores(draft.scores || []);
      setDirtyIds(new Set(draft.dirtyIds));
      setShowDraftDialog(true);
      setMsg({ type: "success", text: `Unsaved draft found from ${new Date(draft.savedAt).toLocaleString()}` });
    } else {
      const existing: any[] = [];
      for (const s of data.scores || []) {
        existing.push({
          student_id: s.student_id,
          component_id: s.assessment_component_id,
          score: String(s.score ?? ""),
        });
      }
      setScores(existing);
      setDirtyIds(new Set());
    }
    setLoading(false);
  }, [classId, activeTermId, subjectId]);

  useEffect(() => { loadScores(); }, [loadScores]);

  const getScore = (studentId: string, componentId: string): string =>
    scores.find((s) => s.student_id === studentId && s.component_id === componentId)?.score ?? "";

  const setScore = (studentId: string, componentId: string, value: string) => {
    if (value !== "" && !/^\d*\.?\d*$/.test(value)) return;
    const component = components.find((c: any) => c.id === componentId);
    const numVal = parseFloat(value);
    if (component && !isNaN(numVal) && numVal > component.maximum_score) return;

    setScores((prev) => {
      const idx = prev.findIndex((s) => s.student_id === studentId && s.component_id === componentId);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], score: value };
        return next;
      }
      return [...prev, { student_id: studentId, component_id: componentId, score: value }];
    });
    setDirtyIds((prev) => { const next = new Set(prev); next.add(`${studentId}|${componentId}`); return next; });
  };

  const getTotal = (studentId: string): number =>
    components.reduce((sum, c) => {
      const v = parseFloat(getScore(studentId, c.id));
      return sum + (isNaN(v) ? 0 : v);
    }, 0);

  const getMaxTotal = (): number => components.reduce((sum, c) => sum + (c.maximum_score || 0), 0);

  const saveDirty = async () => {
    if (dirtyIds.size === 0 || !activeTermId) return false;
    const toSave = scores.filter((s) => dirtyIds.has(`${s.student_id}|${s.component_id}`));
    if (toSave.length === 0) return false;
    setSaving(true);
    let failCount = 0;
    for (const entry of toSave) {
      const isEmpty = entry.score === "" || entry.score === null;
      const val = isEmpty ? null : parseFloat(entry.score);
      if (val !== null && isNaN(val)) continue;
      const component = components.find((c: any) => c.id === entry.component_id);
      if (component && val !== null && val > component.maximum_score) continue;
      const res = await fetch("/api/teacher/scores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "score",
          data: { student_id: entry.student_id, assessment_component_id: entry.component_id, term_id: activeTermId, score: val, subject_id: subjectId, class_id: classId },
        }),
      });
      if (!res.ok) failCount++;
    }
    if (failCount === 0) {
      setDirtyIds(new Set());
      clearScoresDraft();
    }
    setSaving(false);
    setMsg({ type: failCount > 0 ? "error" : "success", text: failCount > 0 ? `${failCount} score(s) failed to save.` : `${toSave.length} score(s) saved` });
    setTimeout(() => setMsg(null), 3000);
    return failCount === 0;
  };

  const handleManualSave = () => { saveDirty(); };

  // AI Import: feed extracted scores into existing setScore + mark dirty
  const handleAiImport = (entries: { student_id: string; component_id: string; score: string }[]) => {
    for (const entry of entries) {
      // Use existing setScore logic — validates against max_score, marks dirty
      setScores((prev) => {
        const idx = prev.findIndex((s) => s.student_id === entry.student_id && s.component_id === entry.component_id);
        if (idx >= 0) { const next = [...prev]; next[idx] = { ...next[idx], score: entry.score }; return next; }
        return [...prev, { student_id: entry.student_id, component_id: entry.component_id, score: entry.score }];
      });
      setDirtyIds((prev) => { const next = new Set(prev); next.add(`${entry.student_id}|${entry.component_id}`); return next; });
    }
  };

  const classSubjects = (() => {
    const cls = classes.find((c) => c.id === classId);
    if (!cls?.subjects?.length) return [];
    return [...cls.subjects].sort((a, b) => a.name.localeCompare(b.name));
  })();

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Draft Recovery Dialog */}
      {showDraftDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <Card variant="default" className="relative max-w-sm w-full shadow-lg text-center space-y-4 p-6">
            <div className="mx-auto w-12 h-12 rounded-full flex items-center justify-center bg-info-bg">
              <span className="text-xl font-bold text-info">i</span>
            </div>
            <h3 className="text-h3 font-bold">Unsaved Draft Found</h3>
            <p className="text-small text-text-secondary">
              We found unsaved marks from your previous session. Would you like to continue where you left off?
            </p>
            <div className="flex flex-col gap-2">
              <Button variant="primary" size="sm" onClick={() => { setShowDraftDialog(false); setMsg({ type: "success", text: "Draft restored — remember to Save" }); setTimeout(() => setMsg(null), 3000); }}>
                Restore Draft
              </Button>
              <Button variant="ghost" size="sm" onClick={() => { clearScoresDraft(); setShowDraftDialog(false); loadScores(); }}>
                Discard Draft
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-h1 font-bold">Student Marks</h1>
        <div className="flex gap-2 items-center">
          {aiEnabled && classId && subjectId && activeTermId && (
            <Button variant="secondary" size="sm" onClick={() => setAiImportOpen(true)}>📷 AI Import</Button>
          )}
          {dirtyIds.size > 0 && (
            <span className="text-caption text-warning font-medium">{dirtyIds.size} unsaved</span>
          )}
          <Button onClick={handleManualSave} loading={saving} variant={dirtyIds.size > 0 ? "primary" : "ghost"}>
            Save
          </Button>
        </div>
      </div>

      {msg && (
        <div className={`px-4 py-2 rounded-sm text-small font-medium ${msg.type === "success" ? "bg-success-bg text-success" : "bg-error-bg text-error"}`}>
          {msg.text}
        </div>
      )}

      {/* Selectors */}
      <div className="flex gap-3 flex-wrap items-end">
        <div className="w-full tablet:w-auto">
          <label className="block text-caption text-text-muted mb-1">Class</label>
          <select
            value={classId}
            onChange={(e) => setClassId(e.target.value)}
            className="w-full tablet:min-w-[180px] px-4 py-2.5 bg-surface border border-border-strong rounded-sm text-body"
          >
            <option value="">Select class</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        {classId && (
          <div className="w-full tablet:w-auto">
            <label className="block text-caption text-text-muted mb-1">Subject</label>
            <select
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value)}
              className="w-full tablet:min-w-[200px] px-4 py-2.5 bg-surface border border-border-strong rounded-sm text-body"
            >
              {classSubjects.length === 0 ? (
                <option value="">No subjects assigned</option>
              ) : (
                classSubjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)
              )}
            </select>
          </div>
        )}
        <div className="pb-2">
          {!activeTermName && <Badge variant="warning">No active term</Badge>}
          {activeTermName && <Badge variant="info">{sessionName} · {activeTermName}</Badge>}
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex justify-center py-10">
          <div className="animate-spin h-6 w-6 border-2 border-accent border-t-transparent rounded-full" />
        </div>
      )}

      {/* Empty states */}
      {!loading && !classId && (
        <Card variant="default" className="shadow-sm"><p className="text-small text-text-muted py-8 text-center">Select a class above to begin entering marks.</p></Card>
      )}
      {!loading && classId && !activeTermId && (
        <Card variant="default" className="shadow-sm"><p className="text-small text-text-muted py-8 text-center">No active term set. Contact your school administrator to activate a term.</p></Card>
      )}
      {!loading && classId && activeTermId && students.length === 0 && components.length > 0 && (
        <Card variant="default" className="shadow-sm"><p className="text-small text-text-muted py-8 text-center">No students in this class.</p></Card>
      )}
      {!loading && classId && activeTermId && components.length === 0 && (
        <Card variant="default" className="shadow-sm"><p className="text-small text-text-muted py-8 text-center">No assessment components configured. Go to Assessment Config to set up CA1, Exam, etc.</p></Card>
      )}

      {/* Mark Entry Table */}
      {!loading && classId && students.length > 0 && components.length > 0 && (
        <div className="w-full">
          <Card variant="default" className="shadow-sm overflow-hidden p-0">
            <table className="w-full text-small table-fixed">
              <thead className="bg-primary text-text-inverse">
                <tr>
                  <th className="text-left px-1 tablet:px-4 py-2 tablet:py-3 font-semibold text-[10px] tablet:text-sm">
                    Student
                  </th>
                  {components.map((c: any) => (
                    <th key={c.id} className="text-center px-0.5 tablet:px-3 py-2 tablet:py-3 font-semibold text-[9px] tablet:text-sm leading-tight">
                      {c.name}
                      <br />
                      <span className="font-normal opacity-75">Max: {c.maximum_score}</span>
                    </th>
                  ))}
                  <th className="text-center px-1 tablet:px-4 py-2 tablet:py-3 font-semibold bg-primary-dark text-[10px] tablet:text-sm leading-tight">
                    Total
                    <br />
                    <span className="font-normal opacity-75">Max: {getMaxTotal()}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {students.map((s: any, i: number) => {
                  const total = getTotal(s.id);
                  const pct = getMaxTotal() > 0 ? Math.round((total / getMaxTotal()) * 100) : 0;
                  const tc = pct >= 70 ? "text-success" : pct >= 50 ? "text-warning" : "text-error";
                  return (
                    <tr key={s.id} className={`border-b border-border ${i % 2 === 0 ? "bg-surface" : "bg-bg"}`}>
                      <td className="px-1 tablet:px-4 py-1.5 tablet:py-2 font-medium break-words text-[10px] tablet:text-sm leading-tight align-middle">
                        {s.profiles?.full_name || "—"}
                      </td>
                      {components.map((c: any) => {
                        const val = getScore(s.id, c.id);
                        const dirty = dirtyIds.has(`${s.id}|${c.id}`);
                        return (
                          <td key={c.id} className="px-0.5 tablet:px-1 py-1 align-middle text-center">
                            <input
                              type="text"
                              inputMode="decimal"
                              value={val}
                              onChange={(e) => setScore(s.id, c.id, e.target.value)}
                              className={`w-full max-w-[2.5rem] tablet:max-w-[4rem] text-center px-0.5 tablet:px-2 py-1 tablet:py-2 rounded-sm border text-[10px] tablet:text-sm bg-transparent focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent ${dirty ? "border-warning bg-warning-bg/30" : "border-transparent hover:border-border-strong"}`}
                              placeholder="-"
                              style={{ WebkitAppearance: "none", MozAppearance: "textfield" }}
                            />
                          </td>
                        );
                      })}
                      <td className={`px-1 tablet:px-4 py-1.5 tablet:py-2 text-center font-bold text-[10px] tablet:text-sm align-middle ${tc}`}>
                        {total > 0 ? total : "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        </div>
      )}

      {/* Bottom Save bar */}
      {classId && hasUnsaved && (
        <>
          <div className="fixed bottom-0 left-0 right-0 bg-surface border-t border-border px-3 py-2.5 flex items-center justify-between gap-2 z-40 shadow-[0_-2px_8px_rgba(0,0,0,0.08)]" style={{paddingBottom: "max(10px, env(safe-area-inset-bottom))"}}>
            <span className="text-caption text-text-muted">{dirtyIds.size} unsaved mark(s)</span>
            <Button size="sm" variant="primary" onClick={handleManualSave} loading={saving}>Save Marks</Button>
          </div>
          <div className="h-12 tablet:h-14" />
        </>
      )}

      {/* AI Import Modals */}
      <AiImportModal
        isOpen={aiImportOpen}
        onClose={() => setAiImportOpen(false)}
        onProcessed={(data) => { setAiResults(data.results); setAiReviewOpen(true); }}
        classId={classId}
        subjectId={subjectId}
        termId={activeTermId}
      />
      <AiReviewModal
        isOpen={aiReviewOpen}
        onClose={() => setAiReviewOpen(false)}
        onImport={handleAiImport}
        results={aiResults}
        components={components}
      />
    </div>
  );
}

export default function ScoresPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-20"><div className="animate-spin h-6 w-6 border-2 border-accent border-t-transparent rounded-full" /></div>}>
      <ScoresContent />
    </Suspense>
  );
}
