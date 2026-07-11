"use client";
import { Suspense, useEffect, useState, useRef, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Card, Badge, Button } from "@/components/ui";

function ScoresContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
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
  const [msg, setMsg] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [dirtyIds, setDirtyIds] = useState<Set<string>>(new Set());
  const [activeTermId, setActiveTermId] = useState("");
  const [activeTermName, setActiveTermName] = useState("");
  const [sessionName, setSessionName] = useState("");

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

  const loadScores = useCallback(async () => {
    if (!classId || !activeTermId) return;
    setLoading(true);
    const params = new URLSearchParams({
      term_id: activeTermId,
      class_id: classId,
    });
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
    setLoading(false);
  }, [classId, activeTermId]);

  useEffect(() => {
    loadScores();
  }, [loadScores]);

  const triggerAutoSave = useCallback(() => {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      if (dirtyRef.current.size > 0) saveDirty();
    }, 5000);
  }, []);

  const getScore = (studentId: string, componentId: string): string => {
    return (
      scores.find(
        (s) => s.student_id === studentId && s.component_id === componentId,
      )?.score ?? ""
    );
  };

  const setScore = (studentId: string, componentId: string, value: string) => {
    if (value !== "" && !/^\d*\.?\d*$/.test(value)) return;
    setScores((prev) => {
      const idx = prev.findIndex(
        (s) => s.student_id === studentId && s.component_id === componentId,
      );
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], score: value };
        return next;
      }
      return [
        ...prev,
        { student_id: studentId, component_id: componentId, score: value },
      ];
    });
    setDirtyIds((prev) => {
      const next = new Set(prev);
      next.add(`${studentId}|${componentId}`);
      return next;
    });
    triggerAutoSave();
  };

  const getTotal = (studentId: string): number => {
    return components.reduce((sum, c) => {
      const v = parseFloat(getScore(studentId, c.id));
      return sum + (isNaN(v) ? 0 : v);
    }, 0);
  };

  const getMaxTotal = (): number =>
    components.reduce((sum, c) => sum + (c.maximum_score || 0), 0);

  const saveDirty = async () => {
    if (dirtyIds.size === 0 || !activeTermId) return;
    const toSave = scores.filter((s) =>
      dirtyIds.has(`${s.student_id}|${s.component_id}`),
    );
    if (toSave.length === 0) return;
    setSaving(true);
    for (const entry of toSave) {
      const val = parseFloat(entry.score);
      if (isNaN(val) && entry.score !== "") continue;
      const component = components.find(
        (c: any) => c.id === entry.component_id,
      );
      if (component && val > component.maximum_score) continue;
      await fetch("/api/teacher/scores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "score",
          data: {
            student_id: entry.student_id,
            assessment_component_id: entry.component_id,
            term_id: activeTermId,
            score: val || 0,
          },
        }),
      });
    }
    setDirtyIds(new Set());
    setSaving(false);
    setMsg({ type: "success", text: `${toSave.length} score(s) saved` });
    setTimeout(() => setMsg(null), 2000);
  };

  const handleManualSave = () => {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    saveDirty();
  };
  const classSubjects = classes.find((c) => c.id === classId)?.subjects || [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-h1 font-bold">Student Marks</h1>
        <div className="flex gap-2 items-center">
          {dirtyIds.size > 0 && (
            <span className="text-caption text-warning font-medium">
              {dirtyIds.size} unsaved
            </span>
          )}
          <Button
            onClick={handleManualSave}
            loading={saving}
            variant={dirtyIds.size > 0 ? "primary" : "ghost"}
          >
            Save
          </Button>
        </div>
      </div>
      {msg && (
        <div
          className={`px-4 py-2 rounded-sm text-small font-medium ${msg.type === "success" ? "bg-success-bg text-success" : "bg-error-bg text-error"}`}
        >
          {msg.text}
        </div>
      )}

      <div className="flex gap-4 flex-wrap">
        <div>
          <label className="block text-caption text-text-muted mb-1">
            Class
          </label>
          <select
            value={classId}
            onChange={(e) => {
              setClassId(e.target.value);
              setSubjectId("");
            }}
            className="px-4 py-2.5 bg-surface border border-border-strong rounded-sm text-body min-w-[180px]"
          >
            <option value="">Select class</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        {classId && (
          <div>
            <label className="block text-caption text-text-muted mb-1">
              Subject
            </label>
            <select
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value)}
              className="px-4 py-2.5 bg-surface border border-border-strong rounded-sm text-body min-w-[180px]"
            >
              <option value="">All subjects</option>
              {classSubjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        )}
        {activeTermName && (
          <Badge variant="info">
            {sessionName} · {activeTermName}
          </Badge>
        )}
      </div>

      {loading && (
        <div className="flex justify-center py-10">
          <div className="animate-spin h-6 w-6 border-2 border-accent border-t-transparent rounded-full" />
        </div>
      )}

      {!loading && classId && students.length > 0 && components.length > 0 && (
        <Card variant="bordered" className="shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-small">
              <thead className="bg-primary text-text-inverse">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold sticky left-0 bg-primary">
                    Student
                  </th>
                  {components.map((c: any) => (
                    <th
                      key={c.id}
                      className="text-center px-3 py-3 font-semibold whitespace-nowrap"
                    >
                      {c.name}
                      <br />
                      <span className="text-caption font-normal opacity-75">
                        Max: {c.maximum_score}
                      </span>
                    </th>
                  ))}
                  <th className="text-center px-4 py-3 font-semibold bg-primary-dark">
                    Total
                    <br />
                    <span className="text-caption font-normal opacity-75">
                      Max: {getMaxTotal()}
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {students.map((s: any, i: number) => {
                  const total = getTotal(s.id);
                  const pct =
                    getMaxTotal() > 0
                      ? Math.round((total / getMaxTotal()) * 100)
                      : 0;
                  const tc =
                    pct >= 70
                      ? "text-success"
                      : pct >= 50
                        ? "text-warning"
                        : "text-error";
                  return (
                    <tr
                      key={s.id}
                      className={`border-b border-border ${i % 2 === 0 ? "bg-surface" : "bg-bg"}`}
                    >
                      <td className="px-4 py-2 font-medium whitespace-nowrap sticky left-0 bg-inherit">
                        {s.profiles?.full_name || "—"}
                      </td>
                      {components.map((c: any) => {
                        const val = getScore(s.id, c.id);
                        const dirty = dirtyIds.has(`${s.id}|${c.id}`);
                        return (
                          <td key={c.id} className="px-1 py-1 text-center">
                            <input
                              type="text"
                              inputMode="decimal"
                              value={val}
                              onChange={(e) =>
                                setScore(s.id, c.id, e.target.value)
                              }
                              className={`w-20 text-center px-2 py-2 rounded-sm border text-body bg-transparent focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent ${dirty ? "border-warning bg-warning-bg/30" : "border-transparent hover:border-border-strong"}`}
                              placeholder="-"
                              style={{
                                WebkitAppearance: "none",
                                MozAppearance: "textfield",
                              }}
                            />
                          </td>
                        );
                      })}
                      <td className={`px-4 py-2 text-center font-bold ${tc}`}>
                        {total > 0 ? total : "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {!loading && classId && students.length === 0 && (
        <Card variant="bordered" className="shadow-sm">
          <p className="text-small text-text-muted py-8 text-center">
            No students in this class.
          </p>
        </Card>
      )}

      {!loading && !classId && (
        <Card variant="bordered" className="shadow-sm">
          <p className="text-small text-text-muted py-8 text-center">
            Select a class above to begin entering marks.
          </p>
        </Card>
      )}
    </div>
  );
}

export default function ScoresPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-20">
          <div className="animate-spin h-6 w-6 border-2 border-accent border-t-transparent rounded-full" />
        </div>
      }
    >
      <ScoresContent />
    </Suspense>
  );
}
