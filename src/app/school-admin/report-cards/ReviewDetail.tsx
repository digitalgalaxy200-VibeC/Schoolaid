"use client";
import { useState } from "react";
import { Badge, Button, Card } from "@/components/ui";
import { studentSummary, computePositions, ordinal, TRAIT_RATINGS } from "@/app/teacher/report-card/lib";

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
  submission: { status: string; submitted_at?: string | null; submittedByName?: string | null; return_reason?: string | null };
}

function ratingLabel(v?: string) {
  return TRAIT_RATINGS.find((r) => r.value === v)?.label || "—";
}

export function ReviewDetail({ detail, onDone }: { detail: Detail; onDone: () => void }) {
  const { class: cls, activeTerm, students, subjects, components, gradingRows, psychomotorTraits, affectiveTraits, scores, attendance, psychomotorScores, affectiveScores, comments, submission } = detail;
  const maxTotal = components.reduce((s, c) => s + (Number(c.maximum_score) || 0), 0);

  const summaries = new Map(students.map((s) => [s.id, studentSummary(scores, subjects, s.id, maxTotal, gradingRows)]));
  const positions = computePositions(new Map(students.map((s) => [s.id, summaries.get(s.id)?.average || 0])));

  const [showReturn, setShowReturn] = useState(false);
  const [returnReason, setReturnReason] = useState("");
  const [confirmApprove, setConfirmApprove] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

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

  const th = "px-3 py-2 text-left text-caption text-text-muted uppercase";
  const td = "px-3 py-2";

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
        <Badge variant="info">Pending School Admin Approval</Badge>
      </div>

      {error && <div className="bg-error-bg border border-error rounded-sm px-4 py-2"><p className="text-small text-error font-medium">{error}</p></div>}

      <div className="overflow-x-auto border border-border rounded-sm bg-surface">
        <table className="w-full text-small">
          <thead>
            <tr className="bg-bg">
              <th className={th}>S/N</th>
              <th className={th}>Name</th>
              <th className={`${th} text-right`}>Average</th>
              <th className={`${th} text-right`}>Grade</th>
              <th className={`${th} text-right`}>Position</th>
              <th className={`${th} text-right`}>Attendance</th>
              <th className={th}>Remark</th>
            </tr>
          </thead>
          <tbody>
            {students.map((s, i) => {
              const sum = summaries.get(s.id)!;
              const att = attendance.find((a) => a.student_id === s.id);
              const remark = comments.find((c) => c.student_id === s.id)?.comment || "";
              return (
                <tr key={s.id} className="border-t border-border">
                  <td className={`${td} text-text-muted`}>{i + 1}</td>
                  <td className={`${td} font-medium`}>{s.name}</td>
                  <td className={`${td} text-right`}>{sum.average.toFixed(1)}%</td>
                  <td className={`${td} text-right`}>{sum.grade}</td>
                  <td className={`${td} text-right`}>{positions.get(s.id) ? ordinal(positions.get(s.id)!) : "—"}</td>
                  <td className={`${td} text-right`}>{att ? `${att.days_present}/${att.days_school_opened}` : "—"}</td>
                  <td className={`${td} max-w-xs truncate`} title={remark}>{remark || "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {(psychomotorTraits.length > 0 || affectiveTraits.length > 0) && (
        <Card variant="bordered">
          <h4 className="text-small font-bold mb-2">Psychomotor & Affective (sample: first student)</h4>
          {students[0] && (
            <div className="grid grid-cols-1 tablet:grid-cols-2 gap-3 text-small">
              {[...psychomotorTraits.map((t) => ({ ...t, kind: "psychomotor" as const })), ...affectiveTraits.map((t) => ({ ...t, kind: "affective" as const }))].map((t) => {
                const v = t.kind === "psychomotor"
                  ? psychomotorScores.find((p) => p.student_id === students[0].id && p.trait_id === t.id)?.score
                  : affectiveScores.find((p) => p.student_id === students[0].id && p.trait_id === t.id)?.score;
                return <p key={`${t.kind}-${t.id}`} className="flex justify-between border-b border-border py-1"><span>{t.name}</span><span className="text-text-muted">{ratingLabel(v)}</span></p>;
              })}
            </div>
          )}
          <p className="text-caption text-text-muted mt-2">Open a student in the Class Teacher&apos;s module for full per-student detail if needed.</p>
        </Card>
      )}

      <div className="flex flex-wrap gap-3">
        <Button variant="primary" onClick={() => setConfirmApprove(true)} disabled={busy}>Approve & Publish</Button>
        <Button variant="danger" onClick={() => setShowReturn(true)} disabled={busy}>Return for Correction</Button>
        <Button variant="ghost" onClick={onDone} disabled={busy}>Back</Button>
      </div>

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
