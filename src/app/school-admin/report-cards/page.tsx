"use client";
import { useCallback, useEffect, useState } from "react";
import { Badge, Card } from "@/components/ui";
import { ReviewDetail } from "./ReviewDetail";

type ClassRow = {
  id: string; name: string; grade: string; formTeacher: string; studentCount: number;
  status: string; submittedAt: string | null; submittedBy: string | null; reviewedAt: string | null;
};

const STATUS_BADGE: Record<string, { variant: "draft" | "warning" | "success" | "info" | "error"; label: string }> = {
  not_started: { variant: "draft", label: "Not Started" },
  draft: { variant: "warning", label: "In Progress" },
  pending_approval: { variant: "info", label: "Submitted" },
  approved: { variant: "success", label: "Approved" },
  published: { variant: "success", label: "Published" },
  retracted: { variant: "warning", label: "Retracted" },
  returned: { variant: "error", label: "Returned" },
};

export default function ReportCardReviewPage() {
  const [loading, setLoading] = useState(true);
  const [activeTerm, setActiveTerm] = useState<{ id: string; name: string; session_name: string } | null>(null);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const loadList = useCallback(() => {
    setLoading(true);
    fetch("/api/school-admin/report-card-review")
      .then((r) => r.json())
      .then((d) => { setActiveTerm(d.activeTerm || null); setClasses(d.classes || []); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadList(); }, [loadList]);

  const openClass = async (id: string) => {
    setSelected(id);
    setDetailLoading(true);
    const res = await fetch(`/api/school-admin/report-card-review/${id}`);
    const d = await res.json();
    setDetail(res.ok ? d : null);
    setDetailLoading(false);
  };

  const closeDetail = () => { setSelected(null); setDetail(null); loadList(); };

  if (loading) return <p className="text-text-muted text-small py-8 text-center">Loading…</p>;

  if (!activeTerm)
    return (
      <Card variant="default" className="text-center py-10">
        <h2 className="text-h3 font-bold mb-2">Report Cards</h2>
        <p className="text-small text-error">No active academic term is configured.</p>
      </Card>
    );

  if (selected) {
    if (detailLoading) return <p className="text-text-muted text-small py-8 text-center">Loading…</p>;
    if (!detail) return <p className="text-error text-small py-8 text-center">Failed to load this class.</p>;
    return <ReviewDetail detail={detail} onDone={closeDetail} />;
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-h2 font-bold">Report Cards</h1>
        <p className="text-small text-text-muted">{activeTerm.session_name} — {activeTerm.name} · Review and approve report cards submitted by Class Teachers.</p>
      </div>

      {classes.length === 0 ? (
        <Card variant="default" className="text-center py-10">
          <p className="text-small text-text-muted">No classes with an assigned Class Teacher yet.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 tablet:grid-cols-2 gap-3">
          {classes.map((c) => {
            const b = STATUS_BADGE[c.status] || STATUS_BADGE.not_started;
            return (
              <button
                key={c.id}
                onClick={() => openClass(c.id)}
                className="text-left border border-border rounded-sm bg-surface p-4 hover:border-primary cursor-pointer transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold">{c.name}</span>
                  <Badge variant={b.variant}>{b.label}</Badge>
                </div>
                <p className="text-caption text-text-muted mt-1">{c.grade} · {c.studentCount} students · Form Teacher: {c.formTeacher}</p>
                {c.submittedAt && (
                  <p className="text-caption text-text-muted mt-1">
                    Submitted by {c.submittedBy || "—"} on {new Date(c.submittedAt).toLocaleString()}
                  </p>
                )}
                <p className="text-caption text-primary mt-2 font-medium">Click to review →</p>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
