"use client";
import { useMemo, useState, useRef, useEffect } from "react";
import { Badge, Button, Card } from "@/components/ui";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { studentSummary, computePositions, ordinal } from "@/app/teacher/report-card/lib";
import { ReportCardUI } from "@/components/report-card/ReportCardUI";
import { ReportCardData } from "@/lib/types/report-card";

type Student = { id: string; admission_no: string; name: string; photo_url: string | null; gender?: string | null };
type Subject = { id: string; name: string };
type GradingRow = { grade: string; minimum_score: number; maximum_score: number; remark: string | null; principal_remark?: string | null };
type Trait = { id: string; name: string };
type ScoreRow = { student_id: string; subject_id: string | null; component_id: string; score: number };

interface Detail {
  class: { id: string; name: string; grade: string };
  activeTerm: { id: string; name: string; session_name: string };
  students: Student[];
  subjects: Subject[];
  components: { id: string; name: string; maximum_score: number }[];
  gradingRows: GradingRow[];
  psychomotorTraits: Trait[];
  affectiveTraits: Trait[];
  scores: ScoreRow[];
  attendance: { student_id: string; days_school_opened: number; days_present: number; days_absent: number }[];
  psychomotorScores: { student_id: string; trait_id: string; score: string }[];
  affectiveScores: { student_id: string; trait_id: string; score: string }[];
  comments: { student_id: string; comment: string }[];
  adminComments: { student_id: string; comment: string }[];
  submission: { status: string; submitted_at?: string | null; submittedByName?: string | null; return_reason?: string | null; retraction_reason?: string | null; reviewed_by?: string | null };
  settings?: any;
  school?: { name: string; logo_url: string | null; address: string | null; phone?: string; email?: string; motto?: string } | null;
}

interface TimelineEntry {
  type: string;
  action: string;
  user: string;
  timestamp: string;
  detail: string;
  details?: any;
}


function statusBadge(status: string) {
  const map: Record<string, { variant: "draft" | "warning" | "success" | "info" | "error"; label: string }> = {
    not_started: { variant: "draft", label: "Not Started" },
    draft: { variant: "warning", label: "In Progress" },
    pending_approval: { variant: "info", label: "Submitted — Pending Review" },
    approved: { variant: "success", label: "Approved — Not Published" },
    published: { variant: "success", label: "Published" },
    retracted: { variant: "error", label: "Retracted" },
    returned: { variant: "error", label: "Returned for Correction" },
  };
  return map[status] || map.draft;
}

export function ReviewDetail({ detail, onDone }: { detail: Detail; onDone: () => void }) {
  const { class: cls, activeTerm, students, subjects, components, gradingRows, psychomotorTraits, affectiveTraits, scores, attendance, psychomotorScores, affectiveScores, comments, submission } = detail;
  const maxTotal = useMemo(() => components.reduce((s, c) => s + (Number(c.maximum_score) || 0), 0), [components]);

  const summaries = useMemo(() => {
    const map = new Map<string, ReturnType<typeof studentSummary>>();
    for (const s of students) map.set(s.id, studentSummary(scores, subjects, s.id, maxTotal, gradingRows));
    return map;
  }, [students, scores, subjects, maxTotal, gradingRows]);

  const positions = useMemo(() => {
    const avgs = new Map<string, number>();
    for (const s of students) avgs.set(s.id, summaries.get(s.id)?.average || 0);
    return computePositions(avgs);
  }, [students, summaries]);

  const [tab, setTab] = useState<"broadsheet" | "students" | "audit">("broadsheet");
  const [viewingStudent, setViewingStudent] = useState<Student | null>(null);
  const [showReturn, setShowReturn] = useState(false);
  const [returnReason, setReturnReason] = useState("");
  const [confirmApprove, setConfirmApprove] = useState(false);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [confirmRetract, setConfirmRetract] = useState(false);
  const [retractReason, setRetractReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [adminCommentText, setAdminCommentText] = useState("");
  const [savingComment, setSavingComment] = useState(false);
  // Local override map: student_id -> persisted comment (or null after reset)
  const [savedAdminComments, setSavedAdminComments] = useState<Record<string, string | null>>({});

  // Audit logs
  const [auditTimeline, setAuditTimeline] = useState<TimelineEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);

  const isPending = submission.status === "pending_approval";
  const isApproved = submission.status === "approved";
  const isPublished = submission.status === "published";
  const isRetracted = submission.status === "retracted";
  const badge = statusBadge(submission.status || "not_started");

  const containerRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);
  const [bulkDownloading, setBulkDownloading] = useState(false);
  const [bulkProgress, setBulkProgress] = useState("");

  useEffect(() => {
    if (tab === "audit") {
      setAuditLoading(true);
      fetch(`/api/school-admin/report-card-review/${cls.id}/logs?term_id=${activeTerm.id}`)
        .then((res) => res.json())
        .then((data) => {
          if (Array.isArray(data)) setAuditTimeline(data);
        })
        .finally(() => setAuditLoading(false));
    }
  }, [tab, cls.id, activeTerm.id]);

  const handleDownload = async (studentName: string) => {
    if (!containerRef.current) return;
    setDownloading(true);
    const safety = setTimeout(() => setDownloading(false), 30000);
    try {
      const html2pdfModule = await import("html2pdf.js");
      const html2pdf = html2pdfModule.default || html2pdfModule;
      const element = containerRef.current.querySelector("#report-card-ui") as HTMLElement;
      if (!element) { clearTimeout(safety); setDownloading(false); return; }
      const opt = {
        margin: 0,
        filename: `${studentName.replace(/\s+/g, "_")}_${cls.name.replace(/\s+/g, "")}_${activeTerm.name.replace(/\s+/g, "_")}_ReportCard.pdf`,
        image: { type: 'jpeg' as const, quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' as const }
      };
      await html2pdf().set(opt).from(element).save();
    } catch (e) { console.error('PDF failed:', e); }
    clearTimeout(safety);
    setDownloading(false);
  };

  const handleBulkDownload = async () => {
    setBulkDownloading(true);
    try {
      const html2canvasModule = await import("html2canvas");
      const html2canvas = html2canvasModule.default;
      const jsPDFModule = await import("jspdf");
      const { jsPDF } = jsPDFModule;
      const { createRoot } = await import("react-dom/client");

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

        await new Promise<void>((resolve) => {
          root.render(<div style={{ width: "794px" }}><ReportCardUI data={buildReportData(s)} /></div>);
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
          a.href = url; a.download = `${s.name.replace(/\s+/g, "_")}_${cls.name.replace(/\s+/g, "")}_${activeTerm.name.replace(/\s+/g, "_")}_ReportCard.pdf`;
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

  const loadAuditLogs = async () => {
    setAuditLoading(true);
    try {
      const res = await fetch(`/api/school-admin/report-card-review/${cls.id}/logs`);
      const data = await res.json();
      setAuditTimeline(data.timeline || []);
    } catch { setAuditTimeline([]); }
    setAuditLoading(false);
  };

  useEffect(() => {
    if (tab === "audit") loadAuditLogs();
  }, [tab, cls.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset draft remark when switching between students
  useEffect(() => {
    setAdminCommentText("");
    setError("");
  }, [viewingStudent?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (action: "approve" | "return" | "publish" | "retract" | "republish") => {
    setBusy(true);
    setError("");
    try {
      const body: Record<string, string> = { action };
      if (action === "return") body.return_reason = returnReason;
      if (action === "retract") body.retraction_reason = retractReason;
      
      const res = await fetch(`/api/school-admin/report-card-review/${cls.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (!res.ok) { setError(d.error || "Action failed"); setBusy(false); return; }
      setConfirmApprove(false);
      setConfirmPublish(false);
      setConfirmRetract(false);
      setShowReturn(false);
      onDone();
    } catch {
      setError("Network error");
      setBusy(false);
    }
  };

  // Build a ReportCardData object for any student
  const buildReportData = (s: Student): ReportCardData => {
    const sum = summaries.get(s.id);
    const att = attendance.find((a) => a.student_id === s.id);
    const remark = comments.find((c) => c.student_id === s.id)?.comment || "";
    const adminRemark = detail.adminComments?.find((c) => c.student_id === s.id)?.comment || "";
    const pos = positions.get(s.id);
    const tv: Record<string, string> = {};
    for (const p of psychomotorScores) if (p.student_id === s.id) tv[`psychomotor|${p.trait_id}`] = p.score;
    for (const a of affectiveScores) if (a.student_id === s.id) tv[`affective|${a.trait_id}`] = a.score;
    const opened = att?.days_school_opened ?? 0;
    const present = att?.days_present ?? 0;
    const absent = att ? opened - present : null;

    return {
      school: {
        name: detail.school?.name || "School",
        logo_url: detail.school?.logo_url || null,
        address: detail.school?.address || null,
        email: detail.school?.email || null,
        phone: detail.school?.phone || null,
        motto: detail.school?.motto || null,
      },
      student: { name: s.name, admission_no: s.admission_no, photo_url: s.photo_url, gender: null, dob: null },
      classInfo: { className: cls.name, position: pos || null, totalStudents: students.length },
      termInfo: { session: activeTerm.session_name, term: activeTerm.name },
      academic: {
        assessmentComponents: components.map((c, i) => ({ id: c.id, name: c.name, max_score: c.maximum_score, order: i })),
        subjects: sum?.totals.map(({ subject, total }) => {
          const pct = total !== null && maxTotal > 0 ? (total / maxTotal) * 100 : null;
          const gradeRow = pct !== null ? gradingRows.find((g) => pct >= Number(g.minimum_score) && pct <= Number(g.maximum_score)) : null;
          const cScores: Record<string, number | null> = {};
          for (const sc of scores) { if (sc.student_id === s.id && (sc.subject_id === subject.id || !sc.subject_id)) cScores[sc.component_id] = sc.score; }
          return { id: subject.id, name: subject.name, total_score: total, grade: gradeRow?.grade || "N/A", remark: gradeRow?.remark || "Pending", component_scores: cScores };
        }) || [],
        grandTotal: sum?.grand || 0, average: sum?.average || 0, overallGrade: sum?.grade || "N/A",
        maxPossibleTotal: maxTotal * (sum?.offeredCount || 0),
      },
      attendance: { daysOpened: isNaN(opened) ? null : opened, daysPresent: isNaN(present) ? null : present, daysAbsent: absent },
      traits: {
        psychomotor: psychomotorTraits.map(t => ({ name: t.name, score: tv[`psychomotor|${t.id}`] || "" })),
        affective: affectiveTraits.map(t => ({ name: t.name, score: tv[`affective|${t.id}`] || "" })),
      },
      remarks: { teacher: remark, admin: adminRemark || null },
      gradingScales: gradingRows,
      isDraft: submission.status !== "published",
      settings: detail.settings,
    };
  };

  // ── Individual Student View ──
  if (viewingStudent) {
    const s = viewingStudent;
    const data = buildReportData(s);

    // Local saved comment (persisted this session) takes precedence over the
    // initial detail.adminComments snapshot so a save appears immediately.
    const localSaved = savedAdminComments[s.id];
    const existingAdminComment = localSaved !== undefined
      ? (localSaved || "")
      : (detail.adminComments?.find((c) => c.student_id === s.id)?.comment || "");
    const hasManualAdminComment = !!existingAdminComment;

    // The auto-generated fallback (no manual override yet)
    const autoGeneratedComment = (() => {
      const sum = summaries.get(s.id);
      if (!sum || sum.average <= 0) return "";
      const avg = sum.average; const firstName = s.name.split(" ")[0];
      const isFemale = s.gender?.toLowerCase() === "female" || s.gender?.toLowerCase() === "f";
      const isMale = s.gender?.toLowerCase() === "male" || s.gender?.toLowerCase() === "m";
      const heShe = isFemale ? "She" : isMale ? "He" : "They";
      const hisHer = isFemale ? "her" : isMale ? "his" : "their";
      // Match the school's configured grading band and use its remark template
      const matchedGrade = gradingRows.find((g) => avg >= Number(g.minimum_score) && avg <= Number(g.maximum_score));
      if (matchedGrade?.principal_remark) {
        return matchedGrade.principal_remark
          .replace(/{name}/gi, firstName)
          .replace(/{average}/gi, avg.toFixed(1))
          .replace(/{grade}/gi, matchedGrade.grade)
          .replace(/{He\/She}/g, heShe)
          .replace(/{he\/she}/g, heShe.toLowerCase())
          .replace(/{his\/her}/gi, hisHer)
          .replace(/{His\/Her}/g, hisHer.charAt(0).toUpperCase() + hisHer.slice(1))
          .replace(/{him\/her}/gi, isFemale ? "her" : isMale ? "him" : "them");
      }
      const descriptor = (matchedGrade?.remark || "satisfactory").toLowerCase();
      return `${firstName} had a ${descriptor} result.`;
    })();

    const displayAdminComment = existingAdminComment || autoGeneratedComment;

    const saveAdminComment = async () => {
      const comment = adminCommentText.trim();
      if (!comment) {
        setError("Please enter a remark before saving.");
        return;
      }
      setSavingComment(true);
      setError("");
      const res = await fetch("/api/school-admin/admin-comment", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ student_id: s.id, term_id: activeTerm.id, comment }),
      });
      setSavingComment(false);
      if (res.ok) {
        // Persist locally so the remark appears immediately without reload
        setSavedAdminComments((prev) => ({ ...prev, [s.id]: comment }));
        setAdminCommentText(comment);
        setError("");
      } else {
        const d = await res.json().catch(() => ({}));
        setError(d.error || "Failed to save remark");
      }
    };

    const resetAdminComment = async () => {
      setSavingComment(true);
      setError("");
      const res = await fetch(`/api/school-admin/admin-comment?student_id=${s.id}&term_id=${activeTerm.id}`, { method: "DELETE" });
      setSavingComment(false);
      if (res.ok) {
        setSavedAdminComments((prev) => ({ ...prev, [s.id]: null }));
        setAdminCommentText("");
      } else {
        const d = await res.json().catch(() => ({}));
        setError(d.error || "Failed to reset remark");
      }
    };

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-h3 font-bold">{s.name}&apos;s Report Card</h2>
            <p className="text-caption text-text-muted">{cls.name} ({cls.grade}) · {activeTerm.session_name} — {activeTerm.name}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="primary" size="sm" onClick={() => handleDownload(s.name)} loading={downloading}>Download PDF</Button>
            <Button variant="ghost" size="sm" onClick={() => setViewingStudent(null)}>← Back to Class</Button>
          </div>
        </div>
        <Card variant="default" className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div><h3 className="text-small font-bold">Principal's Remark</h3><p className="text-caption text-text-muted">{hasManualAdminComment ? '✏️ Manually Edited' : '🤖 Auto Generated'}</p></div>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => { setAdminCommentText(autoGeneratedComment); setError(""); }}>✨ Use AI for Generation</Button>
              {hasManualAdminComment && <Button variant="ghost" size="sm" onClick={resetAdminComment} loading={savingComment}>Reset to Auto</Button>}
              <Button variant="primary" size="sm" onClick={saveAdminComment} loading={savingComment}>Save</Button>
            </div>
          </div>
          <textarea value={adminCommentText || displayAdminComment} onChange={(e) => setAdminCommentText(e.target.value)} rows={3}
            placeholder="Enter principal's remark..." className="w-full px-3 py-2 text-sm border border-border rounded-sm bg-bg resize-none" />
          <p className="text-caption text-text-muted">The AI remark is based on the student's grade and school grading configuration. You can edit it before saving — a saved manual remark takes precedence over auto-generation.</p>
          {error && <p className="text-caption text-error font-medium">{error}</p>}
        </Card>
        <div ref={containerRef} className="bg-gray-100 overflow-x-auto py-8 flex justify-center border border-border rounded-sm">
          <ReportCardUI data={data} />
        </div>
      </div>
    );
  }

  // ── Main Class View ──
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-h3 font-bold">{cls.name} <span className="text-text-muted font-normal">({cls.grade})</span></h2>
          <p className="text-caption text-text-muted">
            {activeTerm.session_name} — {activeTerm.name} · {students.length} students
            {submission.submittedByName && ` · Submitted by ${submission.submittedByName}`}
            {submission.submitted_at && ` on ${new Date(submission.submitted_at).toLocaleString()}`}
          </p>
        </div>
        <Badge variant={badge.variant}>{badge.label}</Badge>
      </div>

      {submission.status === "returned" && submission.return_reason && (
        <div className="bg-error-bg border border-error rounded-sm px-4 py-2"><p className="text-small text-error font-medium">Returned for correction: {submission.return_reason}</p></div>
      )}
      {submission.status === "retracted" && submission.retraction_reason && (
        <div className="bg-warning-bg border border-warning rounded-sm px-4 py-2"><p className="text-small text-warning font-medium">Retracted: {submission.retraction_reason}</p></div>
      )}
      {error && <div className="bg-error-bg border border-error rounded-sm px-4 py-2"><p className="text-small text-error font-medium">{error}</p></div>}

      {/* Tab switcher */}
      <div className="flex gap-2 mb-3">
        <button onClick={() => setTab("broadsheet")} className={`px-4 py-2 rounded-sm text-small font-semibold ${tab === "broadsheet" ? "bg-primary text-text-inverse" : "bg-surface text-text-secondary border border-border"}`}>Broadsheet</button>
        <button onClick={() => setTab("students")} className={`px-4 py-2 rounded-sm text-small font-semibold ${tab === "students" ? "bg-primary text-text-inverse" : "bg-surface text-text-secondary border border-border"}`}>Students</button>
        <button onClick={() => setTab("audit")} className={`px-4 py-2 rounded-sm text-small font-semibold ${tab === "audit" ? "bg-primary text-text-inverse" : "bg-surface text-text-secondary border border-border"}`}>Audit & History</button>
      </div>

      {tab === "broadsheet" ? (
        <div className="overflow-x-auto border border-border rounded-sm bg-surface">
          <table className="w-full text-small">
            <thead><tr className="bg-bg text-left text-caption text-text-muted uppercase">
              <th className="px-3 py-2">S/N</th><th className="px-3 py-2">Student</th>
              {subjects.map((s) => <th key={s.id} className="px-2 py-2 text-right">{s.name}</th>)}
              <th className="px-3 py-2 text-right">Total</th><th className="px-3 py-2 text-right">Avg</th><th className="px-3 py-2 text-right">Grade</th>
            </tr></thead>
            <tbody>
              {students.map((s, i) => {
                const sum = summaries.get(s.id);
                const offered = sum?.totals.filter((t) => t.total !== null && t.total > 0) || [];
                const ts = offered.reduce((a, t) => a + (t.total || 0), 0);
                const avg = offered.length > 0 ? ts / offered.length : 0;
                return (
                  <tr key={s.id} className="border-t border-border hover:bg-bg cursor-pointer" onClick={() => setViewingStudent(s)}>
                    <td className="px-3 py-2 text-text-muted">{i + 1}</td><td className="px-3 py-2 font-medium">{s.name}</td>
                    {subjects.map((sj) => { const t = sum?.totals.find((x) => x.subject.id === sj.id); return <td key={sj.id} className="px-2 py-2 text-right">{t?.total !== null && t?.total !== undefined ? t.total : "—"}</td>; })}
                    <td className="px-3 py-2 text-right font-semibold">{ts || "—"}</td><td className="px-3 py-2 text-right text-text-secondary">{offered.length > 0 ? avg.toFixed(1) : "—"}</td><td className="px-3 py-2 text-right">{sum?.grade || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : tab === "students" ? (
        <div className="overflow-x-auto border border-border rounded-sm bg-surface">
          <table className="w-full text-small">
            <thead><tr className="bg-bg text-left text-caption text-text-muted uppercase">
              <th className="px-3 py-2">S/N</th><th className="px-3 py-2">Name</th><th className="px-3 py-2 hidden tablet:table-cell">Admission No</th>
              <th className="px-3 py-2 text-right hidden tablet:table-cell">Average</th><th className="px-3 py-2 text-right hidden tablet:table-cell">Grade</th>
              <th className="px-3 py-2 text-right hidden tablet:table-cell">Position</th><th className="px-3 py-2 text-right"></th>
            </tr></thead>
            <tbody>
              {students.map((s, i) => {
                const sum = summaries.get(s.id);
                return (
                  <tr key={s.id} className="border-t border-border hover:bg-bg">
                    <td className="px-3 py-2 text-text-muted">{i + 1}</td><td className="px-3 py-2 font-medium">{s.name}</td>
                    <td className="px-3 py-2 hidden tablet:table-cell text-text-muted">{s.admission_no || "—"}</td>
                    <td className="px-3 py-2 text-right hidden tablet:table-cell">{sum ? `${sum.average.toFixed(1)}%` : "—"}</td>
                    <td className="px-3 py-2 text-right hidden tablet:table-cell">{sum?.grade || "—"}</td>
                    <td className="px-3 py-2 text-right hidden tablet:table-cell">{positions.get(s.id) ? ordinal(positions.get(s.id)!) : "—"}</td>
                    <td className="px-3 py-2 text-right"><Button size="sm" variant="ghost" onClick={() => setViewingStudent(s)}>View</Button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        /* Audit & History Tab */
        <Card variant="default" className="shadow-sm">
          <div className="p-5 space-y-4">
            <h3 className="text-h3 font-bold">Modification History</h3>
            {auditLoading ? (
              <div className="flex justify-center py-8"><div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" /></div>
            ) : auditTimeline.length === 0 ? (
              <p className="text-small text-text-muted py-4">No audit records found for this class.</p>
            ) : (
              <div className="space-y-3">
                {auditTimeline.map((entry, i) => (
                  <div key={i} className="flex gap-3 border-l-2 border-border pl-4 py-1">
                    <div className="text-lg shrink-0">
                      {entry.type === "edit" ? "🔢" : entry.action === "submit" ? "📤" : entry.action === "approve" ? "✅" : entry.action === "publish" ? "📢" : entry.action === "retract" ? "⏸️" : entry.action === "republish" ? "🔄" : entry.action === "return" ? "↩️" : "📋"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-small font-medium text-text-primary">{entry.detail}</p>
                      <p className="text-caption text-text-muted mt-0.5">
                        {entry.user} · {new Date(entry.timestamp).toLocaleString()}
                      </p>
                      {entry.details && (
                        <div className="mt-1 text-caption text-text-muted bg-bg rounded-sm px-2 py-1">
                          {entry.details.studentName && <span>Student: {entry.details.studentName} · </span>}
                          {entry.details.previousTotal !== undefined && entry.details.newTotal !== undefined && (
                            <span>Score: {entry.details.previousTotal} → {entry.details.newTotal}</span>
                          )}
                          {entry.details.previousGrade && entry.details.newGrade && (
                            <span>Grade: {entry.details.previousGrade} → {entry.details.newGrade}</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-3">
        {(isPending || isApproved || isPublished) && (
          <>
            {isPending && <Button variant="primary" onClick={() => setConfirmApprove(true)} disabled={busy}>Approve & Publish</Button>}
            {isApproved && <Button variant="primary" onClick={() => setConfirmPublish(true)} disabled={busy}>Publish to Students</Button>}
            {isPending && <Button variant="danger" onClick={() => setShowReturn(true)} disabled={busy}>Return for Correction</Button>}
          </>
        )}
        {(isApproved || isPublished) && (
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={handleBulkDownload} loading={bulkDownloading}>
              📥 Download All Results
            </Button>
            {bulkProgress && (
              <span className="text-caption text-text-muted animate-pulse">{bulkProgress}</span>
            )}
          </div>
        )}
        {isPublished && <Button variant="warning" onClick={() => setConfirmRetract(true)} disabled={busy}>Retract / Unpublish</Button>}
        {isRetracted && <Button variant="primary" onClick={() => act("republish")} loading={busy}>Republish</Button>}
        <Button variant="ghost" onClick={onDone} disabled={busy}>Back to Classes</Button>
      </div>

      {/* Dialogs */}
      <ConfirmDialog open={confirmApprove} title="Approve Results"
        message={`This freezes results for all ${students.length} students in ${cls.name}. Results will NOT be visible to students until you publish them.`}
        confirmLabel="Approve" variant="primary" onConfirm={() => act("approve")} onCancel={() => setConfirmApprove(false)} loading={busy} />
      <ConfirmDialog open={confirmPublish} title="Publish to Students"
        message={`Make results visible to all ${students.length} students in ${cls.name}.`}
        confirmLabel="Publish Now" variant="primary" onConfirm={() => act("publish")} onCancel={() => setConfirmPublish(false)} loading={busy} />

      {confirmRetract && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => !busy && setConfirmRetract(false)} />
          <Card variant="default" className="relative max-w-md w-full shadow-lg space-y-4">
            <h3 className="text-h3 font-bold">Retract Published Results</h3>
            <p className="text-small text-text-secondary">This hides results from students in {cls.name}. You must provide a reason.</p>
            <textarea className="w-full border border-border rounded-sm px-3 py-2 text-small bg-surface resize-y" rows={3}
              placeholder="e.g. Errors found in scores…" value={retractReason} onChange={(e) => setRetractReason(e.target.value)} />
            <div className="flex gap-3 justify-end">
              <Button variant="ghost" size="sm" onClick={() => setConfirmRetract(false)} disabled={busy}>Cancel</Button>
              <Button variant="warning" size="sm" onClick={() => act("retract")} loading={busy} disabled={!retractReason.trim()}>Retract Results</Button>
            </div>
          </Card>
        </div>
      )}

      {showReturn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => !busy && setShowReturn(false)} />
          <Card variant="default" className="relative max-w-md w-full shadow-lg space-y-4">
            <h3 className="text-h3 font-bold">Return for Correction</h3>
            <p className="text-small text-text-secondary">Explain what needs fixing. This unlocks the class for editing.</p>
            <textarea className="w-full border border-border rounded-sm px-3 py-2 text-small bg-surface resize-y" rows={3}
              placeholder="e.g. Attendance figures incorrect…" value={returnReason} onChange={(e) => setReturnReason(e.target.value)} />
            <div className="flex gap-3 justify-end">
              <Button variant="ghost" size="sm" onClick={() => setShowReturn(false)} disabled={busy}>Cancel</Button>
              <Button variant="danger" size="sm" onClick={() => act("return")} loading={busy} disabled={!returnReason.trim()}>Return</Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
