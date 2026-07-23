"use client";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge, Button, Card } from "@/components/ui";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { StudentEditor } from "./StudentEditor";
import { PreviewModal } from "./PreviewModal";
import {
  Student, Subject, GradingRow, Trait, ScoreRow, AttendanceDraft,
  studentSummary, computePositions,
} from "./lib";

type ClassInfo = { id: string; name: string; grade: string; role: string; status: string };
type Term = { id: string; name: string; session_name: string } | null;

const STATUS_BADGE: Record<string, { variant: "draft" | "warning" | "success" | "info"; label: string }> = {
  draft: { variant: "draft", label: "Draft" },
  pending_approval: { variant: "info", label: "Pending School Admin Approval" },
  approved: { variant: "success", label: "Approved" },
  returned: { variant: "warning", label: "Returned for Correction" },
};

function ProgressBar({ label, pct }: { label: string; pct: number }) {
  return (
    <div>
      <div className="flex justify-between text-caption text-text-muted mb-0.5">
        <span>{label}</span><span>{Math.round(pct)}%</span>
      </div>
      <div className="h-2 bg-border rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${pct >= 100 ? "bg-success" : "bg-primary"}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
    </div>
  );
}

export default function PrepareReportCardPage() {
  const [phase, setPhase] = useState<"loading" | "no-access" | "no-term" | "select" | "class">("loading");
  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [term, setTerm] = useState<Term>(null);
  const [classId, setClassId] = useState("");
  const [loadingClass, setLoadingClass] = useState(false);

  // class data
  const [students, setStudents] = useState<Student[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [maxTotal, setMaxTotal] = useState(0);
  const [grading, setGrading] = useState<GradingRow[]>([]);
  const [psychomotorTraits, setPsychomotorTraits] = useState<Trait[]>([]);
  const [affectiveTraits, setAffectiveTraits] = useState<Trait[]>([]);
  const [scores, setScores] = useState<ScoreRow[]>([]);
  const [status, setStatus] = useState("draft");
  const [returnReason, setReturnReason] = useState<string | null>(null);
  const [school, setSchool] = useState<{ name: string; logo_url: string | null; address: string | null } | null>(null);
  const [lastSaved, setLastSaved] = useState<string>("");

  // drafts
  const [attendance, setAttendance] = useState<Record<string, AttendanceDraft>>({});
  const [traitValues, setTraitValues] = useState<Record<string, Record<string, string>>>({}); // studentId → `${kind}|${trait}` → value
  const [remarks, setRemarks] = useState<Record<string, string>>({});
  const [adminRemarks, setAdminRemarks] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState<{ attendance: Set<string>; traits: Set<string>; remarks: Set<string> }>({
    attendance: new Set(), traits: new Set(), remarks: new Set(),
  });

  const [openStudent, setOpenStudent] = useState<string | null>(null);
  const [previewStudent, setPreviewStudent] = useState<Student | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitMissing, setSubmitMissing] = useState<string[]>([]);

  const autoSaveTimer = useRef<NodeJS.Timeout | null>(null);
  const stateRef = useRef({ attendance, traitValues, remarks, dirty, classId });
  stateRef.current = { attendance, traitValues, remarks, dirty, classId };

  const locked = status === "pending_approval" || status === "approved";

  // ── Load classes (Step 1) ──
  useEffect(() => {
    fetch("/api/teacher/report-card/classes")
      .then((r) => r.json())
      .then((d) => {
        if (!d.isClassTeacher) { setPhase("no-access"); return; }
        setClasses(d.classes || []);
        setTerm(d.activeTerm || null);
        if (!d.activeTerm) { setPhase("no-term"); return; }
        setPhase("select");
      })
      .catch(() => setPhase("no-access"));
  }, []);

  // ── Load class data (Steps 2–7) ──
  const loadClass = useCallback(async (cid: string) => {
    setLoadingClass(true);
    setClassId(cid);
    const res = await fetch(`/api/teacher/report-card/class-data?class_id=${cid}`);
    if (!res.ok) {
      setMsg({ type: "error", text: (await res.json()).error || "Failed to load class" });
      setLoadingClass(false);
      return;
    }
    const d = await res.json();
    setStudents(d.students || []);
    setSubjects(d.subjects || []);
    setMaxTotal((d.components || []).reduce((s: number, c: { maximum_score: number }) => s + (Number(c.maximum_score) || 0), 0));
    setGrading(d.gradingRows || []);
    setPsychomotorTraits(d.psychomotorTraits || []);
    setAffectiveTraits(d.affectiveTraits || []);
    setScores(d.scores || []);
    setStatus(d.submission?.status || "draft");
    setReturnReason(d.submission?.return_reason || null);
    setSchool(d.school || null);
    if (d.lastAudit) {
      const who = (Array.isArray(d.lastAudit.profiles) ? d.lastAudit.profiles[0] : d.lastAudit.profiles)?.full_name || "";
      setLastSaved(`Last saved by ${who} — ${new Date(d.lastAudit.created_at).toLocaleString()}`);
    } else setLastSaved("");

    const att: Record<string, AttendanceDraft> = {};
    for (const a of d.attendance || []) {
      att[a.student_id] = { days_school_opened: String(a.days_school_opened ?? ""), days_present: String(a.days_present ?? "") };
    }
    setAttendance(att);
    const tv: Record<string, Record<string, string>> = {};
    for (const p of d.psychomotorScores || []) (tv[p.student_id] ||= {})[`psychomotor|${p.trait_id}`] = String(p.score ?? "");
    for (const p of d.affectiveScores || []) (tv[p.student_id] ||= {})[`affective|${p.trait_id}`] = String(p.score ?? "");
    setTraitValues(tv);
    const rm: Record<string, string> = {};
    for (const c of d.comments || []) rm[c.student_id] = c.comment || "";
    setRemarks(rm);
    const arm: Record<string, string> = {};
    for (const c of d.adminComments || []) arm[c.student_id] = c.comment || "";
    setAdminRemarks(arm);
    setDirty({ attendance: new Set(), traits: new Set(), remarks: new Set() });
    setPhase("class");
    setLoadingClass(false);
  }, []);

  // ── Save (Step 8): dirty records only ──
  const saveDirty = useCallback(async () => {
    const { attendance: att, traitValues: tv, remarks: rm, dirty: dt, classId: cid } = stateRef.current;
    if (dt.attendance.size === 0 && dt.traits.size === 0 && dt.remarks.size === 0) return;

    // Skip invalid attendance rows (present > opened) — server rejects them anyway
    const attendancePayload = [...dt.attendance].flatMap((sid) => {
      const a = att[sid];
      if (!a || a.days_school_opened === "" || a.days_present === "") return [];
      const opened = Number(a.days_school_opened), present = Number(a.days_present);
      if (present > opened || present < 0 || opened < 0) return [];
      return [{ student_id: sid, days_school_opened: a.days_school_opened, days_present: a.days_present }];
    });
    const psychomotor: { student_id: string; trait_id: string; score: string }[] = [];
    const affective: { student_id: string; trait_id: string; score: string }[] = [];
    for (const key of dt.traits) {
      const [sid, kind, traitId] = key.split("|");
      const value = tv[sid]?.[`${kind}|${traitId}`];
      if (!value) continue;
      (kind === "psychomotor" ? psychomotor : affective).push({ student_id: sid, trait_id: traitId, score: value });
    }
    const comments = [...dt.remarks].map((sid) => ({ student_id: sid, comment: rm[sid] || "" }));

    setSaving(true);
    try {
      const res = await fetch("/api/teacher/report-card/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ class_id: cid, attendance: attendancePayload, psychomotor, affective, comments }),
      });
      const d = await res.json();
      if (!res.ok) {
        setMsg({ type: "error", text: d.error || "Save failed" });
        if (res.status === 423) loadClass(cid);
      } else {
        setDirty({ attendance: new Set(), traits: new Set(), remarks: new Set() });
        setMsg({ type: "success", text: "Saved" });
        setLastSaved(`Last saved — ${new Date(d.savedAt).toLocaleString()}`);
        setTimeout(() => setMsg(null), 2000);
      }
    } catch {
      setMsg({ type: "error", text: "Network error while saving" });
    } finally {
      setSaving(false);
    }
  }, [loadClass]);

  const triggerAutoSave = useCallback(() => {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => saveDirty(), 1500);
  }, [saveDirty]);

  // ── Draft mutations ──
  const onAttendanceChange = (sid: string, field: keyof AttendanceDraft, value: string) => {
    setAttendance((prev) => {
      const cur = prev[sid] || { days_school_opened: "", days_present: "" };
      return { ...prev, [sid]: { ...cur, [field]: value } };
    });
    setDirty((prev) => ({ ...prev, attendance: new Set(prev.attendance).add(sid) }));
    triggerAutoSave();
  };
  const onTraitChange = (sid: string, kind: "psychomotor" | "affective", traitId: string, value: string) => {
    setTraitValues((prev) => ({ ...prev, [sid]: { ...prev[sid], [`${kind}|${traitId}`]: value } }));
    setDirty((prev) => ({ ...prev, traits: new Set(prev.traits).add(`${sid}|${kind}|${traitId}`) }));
    triggerAutoSave();
  };
  const onRemarkChange = (sid: string, value: string) => {
    setRemarks((prev) => ({ ...prev, [sid]: value }));
    setDirty((prev) => ({ ...prev, remarks: new Set(prev.remarks).add(sid) }));
    triggerAutoSave();
  };

  // ── Derived: summaries, positions, completion (Recos 1–3) ──
  const summaries = useMemo(() => {
    const map = new Map<string, ReturnType<typeof studentSummary>>();
    for (const s of students) map.set(s.id, studentSummary(scores, subjects, s.id, maxTotal, grading));
    return map;
  }, [students, scores, subjects, maxTotal, grading]);

  const positions = useMemo(() => {
    const avgs = new Map<string, number>();
    for (const s of students) avgs.set(s.id, summaries.get(s.id)?.average || 0);
    return computePositions(avgs);
  }, [students, summaries]);

  const completion = useMemo(() => {
    const n = students.length || 1;
    const subjectStats = subjects.map((subj) => ({
      name: subj.name,
      done: students.filter((s) => summaries.get(s.id)?.totals.find((t) => t.subject.id === subj.id)?.total !== null).length,
    }));
    const attDone = students.filter((s) => {
      const a = attendance[s.id];
      if (!a || a.days_school_opened === "" || a.days_present === "") return false;
      const opened = Number(a.days_school_opened), present = Number(a.days_present);
      return present >= 0 && opened >= 0 && present <= opened;
    }).length;
    const allTraits = [
      ...psychomotorTraits.map((t) => `psychomotor|${t.id}`),
      ...affectiveTraits.map((t) => `affective|${t.id}`),
    ];
    const traitsDone = students.filter((s) => allTraits.every((k) => traitValues[s.id]?.[k])).length;
    const remarksDone = students.filter((s) => (remarks[s.id] || "").trim()).length;
    const scoresDone = students.filter((s) => (summaries.get(s.id)?.pending.length || 0) === 0).length;
    const ready =
      students.length > 0 &&
      subjectStats.every((s) => s.done === students.length) &&
      attDone === students.length &&
      (allTraits.length === 0 || traitsDone === students.length) &&
      remarksDone === students.length;
    return { n: students.length, subjectStats, attDone, traitsDone, remarksDone, scoresDone, ready, hasTraits: allTraits.length > 0 };
  }, [students, subjects, summaries, attendance, traitValues, remarks, psychomotorTraits, affectiveTraits]);

  // ── Submit (Step 10) ──
  const doSubmit = async () => {
    setSubmitting(true);
    setSubmitMissing([]);
    try {
      const res = await fetch("/api/teacher/report-card/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ class_id: classId }),
      });
      const d = await res.json();
      if (!res.ok) {
        setMsg({ type: "error", text: d.error || "Submission failed" });
        if (Array.isArray(d.missing)) setSubmitMissing(d.missing);
      } else {
        setStatus("pending_approval");
        setMsg({ type: "success", text: "Submitted for School Admin approval" });
      }
    } catch {
      setMsg({ type: "error", text: "Network error while submitting" });
    } finally {
      setSubmitting(false);
      setConfirmSubmit(false);
    }
  };

  const termLabel = term ? `${term.session_name ? term.session_name + " — " : ""}${term.name}` : "";
  const currentClass = classes.find((c) => c.id === classId);
  const badge = STATUS_BADGE[status] || STATUS_BADGE.draft;

  // ── Render ──
  if (phase === "loading") return <p className="text-text-muted text-small py-8 text-center">Loading…</p>;

  if (phase === "no-access")
    return (
      <Card variant="bordered" className="text-center py-10">
        <h2 className="text-h3 font-bold mb-2">Prepare Report Card</h2>
        <p className="text-small text-text-muted">This module is only available to Class Teachers (Form Teachers).</p>
      </Card>
    );

  if (phase === "no-term")
    return (
      <Card variant="bordered" className="text-center py-10">
        <h2 className="text-h3 font-bold mb-2">Prepare Report Card</h2>
        <p className="text-small text-error">No active academic term is configured. Please contact your School Admin.</p>
      </Card>
    );

  if (phase === "select")
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-h2 font-bold">Prepare Report Card</h1>
          <p className="text-small text-text-muted">{termLabel} · Select a class you are the Class Teacher of.</p>
        </div>
        <div className="grid grid-cols-1 tablet:grid-cols-2 gap-3">
          {classes.map((c) => {
            const b = STATUS_BADGE[c.status] || STATUS_BADGE.draft;
            return (
              <button key={c.id} onClick={() => loadClass(c.id)} disabled={loadingClass}
                className="text-left border border-border rounded-sm bg-surface p-4 hover:border-primary transition-colors">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold">{c.name}</span>
                  <Badge variant={b.variant}>{b.label}</Badge>
                </div>
                <p className="text-caption text-text-muted mt-1">{c.grade}{c.role === "primary" ? " · Form Teacher" : ""}</p>
              </button>
            );
          })}
        </div>
        {msg && <p className={`text-small ${msg.type === "error" ? "text-error" : "text-success"}`}>{msg.text}</p>}
      </div>
    );

  // phase === "class"
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <button onClick={() => { setPhase("select"); setOpenStudent(null); }} className="text-caption text-primary hover:underline">← Classes</button>
          <h1 className="text-h2 font-bold">{currentClass?.name || "Class"} — Report Cards</h1>
          <p className="text-small text-text-muted">{termLabel} · Total Students: {students.length}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={badge.variant}>{badge.label}</Badge>
          {!locked && (
            <Button size="sm" variant="ghost" onClick={saveDirty} loading={saving}
              disabled={dirty.attendance.size + dirty.traits.size + dirty.remarks.size === 0}>
              Save
            </Button>
          )}
        </div>
      </div>
      {lastSaved && <p className="text-caption text-text-muted">{lastSaved}</p>}
      {status === "returned" && returnReason && (
        <div className="bg-warning-bg border border-warning rounded-sm px-4 py-2">
          <p className="text-small text-warning font-medium">Returned for correction: {returnReason}</p>
        </div>
      )}
      {locked && (
        <div className="bg-info-bg border border-info rounded-sm px-4 py-2">
          <p className="text-small text-info font-medium">
            {status === "approved" ? "Approved by School Admin. All records are locked." : "Submitted — pending School Admin approval. All records are locked."}
          </p>
        </div>
      )}
      {msg && (
        <div className={`border rounded-sm px-4 py-2 ${msg.type === "error" ? "bg-error-bg border-error" : "bg-success-bg border-success"}`}>
          <p className={`text-small font-medium ${msg.type === "error" ? "text-error" : "text-success"}`}>{msg.text}</p>
        </div>
      )}

      {/* Progress indicators */}
      <Card variant="bordered" className="space-y-2">
        <ProgressBar label="Academic Scores" pct={(completion.scoresDone / (completion.n || 1)) * 100} />
        <ProgressBar label="Attendance" pct={(completion.attDone / (completion.n || 1)) * 100} />
        {completion.hasTraits && <ProgressBar label="Psychomotor & Affective" pct={(completion.traitsDone / (completion.n || 1)) * 100} />}
        <ProgressBar label="Remarks" pct={(completion.remarksDone / (completion.n || 1)) * 100} />
      </Card>

      {/* Students table */}
      <div className="overflow-x-auto border border-border rounded-sm bg-surface">
        <table className="w-full text-small">
          <thead>
            <tr className="bg-bg text-left text-caption text-text-muted uppercase">
              <th className="px-3 py-2">S/N</th>
              <th className="px-3 py-2">Student Name</th>
              <th className="px-3 py-2 hidden tablet:table-cell">Admission No</th>
              <th className="px-3 py-2 text-right hidden tablet:table-cell">Average</th>
              <th className="px-3 py-2 text-right"></th>
            </tr>
          </thead>
          <tbody>
            {students.map((s, i) => {
              const sum = summaries.get(s.id);
              const isOpen = openStudent === s.id;
              return (
                <Fragment key={s.id}>
                  <tr className="border-t border-border">
                    <td className="px-3 py-2 text-text-muted">{i + 1}</td>
                    <td className="px-3 py-2 font-medium">{s.name}</td>
                    <td className="px-3 py-2 hidden tablet:table-cell text-text-muted">{s.admission_no || "—"}</td>
                    <td className="px-3 py-2 text-right hidden tablet:table-cell">{sum ? `${sum.average.toFixed(1)}%` : "—"}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <Button size="sm" variant="ghost" onClick={() => setPreviewStudent(s)}>Preview</Button>
                      <Button size="sm" variant="ghost" onClick={() => setOpenStudent(isOpen ? null : s.id)}>{isOpen ? "Close" : "Open"}</Button>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="border-t border-border bg-bg/50">
                      <td colSpan={5} className="px-3 py-4">
                        <StudentEditor
                          student={s} subjects={subjects} scores={scores} maxTotal={maxTotal} grading={grading}
                          psychomotorTraits={psychomotorTraits} affectiveTraits={affectiveTraits}
                          position={positions.get(s.id) ?? null}
                          attendance={attendance[s.id] || { days_school_opened: "", days_present: "" }}
                          traitValues={traitValues[s.id] || {}}
                          remark={remarks[s.id] || ""}
                          locked={locked}
                          onAttendanceChange={(f, v) => onAttendanceChange(s.id, f, v)}
                          onTraitChange={(k, t, v) => onTraitChange(s.id, k, t, v)}
                          onRemarkChange={(v) => onRemarkChange(s.id, v)}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Completion dashboard + Submit */}
      <Card variant="bordered" className="space-y-3">
        <h3 className="text-small font-bold">Completion Summary</h3>
        <div className="grid grid-cols-1 tablet:grid-cols-2 gap-x-6 gap-y-1 text-small">
          {completion.subjectStats.map((s) => (
            <p key={s.name} className="flex justify-between">
              <span>{s.name}</span>
              {s.done === completion.n ? <span className="text-success font-bold">✓</span> : <span className="text-warning">{s.done} of {completion.n} students completed</span>}
            </p>
          ))}
          <p className="flex justify-between">
            <span>Attendance</span>
            {completion.attDone === completion.n ? <span className="text-success font-bold">✓</span> : <span className="text-warning">{completion.n - completion.attDone} students missing</span>}
          </p>
          {completion.hasTraits && (
            <p className="flex justify-between">
              <span>Psychomotor & Affective</span>
              {completion.traitsDone === completion.n ? <span className="text-success font-bold">✓</span> : <span className="text-warning">{completion.n - completion.traitsDone} students incomplete</span>}
            </p>
          )}
          <p className="flex justify-between">
            <span>Teacher Remarks</span>
            {completion.remarksDone === completion.n ? <span className="text-success font-bold">✓</span> : <span className="text-warning">{completion.n - completion.remarksDone} students missing</span>}
          </p>
        </div>
        {submitMissing.length > 0 && (
          <div className="bg-error-bg border border-error rounded-sm px-4 py-2 space-y-0.5">
            {submitMissing.map((m) => <p key={m} className="text-small text-error">{m}</p>)}
          </div>
        )}
        {!locked && (
          <div className="flex items-center gap-3">
            <Button onClick={() => setConfirmSubmit(true)} disabled={!completion.ready || submitting}>Submit for Approval</Button>
            {!completion.ready && <p className="text-caption text-text-muted">Complete all items above before submitting.</p>}
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={confirmSubmit}
        title="Submit for Approval?"
        message={`Submit ${currentClass?.name || "this class"}'s report cards to the School Admin? All records will be locked until the admin approves or returns them.`}
        confirmLabel="Submit"
        variant="primary"
        loading={submitting}
        onConfirm={doSubmit}
        onCancel={() => setConfirmSubmit(false)}
      />

      {previewStudent && (
        <PreviewModal
          isOpen={!!previewStudent}
          onClose={() => setPreviewStudent(null)}
          school={school}
          className={currentClass?.name || ""}
          termLabel={termLabel}
          student={previewStudent}
          subjects={subjects} scores={scores} maxTotal={maxTotal} grading={grading}
          psychomotorTraits={psychomotorTraits} affectiveTraits={affectiveTraits}
          position={positions.get(previewStudent.id) ?? null}
          totalStudents={students.length}
          attendance={attendance[previewStudent.id] || { days_school_opened: "", days_present: "" }}
          traitValues={traitValues[previewStudent.id] || {}}
          remark={remarks[previewStudent.id] || ""}
          adminRemark={adminRemarks[previewStudent.id] || undefined}
        />
      )}
    </div>
  );
}
