"use client";
import { Modal } from "@/components/ui";
import {
  Student, Subject, GradingRow, Trait, ScoreRow, AttendanceDraft,
  TRAIT_RATINGS, studentSummary, gradeFor, gradeRemarkFor, ordinal,
} from "./lib";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  school: { name: string; logo_url: string | null; address: string | null } | null;
  className: string;
  termLabel: string;
  student: Student;
  subjects: Subject[];
  scores: ScoreRow[];
  maxTotal: number;
  grading: GradingRow[];
  psychomotorTraits: Trait[];
  affectiveTraits: Trait[];
  position: number | null;
  totalStudents: number;
  attendance: AttendanceDraft;
  traitValues: Record<string, string>;
  remark: string;
  adminRemark?: string;
}

function ratingLabel(v: string) {
  return TRAIT_RATINGS.find((r) => r.value === v)?.label || "—";
}

export function PreviewModal({
  isOpen, onClose, school, className, termLabel, student, subjects, scores, maxTotal,
  grading, psychomotorTraits, affectiveTraits, position, totalStudents,
  attendance, traitValues, remark, adminRemark,
}: Props) {
  const summary = studentSummary(scores, subjects, student.id, maxTotal, grading);
  const opened = parseFloat(attendance.days_school_opened);
  const present = parseFloat(attendance.days_present);
  const absent = !isNaN(opened) && !isNaN(present) ? opened - present : null;
  const th = "px-2 py-1.5 text-left text-caption text-text-muted uppercase";
  const td = "px-2 py-1.5";

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Report Card Preview" size="lg">
      <div className="text-small space-y-4">
        {/* Header: school + student */}
        <div className="text-center border-b border-border pb-3">
          {school?.logo_url && <img src={school.logo_url} alt="" className="w-14 h-14 mx-auto mb-1 object-contain" />}
          <h3 className="text-h3 font-bold text-primary">{school?.name || "School"}</h3>
          {school?.address && <p className="text-caption text-text-muted">{school.address}</p>}
          <p className="text-caption text-text-secondary mt-1 font-medium">{termLabel} — Terminal Report Card</p>
        </div>
        <div className="flex items-center gap-4">
          {student.photo_url ? (
            <img src={student.photo_url} alt="" className="w-16 h-16 rounded object-cover border border-border" />
          ) : (
            <div className="w-16 h-16 rounded bg-bg border border-border flex items-center justify-center text-text-muted text-h3">
              {student.name.charAt(0)}
            </div>
          )}
          <div className="grid grid-cols-2 gap-x-6 gap-y-0.5 flex-1">
            <p><span className="text-text-muted">Name:</span> <span className="font-medium">{student.name}</span></p>
            <p><span className="text-text-muted">Admission No:</span> {student.admission_no || "—"}</p>
            <p><span className="text-text-muted">Class:</span> {className}</p>
            <p><span className="text-text-muted">Position:</span> {position ? `${ordinal(position)} of ${totalStudents}` : "—"}</p>
          </div>
        </div>

        {/* Subjects */}
        <div className="overflow-x-auto border border-border rounded-sm">
          <table className="w-full">
            <thead className="bg-bg">
              <tr><th className={th}>Subject</th><th className={`${th} text-right`}>Score</th><th className={`${th} text-right`}>Grade</th><th className={th}>Remark</th></tr>
            </thead>
            <tbody>
              {summary.totals.map(({ subject, total }) => {
                const pct = total !== null && maxTotal > 0 ? (total / maxTotal) * 100 : null;
                return (
                  <tr key={subject.id} className="border-t border-border">
                    <td className={td}>{subject.name}</td>
                    <td className={`${td} text-right`}>{total ?? "—"}</td>
                    <td className={`${td} text-right`}>{pct !== null ? gradeFor(pct, grading) : "—"}</td>
                    <td className={td}>{pct !== null ? gradeRemarkFor(pct, grading) : "Pending"}</td>
                  </tr>
                );
              })}
              <tr className="border-t border-border bg-bg font-bold">
                <td className={td}>Total: {summary.grand}</td>
                <td className={`${td} text-right`} colSpan={2}>Average: {summary.average.toFixed(1)}%</td>
                <td className={td}>Grade: {summary.grade}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Attendance */}
        <div className="grid grid-cols-3 gap-3 border border-border rounded-sm p-3">
          <p><span className="text-text-muted block text-caption">School Opened</span><span className="font-medium">{isNaN(opened) ? "—" : opened}</span></p>
          <p><span className="text-text-muted block text-caption">Days Present</span><span className="font-medium">{isNaN(present) ? "—" : present}</span></p>
          <p><span className="text-text-muted block text-caption">Days Absent</span><span className="font-medium">{absent ?? "—"}</span></p>
        </div>

        {/* Traits */}
        <div className="grid grid-cols-1 tablet:grid-cols-2 gap-3">
          {[
            { kind: "psychomotor", label: "Psychomotor", traits: psychomotorTraits },
            { kind: "affective", label: "Affective", traits: affectiveTraits },
          ].map(({ kind, label, traits }) =>
            traits.length === 0 ? null : (
              <div key={kind} className="border border-border rounded-sm p-3">
                <h4 className="font-bold mb-1">{label}</h4>
                {traits.map((t) => (
                  <p key={t.id} className="flex justify-between border-t border-border py-1">
                    <span>{t.name}</span>
                    <span className="text-text-secondary">{ratingLabel(traitValues[`${kind}|${t.id}`] || "")}</span>
                  </p>
                ))}
              </div>
            ),
          )}
        </div>

        {/* Remarks */}
        <div className="border border-border rounded-sm p-3">
          <h4 className="font-bold mb-1">Teacher&apos;s Remark</h4>
          <p className="text-text-secondary">{remark || "—"}</p>
        </div>
        {adminRemark && (
          <div className="border border-border rounded-sm p-3">
            <h4 className="font-bold mb-1">Principal&apos;s Remark</h4>
            <p className="text-text-secondary">{adminRemark}</p>
          </div>
        )}
      </div>
    </Modal>
  );
}
