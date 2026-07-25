"use client";
import { useMemo, useState, useRef } from "react";
import { Badge, Button, Card } from "@/components/ui";
import { studentSummary, computePositions, ordinal, TRAIT_RATINGS } from "@/app/teacher/report-card/lib";
import { ReportCardUI } from "@/components/report-card/ReportCardUI";
import { ReportCardData } from "@/lib/types/report-card";
import html2pdf from "html2pdf.js";

type Student = { id: string; admission_no: string; name: string; photo_url: string | null };
type Subject = { id: string; name: string };
type GradingRow = { grade: string; minimum_score: number; maximum_score: number; remark: string | null };
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
  submission: { status: string; submitted_at?: string | null; submittedByName?: string | null; return_reason?: string | null; reviewed_by?: string | null };
  school?: { name: string; logo_url: string | null; address: string | null; phone?: string; email?: string; motto?: string } | null;
}

function ratingLabel(v?: string) {
  return TRAIT_RATINGS.find((r) => r.value === v)?.label || "—";
}

function statusBadge(status: string) {
  const map: Record<string, { variant: "draft" | "warning" | "success" | "info" | "error"; label: string }> = {
    not_started: { variant: "draft", label: "Not Started" },
    draft: { variant: "warning", label: "In Progress" },
    pending_approval: { variant: "info", label: "Submitted — Pending Review" },
    approved: { variant: "success", label: "Approved" },
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

  const [tab, setTab] = useState<"broadsheet" | "students">("broadsheet");
  const [viewingStudent, setViewingStudent] = useState<Student | null>(null);
  const [showReturn, setShowReturn] = useState(false);
  const [returnReason, setReturnReason] = useState("");
  const [confirmApprove, setConfirmApprove] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const isPending = submission.status === "pending_approval";
  const badge = statusBadge(submission.status || "not_started");
  const th = "px-3 py-2 text-left text-caption text-text-muted uppercase";
  const td = "px-3 py-2";

  const containerRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);
  const handleDownload = (studentName: string) => {
    if (!containerRef.current) return;
    setDownloading(true);
    const element = containerRef.current.querySelector("#report-card-ui") as HTMLElement;
    if (!element) { setDownloading(false); return; }
    const opt = {
      margin: 0,
      filename: `${studentName.replace(/\s+/g, "_")}_ReportCard.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };
    html2pdf().from(element).set(opt as any).save().then(() => setDownloading(false)).catch(() => setDownloading(false));
  };

  const act = async (action: "approve" | "return") => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/school-admin/report-card-review/${cls.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action === "return" ? { action, return_reason: returnReason } : { action }),
      });
      const d = await res.json();
      if (!res.ok) { setError(d.error || "Action failed"); setBusy(false); return; }
      onDone();
    } catch {
      setError("Network error");
      setBusy(false);
    }
  };

  // ── Individual Student Report Card View ──
  if (viewingStudent) {
    const s = viewingStudent;
    const sum = summaries.get(s.id);
    const att = attendance.find((a) => a.student_id === s.id);
    const remark = comments.find((c) => c.student_id === s.id)?.comment || "";
    const pos = positions.get(s.id);
    const tv: Record<string, string> = {};
    for (const p of psychomotorScores) if (p.student_id === s.id) tv[`psychomotor|${p.trait_id}`] = p.score;
    for (const a of affectiveScores) if (a.student_id === s.id) tv[`affective|${a.trait_id}`] = a.score;
    const opened = att?.days_school_opened ?? 0;
    const present = att?.days_present ?? 0;
    const absent = att ? opened - present : null;

    const data: ReportCardData = {
      school: {
        name: detail.school?.name || "School",
        logo_url: detail.school?.logo_url || null,
        address: detail.school?.address || null,
      },
      student: { name: s.name, admission_no: s.admission_no, photo_url: s.photo_url },
      classInfo: { className: cls.name, position: pos || null, totalStudents: students.length },
      termInfo: { session: activeTerm.session_name, term: activeTerm.name },
      academic: {
        subjects: sum?.totals.map(({ subject, total }) => {
          const pct = total !== null && maxTotal > 0 ? (total / maxTotal) * 100 : null;
          const gradeRow = pct !== null ? gradingRows.find((g) => pct >= Number(g.minimum_score) && pct <= Number(g.maximum_score)) : null;
          return {
            id: subject.id, name: subject.name, total_score: total,
            grade: gradeRow?.grade || "N/A", remark: gradeRow?.remark || "Pending",
          };
        }) || [],
        grandTotal: sum?.grand || 0,
        average: sum?.average || 0,
        overallGrade: sum?.grade || "N/A",
        maxPossibleTotal: maxTotal * (sum?.totals.length || 0),
      },
      attendance: { daysOpened: isNaN(opened) ? null : opened, daysPresent: isNaN(present) ? null : present, daysAbsent: absent },
      traits: {
        psychomotor: psychomotorTraits.map(t => ({ name: t.name, score: ratingLabel(tv[`psychomotor|${t.id}`] || "") })),
        affective: affectiveTraits.map(t => ({ name: t.name, score: ratingLabel(tv[`affective|${t.id}`] || "") })),
      },
      remarks: { teacher: remark, admin: null },
      gradingScales: gradingRows,
      isDraft: submission.status !== "approved",
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
        <div ref={containerRef} className="bg-gray-100 overflow-x-auto py-8 flex justify-center border border-border rounded-sm">
          <ReportCardUI data={data} />
        </div>
      </div>
    );
  }

  // ── Main Class View (Broadsheet + Students tabs) ──
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
        <div className="bg-error-bg border border-error rounded-sm px-4 py-2">
          <p className="text-small text-error font-medium">Returned for correction: {submission.return_reason}</p>
        </div>
      )}

      {error && <div className="bg-error-bg border border-error rounded-sm px-4 py-2"><p className="text-small text-error font-medium">{error}</p></div>}

      {/* Tab switcher */}
      <div className="flex gap-2 mb-3">
        <button onClick={() => setTab("broadsheet")} className={`px-4 py-2 rounded-sm text-small font-semibold ${tab === "broadsheet" ? "bg-primary text-text-inverse" : "bg-surface text-text-secondary border border-border"}`}>Broadsheet</button>
        <button onClick={() => setTab("students")} className={`px-4 py-2 rounded-sm text-small font-semibold ${tab === "students" ? "bg-primary text-text-inverse" : "bg-surface text-text-secondary border border-border"}`}>Students</button>
      </div>

      {tab === "broadsheet" ? (
        // ── Broadsheet Tab ──
        <div className="overflow-x-auto border border-border rounded-sm bg-surface">
          <table className="w-full text-small">
            <thead>
              <tr className="bg-bg text-left text-caption text-text-muted uppercase">
                <th className="px-3 py-2">S/N</th>
                <th className="px-3 py-2">Student</th>
                {subjects.map((s) => <th key={s.id} className="px-2 py-2 text-right">{s.name}</th>)}
                <th className="px-3 py-2 text-right">Total</th>
                <th className="px-3 py-2 text-right">Avg</th>
                <th className="px-3 py-2 text-right">Grade</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s, i) => {
                const sum = summaries.get(s.id);
                const offered = sum?.totals.filter((t) => t.total !== null && t.total > 0) || [];
                const ts = offered.reduce((a, t) => a + (t.total || 0), 0);
                const avg = offered.length > 0 ? ts / offered.length : 0;
                return (
                  <tr key={s.id} className="border-t border-border hover:bg-bg cursor-pointer" onClick={() => setViewingStudent(s)}>
                    <td className="px-3 py-2 text-text-muted">{i + 1}</td>
                    <td className="px-3 py-2 font-medium">{s.name}</td>
                    {subjects.map((sj) => {
                      const t = sum?.totals.find((x) => x.subject.id === sj.id);
                      return <td key={sj.id} className="px-2 py-2 text-right">{t?.total !== null && t?.total !== undefined ? t.total : "—"}</td>;
                    })}
                    <td className="px-3 py-2 text-right font-semibold">{ts || "—"}</td>
                    <td className="px-3 py-2 text-right text-text-secondary">{offered.length > 0 ? avg.toFixed(1) : "—"}</td>
                    <td className="px-3 py-2 text-right">{sum?.grade || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        // ── Students Tab ──
        <div className="overflow-x-auto border border-border rounded-sm bg-surface">
          <table className="w-full text-small">
            <thead>
              <tr className="bg-bg text-left text-caption text-text-muted uppercase">
                <th className="px-3 py-2">S/N</th>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2 hidden tablet:table-cell">Admission No</th>
                <th className="px-3 py-2 text-right hidden tablet:table-cell">Average</th>
                <th className="px-3 py-2 text-right hidden tablet:table-cell">Grade</th>
                <th className="px-3 py-2 text-right hidden tablet:table-cell">Position</th>
                <th className="px-3 py-2 text-right"></th>
              </tr>
            </thead>
            <tbody>
              {students.map((s, i) => {
                const sum = summaries.get(s.id);
                return (
                  <tr key={s.id} className="border-t border-border hover:bg-bg">
                    <td className="px-3 py-2 text-text-muted">{i + 1}</td>
                    <td className="px-3 py-2 font-medium">{s.name}</td>
                    <td className="px-3 py-2 hidden tablet:table-cell text-text-muted">{s.admission_no || "—"}</td>
                    <td className="px-3 py-2 text-right hidden tablet:table-cell">{sum ? `${sum.average.toFixed(1)}%` : "—"}</td>
                    <td className="px-3 py-2 text-right hidden tablet:table-cell">{sum?.grade || "—"}</td>
                    <td className="px-3 py-2 text-right hidden tablet:table-cell">{positions.get(s.id) ? ordinal(positions.get(s.id)!) : "—"}</td>
                    <td className="px-3 py-2 text-right">
                      <Button size="sm" variant="ghost" onClick={() => setViewingStudent(s)}>View</Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-3">
        {isPending && (
          <>
            <Button variant="primary" onClick={() => setConfirmApprove(true)} disabled={busy}>Approve & Publish</Button>
            <Button variant="danger" onClick={() => setShowReturn(true)} disabled={busy}>Return for Correction</Button>
          </>
        )}
        <Button variant="ghost" onClick={onDone} disabled={busy}>Back to Classes</Button>
      </div>

      {/* Approve Confirm Dialog */}
      {confirmApprove && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setConfirmApprove(false)} />
          <Card variant="bordered" className="relative max-w-sm w-full shadow-lg text-center space-y-4">
            <h3 className="text-h3 font-bold">Approve & Publish?</h3>
            <p className="text-small text-text-secondary">
              This publishes results for all {students.length} students in {cls.name} and makes them visible to students immediately. This cannot be undone from here.
            </p>
            <div className="flex gap-3 justify-center">
              <Button variant="ghost" size="sm" onClick={() => setConfirmApprove(false)} disabled={busy}>Cancel</Button>
              <Button variant="primary" size="sm" onClick={() => act("approve")} loading={busy}>Approve & Publish</Button>
            </div>
          </Card>
        </div>
      )}

      {/* Return Dialog */}
      {showReturn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => !busy && setShowReturn(false)} />
          <Card variant="bordered" className="relative max-w-md w-full shadow-lg space-y-4">
            <h3 className="text-h3 font-bold">Return for Correction</h3>
            <p className="text-small text-text-secondary">Explain what the Class Teacher needs to fix. This unlocks the class for editing.</p>
            <textarea
              className="w-full border border-border rounded-sm px-3 py-2 text-small bg-surface resize-y"
              rows={3}
              placeholder="e.g. Attendance figures look incorrect for 3 students…"
              value={returnReason}
              onChange={(e) => setReturnReason(e.target.value)}
            />
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
