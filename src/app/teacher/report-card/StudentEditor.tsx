"use client";
import { Badge, Button } from "@/components/ui";
import {
  Student, Subject, GradingRow, Trait, ScoreRow, AttendanceDraft,
  TRAIT_RATINGS, studentSummary, gradeFor, ordinal, suggestRemark,
} from "./lib";

interface Props {
  student: Student;
  subjects: Subject[];
  scores: ScoreRow[];
  maxTotal: number;
  grading: GradingRow[];
  psychomotorTraits: Trait[];
  affectiveTraits: Trait[];
  position: number | null;
  attendance: AttendanceDraft;
  traitValues: Record<string, string>; // key: `${kind}|${trait_id}`
  remark: string;
  locked: boolean;
  onAttendanceChange: (field: keyof AttendanceDraft, value: string) => void;
  onTraitChange: (kind: "psychomotor" | "affective", traitId: string, value: string) => void;
  onRemarkChange: (value: string) => void;
}

export function StudentEditor({
  student, subjects, scores, maxTotal, grading, psychomotorTraits, affectiveTraits,
  position, attendance, traitValues, remark, locked,
  onAttendanceChange, onTraitChange, onRemarkChange,
}: Props) {
  const summary = studentSummary(scores, subjects, student.id, maxTotal, grading);
  const opened = parseFloat(attendance.days_school_opened);
  const present = parseFloat(attendance.days_present);
  const attInvalid = attendance.days_present !== "" && attendance.days_school_opened !== "" && (present > opened || present < 0 || opened < 0);
  const absent = !attInvalid && !isNaN(opened) && !isNaN(present) ? opened - present : null;
  const attendancePct = !attInvalid && !isNaN(opened) && !isNaN(present) && opened > 0 ? (present / opened) * 100 : null;

  const inputCls = "w-full border border-border rounded-sm px-3 py-2 text-small bg-surface disabled:opacity-60";

  return (
    <div className="space-y-5">
      {/* ── Academic Summary (read-only) ── */}
      <section>
        <h4 className="text-small font-bold text-text-primary mb-2">Academic Summary <span className="text-caption text-text-muted font-normal">(read-only — entered by subject teachers)</span></h4>
        <div className="overflow-x-auto border border-border rounded-sm">
          <table className="w-full text-small">
            <thead>
              <tr className="bg-bg text-left text-caption text-text-muted uppercase">
                <th className="px-3 py-2">Subject</th>
                <th className="px-3 py-2 text-right">Score</th>
                <th className="px-3 py-2 text-right">Grade</th>
              </tr>
            </thead>
            <tbody>
              {summary.totals.map(({ subject, total }) => (
                <tr key={subject.id} className="border-t border-border">
                  <td className="px-3 py-2">{subject.name}</td>
                  {total === null ? (
                    <td className="px-3 py-2 text-right" colSpan={2}>
                      <Badge variant="warning">Pending Subject Teacher</Badge>
                    </td>
                  ) : (
                    <>
                      <td className="px-3 py-2 text-right font-medium">{total}</td>
                      <td className="px-3 py-2 text-right">{maxTotal > 0 ? gradeFor((total / maxTotal) * 100, grading) : "N/A"}</td>
                    </>
                  )}
                </tr>
              ))}
              <tr className="border-t border-border bg-bg font-bold">
                <td className="px-3 py-2">Total: {summary.grand} · Average: {summary.average.toFixed(1)}% · Grade: {summary.grade}</td>
                <td className="px-3 py-2 text-right" colSpan={2}>{position ? `Position: ${ordinal(position)}` : "Position: —"}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Attendance ── */}
      <section>
        <h4 className="text-small font-bold text-text-primary mb-2">Attendance</h4>
        <div className="grid grid-cols-3 gap-3">
          <label className="block">
            <span className="text-caption text-text-muted">Days School Opened</span>
            <input type="number" min={0} className={inputCls} disabled={locked}
              value={attendance.days_school_opened}
              onChange={(e) => onAttendanceChange("days_school_opened", e.target.value)} />
          </label>
          <label className="block">
            <span className="text-caption text-text-muted">Days Present</span>
            <input type="number" min={0} className={`${inputCls} ${attInvalid ? "border-error" : ""}`} disabled={locked}
              value={attendance.days_present}
              onChange={(e) => onAttendanceChange("days_present", e.target.value)} />
          </label>
          <div className="block">
            <span className="text-caption text-text-muted">Days Absent</span>
            <p className="px-3 py-2 text-small font-medium">{absent !== null ? absent : "—"}</p>
          </div>
        </div>
        {attInvalid && <p className="text-caption text-error mt-1">Days present must be between 0 and days opened.</p>}
      </section>

      {/* ── Psychomotor & Affective (dynamic traits) ── */}
      {[
        { kind: "psychomotor" as const, label: "Psychomotor Assessment", traits: psychomotorTraits },
        { kind: "affective" as const, label: "Affective Assessment", traits: affectiveTraits },
      ].map(({ kind, label, traits }) =>
        traits.length === 0 ? null : (
          <section key={kind}>
            <h4 className="text-small font-bold text-text-primary mb-2">{label}</h4>
            <div className="grid grid-cols-1 tablet:grid-cols-2 gap-3">
              {traits.map((t) => (
                <label key={t.id} className="flex items-center justify-between gap-3 border border-border rounded-sm px-3 py-2">
                  <span className="text-small">{t.name}</span>
                  <select className="border border-border rounded-sm px-2 py-1 text-small bg-surface disabled:opacity-60" disabled={locked}
                    value={traitValues[`${kind}|${t.id}`] || ""}
                    onChange={(e) => onTraitChange(kind, t.id, e.target.value)}>
                    <option value="">—</option>
                    {TRAIT_RATINGS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                </label>
              ))}
            </div>
          </section>
        ),
      )}

      {/* ── Teacher's Remark ── */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-small font-bold text-text-primary">Teacher&apos;s Remark</h4>
          {!locked && (
            <Button variant="ghost" size="sm"
              onClick={() => onRemarkChange(suggestRemark(summary.average, summary.grade, attendancePct))}>
              Suggest remark
            </Button>
          )}
        </div>
        <textarea rows={3} className={`${inputCls} resize-y`} disabled={locked}
          placeholder="Enter a remark for this student…"
          value={remark}
          onChange={(e) => onRemarkChange(e.target.value)} />
      </section>
    </div>
  );
}
