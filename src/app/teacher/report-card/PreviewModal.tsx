"use client";
import { Modal, Button } from "@/components/ui";
import { ReportCardUI } from "@/components/report-card/ReportCardUI";
import { ReportCardData } from "@/lib/types/report-card";
import {
  Student, Subject, GradingRow, Trait, ScoreRow, AttendanceDraft,
  TRAIT_RATINGS, studentSummary, ordinal,
} from "./lib";
import { useRef, useState } from "react";

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
  const [downloading, setDownloading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const summary = studentSummary(scores, subjects, student.id, maxTotal, grading);
  const opened = parseFloat(attendance.days_school_opened);
  const present = parseFloat(attendance.days_present);
  const absent = !isNaN(opened) && !isNaN(present) ? opened - present : null;

  const data: ReportCardData = {
    school: {
      name: school?.name || "School",
      logo_url: school?.logo_url || null,
      address: school?.address || null,
    },
    student: {
      name: student.name,
      admission_no: student.admission_no,
      photo_url: student.photo_url,
    },
    classInfo: {
      className,
      position,
      totalStudents,
    },
    termInfo: {
      session: termLabel.split(" — ")[0] || termLabel,
      term: termLabel.split(" — ")[1] || "Terminal Report Card",
    },
    academic: {
      subjects: summary.totals.map(({ subject, total }) => {
        const pct = total !== null && maxTotal > 0 ? (total / maxTotal) * 100 : null;
        const gradeRow = pct !== null ? grading.find((g) => pct >= Number(g.minimum_score) && pct <= Number(g.maximum_score)) : null;
        return {
          id: subject.id,
          name: subject.name,
          total_score: total,
          grade: gradeRow?.grade || "N/A",
          remark: gradeRow?.remark || "Pending",
        };
      }),
      grandTotal: summary.grand,
      average: summary.average,
      overallGrade: summary.grade,
      maxPossibleTotal: maxTotal * summary.totals.length,
    },
    attendance: {
      daysOpened: isNaN(opened) ? null : opened,
      daysPresent: isNaN(present) ? null : present,
      daysAbsent: absent,
    },
    traits: {
      psychomotor: psychomotorTraits.map(t => ({
        name: t.name,
        score: ratingLabel(traitValues[`psychomotor|${t.id}`] || "")
      })),
      affective: affectiveTraits.map(t => ({
        name: t.name,
        score: ratingLabel(traitValues[`affective|${t.id}`] || "")
      })),
    },
    remarks: {
      teacher: remark,
      admin: adminRemark || null,
    },
    gradingScales: grading,
    isDraft: true,
  };

  const handleDownload = async () => {
    if (!containerRef.current) return;
    setDownloading(true);
    const html2pdf = (await import("html2pdf.js")).default;
    const element = containerRef.current.querySelector("#report-card-ui") as HTMLElement;
    if (!element) {
      setDownloading(false);
      return;
    }
    
    const opt = {
      margin: 0,
      filename: `${student.name.replace(/\s+/g, "_")}_ReportCard_Draft.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };
    
    html2pdf().from(element).set(opt as any).save().then(() => setDownloading(false)).catch(() => setDownloading(false));
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Report Card Preview" size="lg">
      <div className="flex justify-end mb-4 gap-2">
        <Button variant="ghost" onClick={onClose}>Close</Button>
        <Button variant="primary" onClick={handleDownload} loading={downloading}>
          Download PDF
        </Button>
      </div>
      
      {/* We wrap it in a scrollable container with a gray background so it looks like a paper document preview */}
      <div 
        ref={containerRef}
        className="bg-gray-100 overflow-x-auto py-8 flex justify-center border border-border rounded-sm"
      >
        <ReportCardUI data={data} />
      </div>
    </Modal>
  );
}
