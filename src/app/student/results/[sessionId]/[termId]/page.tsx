"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, Badge, Button } from "@/components/ui";

interface ReportData {
  student: { admission_number: string };
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
  psychomotor: Array<{ name: string; score: number }>;
  affective: Array<{ name: string; score: number }>;
  teacher_comment: string | null;
  admin_comment: string | null;
  grading_scales: Array<{
    grade: string;
    minimum_score: number;
    maximum_score: number;
    remark: string;
  }>;
  has_results: boolean;
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

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const res = await fetch("/api/student/generate-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ termId }),
      });
      const result = await res.json();
      if (result.downloadUrl) {
        window.open(result.downloadUrl, "_blank");
      } else {
        setError(result.error || "Download failed");
      }
    } catch {
      setError("Download failed");
    } finally {
      setDownloading(false);
    }
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
          Not Yet Available
        </h3>
        <p className="text-body text-text-muted">
          Results for this term have not been published yet.
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

  return (
    <div className="space-y-6 animate-fade-in">
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

      {/* School Header */}
      <Card variant="bordered" className="shadow-sm">
        <div className="p-5 flex items-center gap-4">
          {data.school.logo_url && (
            <img
              src={data.school.logo_url}
              alt={data.school.name}
              className="w-14 h-14 rounded-lg object-contain bg-white p-1 border border-border"
            />
          )}
          <div>
            <h2 className="text-h3 font-bold text-primary">{data.school.name}</h2>
            {data.school.motto && (
              <p className="text-small text-text-muted italic">
                &ldquo;{data.school.motto}&rdquo;
              </p>
            )}
            {data.school.address && (
              <p className="text-caption text-text-muted">{data.school.address}</p>
            )}
          </div>
        </div>
      </Card>

      {/* Student Info + Attendance */}
      <Card variant="bordered" className="shadow-sm">
        <div className="p-5">
          <div className="flex justify-between flex-wrap gap-4 mb-4">
            <div>
              <p className="text-caption text-text-muted">Student Name</p>
              <p className="font-semibold">{user.full_name || "—"}</p>
            </div>
            <div>
              <p className="text-caption text-text-muted">Admission Number</p>
              <p className="font-semibold">{data.student.admission_number}</p>
            </div>
            <div>
              <p className="text-caption text-text-muted">Session</p>
              <p className="font-semibold">{data.session}</p>
            </div>
            <div>
              <p className="text-caption text-text-muted">Term</p>
              <Badge variant="info">{data.term}</Badge>
            </div>
          </div>

          {data.attendance && (
            <div className="flex gap-6 pt-3 border-t border-border">
              <div className="text-center">
                <p className="text-display font-extrabold text-primary">
                  {data.attendance.days_school_opened}
                </p>
                <p className="text-caption text-text-muted">Days Opened</p>
              </div>
              <div className="text-center">
                <p className="text-display font-extrabold text-success">
                  {data.attendance.days_present}
                </p>
                <p className="text-caption text-text-muted">Days Present</p>
              </div>
              <div className="text-center">
                <p className="text-display font-extrabold text-error">
                  {data.attendance.days_absent}
                </p>
                <p className="text-caption text-text-muted">Days Absent</p>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Subject Results Table */}
      <Card variant="bordered" className="shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-primary text-text-inverse">
                <th className="text-left px-4 py-3 text-small font-semibold">
                  Subject
                </th>
                <th className="text-center px-4 py-3 text-small font-semibold">
                  Total Score
                </th>
                <th className="text-center px-4 py-3 text-small font-semibold">
                  Grade
                </th>
                <th className="text-left px-4 py-3 text-small font-semibold">
                  Remark
                </th>
              </tr>
            </thead>
            <tbody>
              {data.results.map((row, i) => (
                <tr
                  key={row.id}
                  className={`border-b border-border ${
                    i % 2 === 0 ? "bg-surface" : "bg-bg"
                  }`}
                >
                  <td className="px-4 py-3 text-body font-medium">
                    {row.subjects?.name || "—"}
                  </td>
                  <td className="px-4 py-3 text-center text-body">
                    {row.total_score}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Badge variant="success">{row.grade}</Badge>
                  </td>
                  <td className="px-4 py-3 text-small text-text-secondary">
                    {row.remark}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Psychomotor & Affective */}
      <div className="grid gap-4 sm:grid-cols-2">
        {data.psychomotor.length > 0 && (
          <Card variant="bordered" className="shadow-sm">
            <div className="p-5">
              <h3 className="text-h3 font-bold mb-3">Psychomotor Skills</h3>
              <div className="space-y-2">
                {data.psychomotor.map((item, i) => (
                  <div
                    key={i}
                    className="flex justify-between py-1.5 border-b border-border last:border-0"
                  >
                    <span className="text-small text-text-secondary">
                      {item.name}
                    </span>
                    <span className="text-small font-semibold">
                      {item.score}/5
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        )}

        {data.affective.length > 0 && (
          <Card variant="bordered" className="shadow-sm">
            <div className="p-5">
              <h3 className="text-h3 font-bold mb-3">Affective Traits</h3>
              <div className="space-y-2">
                {data.affective.map((item, i) => (
                  <div
                    key={i}
                    className="flex justify-between py-1.5 border-b border-border last:border-0"
                  >
                    <span className="text-small text-text-secondary">
                      {item.name}
                    </span>
                    <span className="text-small font-semibold">
                      {item.score}/5
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        )}
      </div>

      {/* Comments */}
      {(data.teacher_comment || data.admin_comment) && (
        <Card variant="bordered" className="shadow-sm">
          <div className="p-5 space-y-4">
            {data.teacher_comment && (
              <div>
                <h3 className="text-small font-bold text-primary uppercase mb-1">
                  Teacher&apos;s Comment
                </h3>
                <p className="text-body text-text-secondary">
                  {data.teacher_comment}
                </p>
              </div>
            )}
            {data.admin_comment && (
              <div>
                <h3 className="text-small font-bold text-primary uppercase mb-1">
                  Principal&apos;s Comment
                </h3>
                <p className="text-body text-text-secondary">
                  {data.admin_comment}
                </p>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Grading Key */}
      {data.grading_scales.length > 0 && (
        <Card variant="bordered" className="shadow-sm">
          <div className="p-5">
            <h3 className="text-small font-bold text-text-muted uppercase mb-3">
              Grading System
            </h3>
            <div className="grid gap-2 sm:grid-cols-2">
              {data.grading_scales.map((g, i) => (
                <div key={i} className="flex items-center gap-3 text-small">
                  <Badge variant="success">{g.grade}</Badge>
                  <span className="text-text-muted">
                    {g.minimum_score} – {g.maximum_score}
                  </span>
                  <span className="text-text-secondary">{g.remark}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
