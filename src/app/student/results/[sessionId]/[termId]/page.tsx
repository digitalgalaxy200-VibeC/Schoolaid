"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, Badge, Button } from "@/components/ui";
import { ReportCardUI } from "@/components/report-card/ReportCardUI";
import { ReportCardData } from "@/lib/types/report-card";
import { useRef } from "react";

interface ReportData {
  student: { admission_number: string; photo_url?: string | null; class_name?: string; gender?: string; dob?: string };
  school: {
    name?: string;
    logo_url?: string | null;
    address?: string;
    phone?: string;
    email?: string;
    motto?: string;
  };
  session: string;
  term: string;
  results: Array<{
    id: string;
    subject_id: string;
    subject_name?: string;
    subject_code?: string;
    total_score: number;
    grade: string;
    remark: string;
    subjects?: { name?: string } | null;
  }>;
  attendance: {
    days_school_opened: number;
    days_present: number;
    days_absent: number;
  } | null;
  psychomotor: Array<{ name: string; score: number | string }>;
  affective: Array<{ name: string; score: number | string }>;
  teacher_comment: string | null;
  admin_comment: string | null;
  grading_scales: Array<{
    grade: string;
    minimum_score: number;
    maximum_score: number;
    remark: string;
  }>;
  component_scores: Array<{
    subject_id: string;
    component_id: string;
    component_name: string;
    component_order: number;
    max_score: number;
    score: number;
  }>;
  position: number | null;
  totalStudents: number;
  settings: any;
  has_results: boolean;
  is_retracted?: boolean;
  retraction_reason?: string | null;
}

export default function ReportCardPage() {
  const params = useParams();
  const router = useRouter();
  const termId = params.termId as string;

  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [user, setUser] = useState<{ full_name?: string }>({});

  useEffect(() => {
    Promise.all([
      fetch("/api/auth/me").then((r) => r.json()),
      fetch(`/api/student/report-card/${termId}`).then((r) => {
        if (!r.ok) throw new Error("Failed to load report");
        return r.json();
      }),
    ])
      .then(([userData, reportData]) => {
        setUser(userData);
        setData(reportData);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [termId]);

  const containerRef = useRef<HTMLDivElement>(null);
  
  const handleDownload = async () => {
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
        filename: `${user.full_name?.replace(/\s+/g, "_") || "Student"}_${(data?.student?.class_name || "Class").replace(/\s+/g, "")}_${(data?.term || "Term").replace(/\s+/g, "_")}_ReportCard.pdf`,
        image: { type: 'jpeg' as const, quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' as const }
      };
      await html2pdf().set(opt).from(element).save();
    } catch (e) { console.error('PDF failed:', e); }
    clearTimeout(safety);
    setDownloading(false);
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="animate-spin h-6 w-6 border-2 border-success border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-text-muted mb-4">{error}</p>
        <button
          onClick={() => router.back()}
          className="text-small text-primary hover:underline"
        >
          Go back
        </button>
      </div>
    );
  }

  if (!data || !data.has_results) {
    return (
      <div className="text-center py-12 animate-fade-in">
        <div className="text-display mb-3 opacity-30">&#128218;</div>
        <h3 className="text-h3 font-bold text-text-primary mb-2">
          {data?.is_retracted ? "Temporarily Withdrawn" : "Not Yet Available"}
        </h3>
        <p className="text-body text-text-muted">
          {data?.is_retracted
            ? `This report card has been temporarily withdrawn by your school while corrections are being made.${data?.retraction_reason ? ` Reason: ${data.retraction_reason}` : ""} Please check back later.`
            : "Results for this term have not been published yet."
          }
        </p>
        <button
          onClick={() => router.push("/student/results")}
          className="mt-4 text-small text-primary hover:underline"
        >
          &larr; Back to Results
        </button>
      </div>
    );
  }
  const grandTotal = data.results.reduce((sum, r) => sum + (Number(r.total_score) || 0), 0);
  const maxPossibleTotal = data.results.length > 0 ? (data.grading_scales[0]?.maximum_score || 100) * data.results.length : 0;
  const average = data.results.length > 0 && maxPossibleTotal > 0 ? (grandTotal / maxPossibleTotal) * 100 : 0;
  const overallGradeRow = data.grading_scales.find(g => average >= Number(g.minimum_score) && average <= Number(g.maximum_score));

  const reportData: ReportCardData = {
    school: {
      name: data.school.name || "School",
      logo_url: data.school.logo_url || null,
      address: data.school.address || null,
      phone: data.school.phone || null,
      email: data.school.email || null,
      motto: data.school.motto || null,
    },
    student: {
      name: user.full_name || "Unknown",
      admission_no: data.student.admission_number || "—",
      photo_url: data.student.photo_url || null,
      gender: data.student.gender || null,
      dob: data.student.dob || null,
    },
    classInfo: {
      className: data.student.class_name || "—",
      position: data.position || null,
      totalStudents: data.totalStudents || 0,
    },
    termInfo: {
      session: data.session || "Session",
      term: data.term || "Term",
    },
    academic: {
      assessmentComponents: (() => {
        const unique = new Map<string, { id: string; name: string; max_score: number; order: number }>();
        for (const c of data.component_scores || []) {
          if (!unique.has(c.component_id)) {
            unique.set(c.component_id, { id: c.component_id, name: c.component_name, max_score: c.max_score, order: c.component_order });
          }
        }
        return Array.from(unique.values()).sort((a, b) => a.order - b.order);
      })(),
      subjects: data.results.map(r => {
        const compScores: Record<string, number | null> = {};
        for (const c of data.component_scores || []) {
          if (c.subject_id === r.subject_id || c.subject_id === r.id) {
            compScores[c.component_id] = c.score;
          }
        }
        return {
          id: r.id,
          name: r.subject_name || r.subjects?.name || "Unknown",
          total_score: r.total_score,
          grade: r.grade,
          remark: r.remark,
          component_scores: compScores,
        };
      }),
      grandTotal,
      average,
      overallGrade: overallGradeRow?.grade || "N/A",
      maxPossibleTotal,
    },
    attendance: {
      daysOpened: data.attendance?.days_school_opened ?? null,
      daysPresent: data.attendance?.days_present ?? null,
      daysAbsent: data.attendance?.days_absent ?? null,
    },
    traits: {
      psychomotor: data.psychomotor,
      affective: data.affective,
    },
    remarks: {
      teacher: data.teacher_comment,
      admin: data.admin_comment,
    },
    gradingScales: data.grading_scales,
    settings: data.settings,
    isDraft: false,
  };

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      {/* Header with back + download */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <button
            onClick={() => router.push("/student/results")}
            className="text-small text-primary hover:underline mb-1 inline-block"
          >
            &larr; Back to Results
          </button>
          <h1 className="text-h1 font-bold">Report Card</h1>
          <p className="text-small text-text-muted">
            {data.session} · {data.term}
          </p>
        </div>
        <Button onClick={handleDownload} loading={downloading}>
          {downloading ? "Generating PDF..." : "Download PDF"}
        </Button>
      </div>

      <div ref={containerRef} className="bg-gray-100 overflow-x-auto py-8 flex justify-center border border-border rounded-sm shadow-inner">
        <ReportCardUI data={reportData} />
      </div>
    </div>
  );
}
