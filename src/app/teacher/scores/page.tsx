"use client";
import { Suspense, useEffect, useState, useRef, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Card, Badge, Button } from "@/components/ui";

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
  const [expandedStudent, setExpandedStudent] = useState<string | null>(null);

  const autoSaveTimer = useRef<NodeJS.Timeout | null>(null);
  const dirtyRef = useRef(dirtyIds);
  dirtyRef.current = dirtyIds;

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
    setExpandedStudent(null);
    setLoading(false);
  }, [classId, activeTermId, subjectId]);

  useEffect(() => { loadScores(); }, [loadScores]);

  const triggerAutoSave = useCallback(() => {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      if (dirtyRef.current.size > 0) saveDirty();
    }, 5000);
  }, []);

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
    triggerAutoSave();
  };

  const getTotal = (studentId: string): number =>
    components.reduce((sum, c) => {
      const v = parseFloat(getScore(studentId, c.id));
      return sum + (isNaN(v) ? 0 : v);
    }, 0);

  const getMaxTotal = (): number => components.reduce((sum, c) => sum + (c.maximum_score || 0), 0);

  const saveDirty = async () => {
    if (dirtyIds.size === 0 || !activeTermId) return;
    const toSave = scores.filter((s) => dirtyIds.has(`${s.student_id}|${s.component_id}`));
    if (toSave.length === 0) return;
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
    setDirtyIds(new Set());
    setSaving(false);
    setMsg({ type: failCount > 0 ? "error" : "success", text: failCount > 0 ? `${failCount} score(s) failed to save.` : `${toSave.length} score(s) saved` });
    setTimeout(() => setMsg(null), 3000);
  };

  const handleManualSave = () => {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    saveDirty();
  };

  const classSubjects = (() => {
    const cls = classes.find((c) => c.id === classId);
    if (!cls?.subjects?.length) return [];
    return [...cls.subjects].sort((a, b) => a.name.localeCompare(b.name));
  })();

  const selectedSubjectName = classSubjects.find((s) => s.id === subjectId)?.name || "";

  // ── Render ──────────────────────────────────────────────────────────
  return (
    <div className="space-y-3 animate-fade-in pb-20">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-lg font-bold">Student Marks</h1>
        <div className="flex items-center gap-2">
          {dirtyIds.size > 0 && (
            <span className="text-xs text-warning font-medium">{dirtyIds.size} unsaved</span>
          )}
          <Button onClick={handleManualSave} loading={saving} size="sm" variant={dirtyIds.size > 0 ? "primary" : "ghost"}>
            Save
          </Button>
        </div>
      </div>

      {msg && (
        <div className={`px-3 py-2 rounded-sm text-xs font-medium ${msg.type === "success" ? "bg-success-bg text-success" : "bg-error-bg text-error"}`}>
          {msg.text}
        </div>
      )}

      {/* Selectors — full width on mobile */}
      <div className="space-y-2">
        <select
          value={classId}
          onChange={(e) => setClassId(e.target.value)}
          className="w-full px-3 py-2.5 bg-surface border border-border-strong rounded-md text-sm min-h-[44px]"
        >
          <option value="">Select class</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>

        {classId && (
          <select
            value={subjectId}
            onChange={(e) => setSubjectId(e.target.value)}
            className="w-full px-3 py-2.5 bg-surface border border-border-strong rounded-md text-sm min-h-[44px]"
          >
            {classSubjects.length === 0 ? (
              <option value="">No subjects assigned</option>
            ) : (
              classSubjects.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))
            )}
          </select>
        )}

        <div className="flex items-center gap-2">
          {!activeTermName && <Badge variant="warning">No active term</Badge>}
          {activeTermName && (
            <Badge variant="info">{sessionName} · {activeTermName}</Badge>
          )}
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
        <Card variant="bordered"><p className="text-sm text-text-muted py-8 text-center">Select a class above to begin entering marks.</p></Card>
      )}
      {!loading && classId && !activeTermId && (
        <Card variant="bordered"><p className="text-sm text-text-muted py-8 text-center">No active term set. Contact your school administrator to activate a term.</p></Card>
      )}
      {!loading && classId && activeTermId && students.length === 0 && components.length > 0 && (
        <Card variant="bordered"><p className="text-sm text-text-muted py-8 text-center">No students in this class.</p></Card>
      )}
      {!loading && classId && activeTermId && components.length === 0 && (
        <Card variant="bordered"><p className="text-sm text-text-muted py-8 text-center">No assessment components configured. Go to Assessment Config to set up CA1, Exam, etc.</p></Card>
      )}

      {/* ── MOBILE: Card-based student list ── */}
      {!loading && classId && students.length > 0 && components.length > 0 && (
        <div className="tablet:hidden space-y-2">
          {selectedSubjectName && (
            <p className="text-xs text-text-muted px-1">
              Entering <strong>{selectedSubjectName}</strong> — tap a student to expand
            </p>
          )}
          {students.map((s: any) => {
            const total = getTotal(s.id);
            const maxTotal = getMaxTotal();
            const pct = maxTotal > 0 ? Math.round((total / maxTotal) * 100) : 0;
            const hasScore = total > 0;
            const isExpanded = expandedStudent === s.id;

            return (
              <Card key={s.id} variant="bordered" className="overflow-hidden">
                {/* Student header — always visible */}
                <button
                  onClick={() => setExpandedStudent(isExpanded ? null : s.id)}
                  className="w-full px-3 py-3 flex items-center justify-between text-left"
                >
                  <div className="min-w-0 flex-1 mr-2">
                    <p className="text-sm font-semibold truncate">{s.profiles?.full_name || "—"}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {hasScore && (
                      <span className={`text-sm font-bold ${pct >= 70 ? "text-success" : pct >= 50 ? "text-warning" : "text-error"}`}>
                        {total}/{maxTotal}
                      </span>
                    )}
                    <svg
                      className={`w-4 h-4 text-text-muted transition-transform ${isExpanded ? "rotate-180" : ""}`}
                      fill="none" stroke="currentColor" viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </button>

                {/* Expanded score inputs */}
                {isExpanded && (
                  <div className="px-3 pb-3 pt-0 border-t border-border space-y-2">
                    {components.map((c: any) => {
                      const val = getScore(s.id, c.id);
                      const dirty = dirtyIds.has(`${s.id}|${c.id}`);
                      return (
                        <div key={c.id} className="flex items-center gap-2">
                          <label className="text-xs text-text-muted w-12 shrink-0 font-medium">
                            {c.name}
                          </label>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={val}
                            onChange={(e) => setScore(s.id, c.id, e.target.value)}
                            className={`flex-1 text-center px-3 py-2.5 rounded-md border text-sm bg-bg min-h-[44px] focus:outline-none focus:ring-2 focus:ring-accent ${dirty ? "border-warning bg-warning-bg/20" : "border-border"}`}
                            placeholder={`Max: ${c.maximum_score}`}
                            style={{ WebkitAppearance: "none", MozAppearance: "textfield" }}
                          />
                          <span className="text-xs text-text-muted w-10 text-right">/ {c.maximum_score}</span>
                        </div>
                      );
                    })}
                    {/* Total row */}
                    <div className="flex items-center gap-2 pt-1 border-t border-border">
                      <span className="text-xs font-bold text-text-primary w-12 shrink-0">Total</span>
                      <span className={`flex-1 text-center text-sm font-bold ${pct >= 70 ? "text-success" : pct >= 50 ? "text-warning" : total > 0 ? "text-error" : "text-text-muted"}`}>
                        {total > 0 ? total : "—"}
                      </span>
                      <span className="text-xs text-text-muted w-10 text-right">/ {maxTotal}</span>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* ── DESKTOP: Table view ── */}
      {!loading && classId && students.length > 0 && components.length > 0 && (
        <div className="hidden tablet:block">
          <Card variant="bordered" className="shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-small">
                <thead className="bg-primary text-text-inverse">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold sticky left-0 bg-primary">Student</th>
                    {components.map((c: any) => (
                      <th key={c.id} className="text-center px-3 py-3 font-semibold whitespace-nowrap">
                        {c.name}<br />
                        <span className="text-caption font-normal opacity-75">Max: {c.maximum_score}</span>
                      </th>
                    ))}
                    <th className="text-center px-4 py-3 font-semibold bg-primary-dark">
                      Total<br />
                      <span className="text-caption font-normal opacity-75">Max: {getMaxTotal()}</span>
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
                        <td className="px-4 py-2 font-medium whitespace-nowrap sticky left-0 bg-inherit">{s.profiles?.full_name || "—"}</td>
                        {components.map((c: any) => {
                          const val = getScore(s.id, c.id);
                          const dirty = dirtyIds.has(`${s.id}|${c.id}`);
                          return (
                            <td key={c.id} className="px-1 py-1 text-center">
                              <input
                                type="text"
                                inputMode="decimal"
                                value={val}
                                onChange={(e) => setScore(s.id, c.id, e.target.value)}
                                className={`w-20 text-center px-2 py-2 rounded-sm border text-body bg-transparent focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent ${dirty ? "border-warning bg-warning-bg/30" : "border-transparent hover:border-border-strong"}`}
                                placeholder="-"
                                style={{ WebkitAppearance: "none", MozAppearance: "textfield" }}
                              />
                            </td>
                          );
                        })}
                        <td className={`px-4 py-2 text-center font-bold ${tc}`}>{total > 0 ? total : "-"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
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
