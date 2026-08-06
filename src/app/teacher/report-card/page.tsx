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
import { saveDraft, loadDraft, clearDraft } from "./draft";

type ClassInfo = { id: string; name: string; grade: string; role: string; status: string };
type Term = { id: string; name: string; session_name: string } | null;

const STATUS_BADGE: Record<string, { variant: "draft" | "warning" | "success" | "error" | "info"; label: string }> = {
  draft: { variant: "draft", label: "Draft" },
  pending_approval: { variant: "info", label: "Submitted" },
  approved: { variant: "success", label: "Approved" },
  published: { variant: "success", label: "Published" },
  retracted: { variant: "error", label: "Retracted" },
  returned: { variant: "warning", label: "Returned" },
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
  const [components, setComponents] = useState<{ id: string; name: string; maximum_score: number }[]>([]);
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
  const [traitValues, setTraitValues] = useState<Record<string, Record<string, string>>>({});
  const [remarks, setRemarks] = useState<Record<string, string>>({});
  const [adminRemarks, setAdminRemarks] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState<{ attendance: Set<string>; traits: Set<string>; remarks: Set<string> }>({
    attendance: new Set(), traits: new Set(), remarks: new Set(),
  });

  const [openStudent, setOpenStudent] = useState<string | null>(null);
  const [previewStudent, setPreviewStudent] = useState<Student | null>(null);
  const [viewTab, setViewTab] = useState<"students" | "broadsheet">("students");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitMissing, setSubmitMissing] = useState<string[]>([]);
  const [incompleteStudents, setIncompleteStudents] = useState<{ id: string; name: string }[]>([]);
  const [confirmForceSubmit, setConfirmForceSubmit] = useState(false);
  const [bulkDownloading, setBulkDownloading] = useState(false);
  const [bulkProgress, setBulkProgress] = useState("");

  const stateRef = useRef({ attendance, traitValues, remarks, dirty, classId });
  stateRef.current = { attendance, traitValues, remarks, dirty, classId };

  // ── Draft recovery dialog ──
  const [showDraftDialog, setShowDraftDialog] = useState(false);
  const [hasExistingDraft, setHasExistingDraft] = useState(false);

  // ── Auto-save to server before navigating away ──
  const [navState, setNavState] = useState<"idle" | "saving" | "error">("idle");
  const pendingNavRef = useRef<(() => void) | null>(null);

  const hasUnsaved = dirty.attendance.size + dirty.traits.size + dirty.remarks.size > 0;

  // Debounced localStorage draft save — fires 1s after last change
  const draftTimer = useRef<NodeJS.Timeout | null>(null);
  const persistDraft = useCallback(() => {
    if (!classId) return;
    saveDraft(classId, { attendance, traitValues, remarks });
  }, [classId, attendance, traitValues, remarks]);

  // Auto-save draft to localStorage whenever changes occur
  useEffect(() => {
    if (!hasUnsaved || !classId) return;
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(persistDraft, 1000);
    return () => { if (draftTimer.current) clearTimeout(draftTimer.current); };
  }, [hasUnsaved, persistDraft, classId]);

  // Browser close/refresh — warn
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (hasUnsaved) { e.preventDefault(); e.returnValue = ""; }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasUnsaved]);

  const locked = status === "pending_approval" || status === "approved" || status === "published";

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

  // ── Load class data + check for existing draft ──
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
    setComponents(d.components || []);
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

    // Load server data first
    const att: Record<string, AttendanceDraft> = {};
    for (const a of d.attendance || []) {
      att[a.student_id] = { days_school_opened: String(a.days_school_opened ?? ""), days_present: String(a.days_present ?? "") };
    }
    const tv: Record<string, Record<string, string>> = {};
    for (const p of d.psychomotorScores || []) (tv[p.student_id] ||= {})[`psychomotor|${p.trait_id}`] = String(p.score ?? "");
    for (const p of d.affectiveScores || []) (tv[p.student_id] ||= {})[`affective|${p.trait_id}`] = String(p.score ?? "");
    const rm: Record<string, string> = {};
    for (const c of d.comments || []) rm[c.student_id] = c.comment || "";

    // Check for existing localStorage draft
    const existingDraft = loadDraft(cid);
    if (existingDraft && !d.submission?.status) {
      // Only show for draft status (not submitted/approved)
      setAttendance(existingDraft.attendance);
      setTraitValues(existingDraft.traitValues);
      setRemarks(existingDraft.remarks);
      setHasExistingDraft(true);
      setShowDraftDialog(true);
      setMsg({ type: "success", text: `Unsaved draft found from ${new Date(existingDraft.savedAt).toLocaleString()}` });
    } else {
      // No draft — use server data
      setAttendance(att);
      setTraitValues(tv);
      setRemarks(rm);
      if (existingDraft) clearDraft(cid); // clean up stale draft if class is submitted
    }

    const arm: Record<string, string> = {};
    for (const c of d.adminComments || []) arm[c.student_id] = c.comment || "";
    setAdminRemarks(arm);
    setDirty({ attendance: new Set(), traits: new Set(), remarks: new Set() });
    setPhase("class");
    setLoadingClass(false);
  }, []);

  // Handle draft dialog choices
  const handleRestoreDraft = () => {
    setShowDraftDialog(false);
    setHasExistingDraft(false);
    // Draft data is already loaded — mark everything as dirty so user can save
    const attDirty = new Set(Object.keys(attendance));
    const traitDirty = new Set<string>();
    for (const [sid, traits] of Object.entries(traitValues)) {
      for (const key of Object.keys(traits)) {
        const [kind, traitId] = key.split("|");
        traitDirty.add(`${sid}|${kind}|${traitId}`);
      }
    }
    const remDirty = new Set(Object.keys(remarks).filter((k) => remarks[k]?.trim()));
    setDirty({ attendance: attDirty, traits: traitDirty, remarks: remDirty });
    setMsg({ type: "success", text: "Draft restored — remember to Save your changes" });
    setTimeout(() => setMsg(null), 3000);
  };

  const handleDiscardDraft = () => {
    setShowDraftDialog(false);
    setHasExistingDraft(false);
    clearDraft(classId);
    // Reload fresh data from server
    loadClass(classId);
  };

  // ── Save: dirty records to server + clear localStorage draft ──
  const saveDirty = useCallback(async () => {
    const { attendance: att, traitValues: tv, remarks: rm, dirty: dt, classId: cid } = stateRef.current;
    if (dt.attendance.size === 0 && dt.traits.size === 0 && dt.remarks.size === 0) return;

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

    let success = false;
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
        success = true;
        setDirty({ attendance: new Set(), traits: new Set(), remarks: new Set() });
        clearDraft(cid);
        setMsg({ type: "success", text: "Saved" });
        setLastSaved(`Last saved — ${new Date(d.savedAt).toLocaleString()}`);
        setTimeout(() => setMsg(null), 2000);
      }
    } catch {
      setMsg({ type: "error", text: "Network error while saving" });
    } finally {
      setSaving(false);
    }
    return success;
  }, [loadClass]);

  // Navigate away — save to server first, block navigation on failure
  const saveDirtyRef = useRef(saveDirty);
  saveDirtyRef.current = saveDirty;
  const navigateAway = useCallback(async (action: () => void) => {
    if (hasUnsaved) {
      // Also persist to localStorage as backup
      persistDraft();
      setNavState("saving");
      pendingNavRef.current = action;
      const saved = await saveDirtyRef.current();
      if (saved) {
        setNavState("idle");
        pendingNavRef.current?.();
        pendingNavRef.current = null;
      } else {
        setNavState("error");
      }
    } else {
      action();
    }
  }, [hasUnsaved, persistDraft]);

  // ── Draft mutations ──
  const onAttendanceChange = (sid: string, field: keyof AttendanceDraft, value: string) => {
    setAttendance((prev) => {
      const cur = prev[sid] || { days_school_opened: "", days_present: "" };
      return { ...prev, [sid]: { ...cur, [field]: value } };
    });
    setDirty((prev) => ({ ...prev, attendance: new Set(prev.attendance).add(sid) }));
  };
  const onTraitChange = (sid: string, kind: "psychomotor" | "affective", traitId: string, value: string) => {
    setTraitValues((prev) => ({ ...prev, [sid]: { ...prev[sid], [`${kind}|${traitId}`]: value } }));
    setDirty((prev) => ({ ...prev, traits: new Set(prev.traits).add(`${sid}|${kind}|${traitId}`) }));
  };
  const onRemarkChange = (sid: string, value: string) => {
    setRemarks((prev) => ({ ...prev, [sid]: value }));
    setDirty((prev) => ({ ...prev, remarks: new Set(prev.remarks).add(sid) }));
  };

  // ── Derived: summaries, positions, completion ──
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

  // ── Submit ──
  const doSubmit = async (force = false) => {
    const cid = stateRef.current.classId;
    if (!cid) {
      setMsg({ type: "error", text: "Session error — please refresh the page and log in again before submitting." });
      setConfirmSubmit(false);
      setConfirmForceSubmit(false);
      return;
    }
    setSubmitting(true);
    setSubmitMissing([]);
    try {
      const res = await fetch("/api/teacher/report-card/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ class_id: cid, force }),
      });
      const d = await res.json();
      if (!res.ok) {
        if (res.status === 401) {
          setMsg({ type: "error", text: "Your session has expired. Please refresh the page and log in again." });
        } else if (res.status === 422 && Array.isArray(d.incompleteStudents)) {
          // Show the force-submit dialog with names
          setIncompleteStudents(d.incompleteStudents);
          setConfirmSubmit(false);
          setConfirmForceSubmit(true);
        } else {
          setMsg({ type: "error", text: d.error || "Submission failed" });
          if (Array.isArray(d.missing)) setSubmitMissing(d.missing);
        }
      } else {
        setConfirmForceSubmit(false);
        setStatus("pending_approval");
        clearDraft(cid); // Clear draft on submission
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

  // ── Bulk Download: sequential individual PDFs ──
  const buildTeacherReportData = (s: Student) => {
    const tv = traitValues[s.id] || {};
    const att = attendance[s.id] || { days_school_opened: "", days_present: "" };
    const opened = parseFloat(att.days_school_opened);
    const present = parseFloat(att.days_present);
    const absent = !isNaN(opened) && !isNaN(present) ? opened - present : null;
    const sum = summaries.get(s.id);
    const pos = positions.get(s.id);
    return {
      school: { name: school?.name || "School", logo_url: school?.logo_url || null, address: school?.address || null },
      student: { name: s.name, admission_no: s.admission_no, photo_url: s.photo_url, gender: null, dob: null },
      classInfo: { className: currentClass?.name || "", position: pos || null, totalStudents: students.length },
      termInfo: { session: termLabel.split(" — ")[0] || termLabel, term: termLabel.split(" — ")[1] || "Terminal Report Card" },
      academic: {
        assessmentComponents: components.map((c, i) => ({ id: c.id, name: c.name, max_score: c.maximum_score, order: i })),
        subjects: (sum?.totals || []).map(({ subject, total }) => {
          const pct = total !== null && maxTotal > 0 ? (total / maxTotal) * 100 : null;
          const gradeRow = pct !== null ? grading.find((g) => pct >= Number(g.minimum_score) && pct <= Number(g.maximum_score)) : null;
          const cScores: Record<string, number | null> = {};
          for (const sc of scores) { if (sc.student_id === s.id && sc.subject_id === subject.id) cScores[sc.component_id] = sc.score; }
          return { id: subject.id, name: subject.name, total_score: total, grade: gradeRow?.grade || "N/A", remark: gradeRow?.remark || "Pending", component_scores: cScores };
        }),
        grandTotal: sum?.grand || 0, average: sum?.average || 0, overallGrade: sum?.grade || "N/A",
        maxPossibleTotal: maxTotal * (sum?.offeredCount || 0),
      },
      attendance: { daysOpened: isNaN(opened) ? null : opened, daysPresent: isNaN(present) ? null : present, daysAbsent: absent },
      traits: {
        psychomotor: psychomotorTraits.map(t => ({ name: t.name, score: tv[`psychomotor|${t.id}`] || "" })),
        affective: affectiveTraits.map(t => ({ name: t.name, score: tv[`affective|${t.id}`] || "" })),
      },
      remarks: { teacher: remarks[s.id] || "", admin: adminRemarks[s.id] || null },
      gradingScales: grading,
      isDraft: status !== "published",
    };
  };

  const handleBulkDownload = async () => {
    setBulkDownloading(true);
    try {
      const html2canvasModule = await import("html2canvas");
      const html2canvas = html2canvasModule.default;
      const jsPDFModule = await import("jspdf");
      const { jsPDF } = jsPDFModule;
      const { createRoot } = await import("react-dom/client");
      const { ReportCardUI } = await import("@/components/report-card/ReportCardUI");
      const React = await import("react");

      const renderTarget = document.createElement("div");
      renderTarget.style.position = "absolute";
      renderTarget.style.left = "-9999px";
      renderTarget.style.top = "0";
      renderTarget.style.width = "794px";
      document.body.appendChild(renderTarget);
      const root = createRoot(renderTarget);

      for (let i = 0; i < students.length; i++) {
        const s = students[i];
        setBulkProgress(`Downloading ${i + 1} of ${students.length}: ${s.name}`);
        const data = buildTeacherReportData(s);

        await new Promise<void>((resolve) => {
          root.render(React.createElement("div", { style: { width: "794px" } }, React.createElement(ReportCardUI, { data })));
          setTimeout(resolve, 600);
        });

        const el = renderTarget.firstElementChild as HTMLElement;
        if (el) {
          const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: "#ffffff" });
          const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
          const h = (canvas.height * 210) / canvas.width;
          pdf.addImage(canvas.toDataURL("image/jpeg", 0.95), "JPEG", 0, 0, 210, Math.min(h, 297));
          const blob = pdf.output("blob");
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url; a.download = `${s.name.replace(/\s+/g, "_")}_${(currentClass?.name || "Class").replace(/\s+/g, "")}_${(term?.name || "Term").replace(/\s+/g, "_")}_ReportCard.pdf`;
          document.body.appendChild(a); a.click(); document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }
        await new Promise((r) => setTimeout(r, 200));
      }
      root.unmount();
      document.body.removeChild(renderTarget);
    } catch (e) { console.error("Bulk download failed:", e); }
    setBulkProgress("");
    setBulkDownloading(false);
  };
  const badge = STATUS_BADGE[status] || STATUS_BADGE.draft;

  // ── Render ──
  if (phase === "loading") return <p className="text-text-muted text-small py-8 text-center">Loading…</p>;

  if (phase === "no-access")
    return (
      <Card variant="default" className="text-center py-10">
        <h2 className="text-h3 font-bold mb-2">Prepare Report Card</h2>
        <p className="text-small text-text-muted">This module is only available to Class Teachers (Form Teachers).</p>
      </Card>
    );

  if (phase === "no-term")
    return (
      <Card variant="default" className="text-center py-10">
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
      {/* Draft Recovery Dialog */}
      {showDraftDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <Card variant="default" className="relative max-w-sm w-full shadow-lg text-center space-y-4">
            <div className="mx-auto w-12 h-12 rounded-full flex items-center justify-center bg-info-bg">
              <span className="text-xl font-bold text-info">i</span>
            </div>
            <h3 className="text-h3 font-bold">Unsaved Draft Found</h3>
            <p className="text-small text-text-secondary">
              We found unsaved work from your previous session. Would you like to continue where you left off?
            </p>
            <div className="flex flex-col gap-2">
              <Button variant="primary" size="sm" onClick={handleRestoreDraft}>Restore Draft</Button>
              <Button variant="ghost" size="sm" onClick={handleDiscardDraft}>Discard Draft</Button>
            </div>
          </Card>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <button onClick={() => navigateAway(() => { setPhase("select"); setOpenStudent(null); })} className="text-caption text-primary hover:underline">← Classes</button>
          <h1 className="text-h2 font-bold">{currentClass?.name || "Class"} — Report Cards</h1>
          <p className="text-small text-text-muted">{termLabel} · Total Students: {students.length}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={badge.variant}>{badge.label}</Badge>
          {!locked && (
            <Button size="sm" variant={hasUnsaved ? "primary" : "ghost"} onClick={saveDirty} loading={saving}
              disabled={!hasUnsaved}>
              {hasUnsaved ? `Save (${dirty.attendance.size + dirty.traits.size + dirty.remarks.size} changes)` : "Saved"}
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
          <div className="flex items-center justify-between flex-wrap gap-2">
            <p className="text-small text-info font-medium">
              {status === "published" ? "Published — results are visible to students." : status === "approved" ? "Approved by School Admin. Awaiting publication." : "Submitted — pending School Admin approval."}
              {" "}All records are locked.
            </p>
            {(status === "published" || status === "approved") && (
              <div className="flex items-center gap-2">
                <Button size="sm" variant="secondary" onClick={handleBulkDownload} loading={bulkDownloading}>
                  📥 Download All Results
                </Button>
                {bulkProgress && <span className="text-caption text-text-muted animate-pulse">{bulkProgress}</span>}
              </div>
            )}
          </div>
        </div>
      )}
      {msg && (
        <div className={`border rounded-sm px-4 py-2 ${msg.type === "error" ? "bg-error-bg border-error" : "bg-success-bg border-success"}`}>
          <p className={`text-small font-medium ${msg.type === "error" ? "text-error" : "text-success"}`}>{msg.text}</p>
        </div>
      )}

      {/* Progress indicators */}
      <Card variant="default" className="space-y-2">
        <ProgressBar label="Academic Scores" pct={(completion.scoresDone / (completion.n || 1)) * 100} />
        <ProgressBar label="Attendance" pct={(completion.attDone / (completion.n || 1)) * 100} />
        {completion.hasTraits && <ProgressBar label="Psychomotor & Affective" pct={(completion.traitsDone / (completion.n || 1)) * 100} />}
        <ProgressBar label="Remarks" pct={(completion.remarksDone / (completion.n || 1)) * 100} />
      </Card>

      {/* Tab switcher */}
      <div className="flex gap-2 mb-3">
        <button onClick={()=>setViewTab("students")} className={`px-4 py-2 rounded-sm text-small font-semibold ${viewTab==="students"?"bg-primary text-text-inverse":"bg-surface text-text-secondary border border-border"}`}>Students</button>
        <button onClick={()=>setViewTab("broadsheet")} className={`px-4 py-2 rounded-sm text-small font-semibold ${viewTab==="broadsheet"?"bg-primary text-text-inverse":"bg-surface text-text-secondary border border-border"}`}>Broadsheet</button>
      </div>

      {viewTab === "students" ? <>
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
      <Card variant="default" className="space-y-3">
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
            <Button onClick={() => setConfirmSubmit(true)} disabled={submitting}>Submit for Approval</Button>
            {!completion.ready && <p className="text-caption text-text-muted">Some items are incomplete — you will be asked to confirm before submitting.</p>}
          </div>
        )}
      </Card>

      </> : (
        // Broadsheet Tab
        <div className="overflow-x-auto border border-border rounded-sm bg-surface">
          <table className="w-full text-small">
            <thead>
              <tr className="bg-bg text-left text-caption text-text-muted uppercase">
                <th className="px-3 py-2">S/N</th>
                <th className="px-3 py-2">Student</th>
                {subjects.map(s=><th key={s.id} className="px-2 py-2 text-right">{s.name}</th>)}
                <th className="px-3 py-2 text-right">Total</th>
                <th className="px-3 py-2 text-right">Avg</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s,i)=>{const summary=studentSummary(scores,subjects,s.id,maxTotal,grading);const offered=summary.totals.filter(t=>t.total!==null&&t.total>0);const ts=offered.reduce((a,t)=>a+(t.total||0),0);const avg=offered.length>0?ts/offered.length:0;return(<tr key={s.id} className="border-t border-border hover:bg-bg"><td className="px-3 py-2 text-text-muted">{i+1}</td><td className="px-3 py-2 font-medium">{s.name}</td>{subjects.map(sj=>{const t=summary.totals.find(x=>x.subject.id===sj.id);return<td key={sj.id} className="px-2 py-2 text-right">{t?.total!==null&&t?.total!==undefined?t.total:"—"}</td>})}<td className="px-3 py-2 text-right font-semibold">{ts||"—"}</td><td className="px-3 py-2 text-right text-text-secondary">{offered.length>0?avg.toFixed(1):"—"}</td></tr>)})}
            </tbody>
          </table>
        </div>
      )}

      {/* Bottom action bar — fixed on both mobile and desktop */}
      {!locked && (<>
        <div className="fixed bottom-0 left-0 right-0 bg-surface border-t border-border px-3 py-2.5 flex items-center justify-between gap-2 z-40 shadow-[0_-2px_8px_rgba(0,0,0,0.08)]" style={{paddingBottom: "max(10px, env(safe-area-inset-bottom))"}}>
          <span className="text-caption text-text-muted hidden tablet:inline">{hasUnsaved ? dirty.attendance.size + dirty.traits.size + dirty.remarks.size + " unsaved change(s)" : "All changes saved"}</span>
          <span className="text-caption text-text-muted tablet:hidden">{hasUnsaved ? dirty.attendance.size + dirty.traits.size + dirty.remarks.size + " change(s)" : "Saved"}</span>
          <div className="flex items-center gap-2">
            <Button size="sm" variant={hasUnsaved ? "primary" : "ghost"} onClick={saveDirty} loading={saving} disabled={!hasUnsaved}>
              {hasUnsaved ? "Save Now" : "Saved"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => navigateAway(() => { setPhase("select"); setOpenStudent(null); })}>← Classes</Button>
          </div>
        </div>
        <div className="h-12 tablet:h-14" />
      </>)}

      <ConfirmDialog
        open={confirmSubmit}
        title="Submit for Approval?"
        message={`Submit ${currentClass?.name || "this class"}'s report cards to the School Admin? All records will be locked until the admin approves or returns them.`}
        confirmLabel="Submit"
        variant="primary"
        loading={submitting}
        onConfirm={() => doSubmit(false)}
        onCancel={() => setConfirmSubmit(false)}
      />

      {/* Force-submit dialog shown when some students have incomplete marks */}
      {confirmForceSubmit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => !submitting && setConfirmForceSubmit(false)} />
          <div className="relative max-w-md w-full bg-surface border border-border rounded-xl shadow-2xl p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-warning-bg flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-warning" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                </svg>
              </div>
              <div>
                <h3 className="text-base font-semibold text-text-primary">Incomplete Marks Detected</h3>
                <p className="text-small text-text-secondary mt-1">
                  {incompleteStudents.length} student{incompleteStudents.length !== 1 ? 's' : ''} in this class {incompleteStudents.length !== 1 ? 'have' : 'has'} incomplete marks. This may be intentional (e.g. students who have left the school).
                </p>
              </div>
            </div>
            <div className="rounded-lg border border-border bg-background max-h-48 overflow-y-auto">
              <ul className="divide-y divide-border">
                {incompleteStudents.map((s, i) => (
                  <li key={s.id} className="flex items-center gap-2 px-3 py-2">
                    <span className="text-caption text-text-muted w-5 text-right flex-shrink-0">{i + 1}.</span>
                    <span className="text-small text-text-primary">{s.name}</span>
                  </li>
                ))}
              </ul>
            </div>
            <p className="text-small text-text-secondary">Do you still want to publish the report cards?</p>
            <div className="flex gap-3 pt-1">
              <Button
                variant="ghost"
                size="sm"
                className="flex-1"
                onClick={() => setConfirmForceSubmit(false)}
                disabled={submitting}
              >
                No, Go Back
              </Button>
              <Button
                variant="primary"
                size="sm"
                className="flex-1"
                onClick={() => doSubmit(true)}
                disabled={submitting}
              >
                {submitting ? "Publishing..." : "Yes, Publish"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Saving-before-navigate indicator */}
      {navState === "saving" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/20" />
          <div className="relative bg-surface border border-border rounded-sm px-8 py-6 shadow-lg text-center space-y-3">
            <svg className="animate-spin h-8 w-8 mx-auto text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
            <p className="text-small font-medium text-text-primary">Saving your changes...</p>
            <p className="text-caption text-text-muted">Please wait while we save your work.</p>
          </div>
        </div>
      )}

      {/* Save-failed dialog */}
      {navState === "error" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="relative max-w-sm w-full bg-surface border border-border rounded-sm shadow-lg text-center space-y-4 p-6">
            <div className="mx-auto w-12 h-12 rounded-full flex items-center justify-center bg-error-bg">
              <span className="text-xl font-bold text-error">!</span>
            </div>
            <h3 className="text-h3 font-bold">Save Failed</h3>
            <p className="text-small text-text-secondary">Your changes could not be saved. Please check your internet connection and try again.</p>
            <div className="flex flex-col gap-2">
              <Button variant="primary" size="sm" onClick={async () => {
                setNavState("saving");
                const saved2 = await saveDirtyRef.current();
                if (saved2) {
                  setNavState("idle");
                  pendingNavRef.current?.();
                  pendingNavRef.current = null;
                } else {
                  setNavState("error");
                }
              }}>Retry Save</Button>
              <Button variant="ghost" size="sm" onClick={() => { setNavState("idle"); pendingNavRef.current = null; }}>Stay on Page</Button>
            </div>
          </div>
        </div>
      )}

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
          components={components}
          adminRemark={adminRemarks[previewStudent.id] || undefined}
          status={status}
        />
      )}
    </div>
  );
}
