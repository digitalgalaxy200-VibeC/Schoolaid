"use client";

import { useEffect, useState } from "react";
import { Badge, Card } from "@/components/ui";

type CbtOverview = {
  enabled: boolean;
  error: string | null;
  term: { id: string; name: string } | null;
  counts: {
    assessments: number;
    published: number;
    inProgress: number;
    questions: number;
    linkedQuestions: number;
    attempts: number;
    submitted: number;
    marked: number;
    openAttempts: number;
  };
  assessments: {
    id: string;
    title: string;
    status: string;
    className: string;
    subjectName: string | null;
    publishedAt: string | null;
    attempts: number;
    completed: number;
    inProgress: number;
  }[];
};

const STATUS_BADGE: Record<
  string,
  { variant: "default" | "success" | "warning" | "info" | "draft"; label: string }
> = {
  draft: { variant: "draft", label: "Draft" },
  review: { variant: "info", label: "In review" },
  published: { variant: "success", label: "Published" },
  archived: { variant: "default", label: "Archived" },
};

export default function SchoolAdminCbtPage() {
  const [overview, setOverview] = useState<CbtOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/school-admin/cbt/overview")
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body?.error || "Could not load CBT.");
        return body as CbtOverview;
      })
      .then((data) => {
        if (!cancelled) setOverview(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load CBT.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Loading CBT">
        <div className="h-16 skeleton rounded-lg" />
        <div className="h-40 skeleton rounded-lg" />
      </div>
    );
  }

  if (error || !overview) {
    return (
      <Card variant="default" className="text-center py-10">
        <h1 className="text-h3 font-bold mb-2">Could not load CBT</h1>
        <p className="text-small text-text-muted">{error || "No data was returned."}</p>
      </Card>
    );
  }

  if (!overview.enabled) {
    return (
      <Card variant="default" className="text-center py-10">
        <h1 className="text-h3 font-bold mb-2">CBT</h1>
        <p className="text-small text-text-muted max-w-md mx-auto">
          Computer-based testing is not enabled for this school. Teachers cannot
          create assessments until SchoolAid enables the CBT feature for your
          account.
        </p>
        {overview.error && (
          <p className="text-caption text-text-muted mt-3">{overview.error}</p>
        )}
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-h2 font-bold">CBT</h1>
        <p className="text-small text-text-muted mt-0.5">
          {overview.term ? `${overview.term.name} — ` : ""}
          oversight of computer-based tests. Teachers create and mark assessments
          in the teacher portal; this page does not duplicate that work.
        </p>
      </div>

      <div className="grid grid-cols-2 desktop:grid-cols-4 gap-3">
        <Card variant="default" padding="md">
          <p className="text-caption uppercase tracking-wide text-text-muted font-semibold">
            Assessments
          </p>
          <p className="text-h2 font-bold text-text-primary mt-0.5">
            {overview.counts.assessments}
          </p>
          <p className="text-caption text-text-muted">
            {overview.counts.published} published · {overview.counts.inProgress} in progress
          </p>
        </Card>
        <Card variant="default" padding="md">
          <p className="text-caption uppercase tracking-wide text-text-muted font-semibold">
            Questions
          </p>
          <p className="text-h2 font-bold text-text-primary mt-0.5">
            {overview.counts.questions}
          </p>
          <p className="text-caption text-text-muted">
            {overview.counts.linkedQuestions} attached to assessments
          </p>
        </Card>
        <Card variant="default" padding="md">
          <p className="text-caption uppercase tracking-wide text-text-muted font-semibold">
            Attempts
          </p>
          <p className="text-h2 font-bold text-text-primary mt-0.5">
            {overview.counts.attempts}
          </p>
          <p className="text-caption text-text-muted">
            {overview.counts.openAttempts} open
          </p>
        </Card>
        <Card variant="default" padding="md">
          <p className="text-caption uppercase tracking-wide text-text-muted font-semibold">
            Marked
          </p>
          <p className="text-h2 font-bold text-text-primary mt-0.5">
            {overview.counts.marked}
          </p>
          <p className="text-caption text-text-muted">
            {overview.counts.submitted} submitted, awaiting marks
          </p>
        </Card>
      </div>

      <Card variant="default" padding="md">
        <h2 className="text-h3 font-bold mb-1">
          {overview.term ? `${overview.term.name} assessments` : "All assessments"}
        </h2>
        <p className="text-caption text-text-muted mb-3">
          Attempt counts are for every student, including retakes.
        </p>

        {overview.assessments.length === 0 ? (
          <p className="text-small text-text-muted py-6 text-center">
            No assessments have been created for this term. Teachers create them
            from the CBT section of the teacher portal.
          </p>
        ) : (
          <div className="divide-y divide-border">
            {overview.assessments.map((assessment) => {
              const badge = STATUS_BADGE[assessment.status] || STATUS_BADGE.draft;
              return (
                <div key={assessment.id} className="py-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-small font-semibold text-text-primary truncate">
                        {assessment.title}
                      </p>
                      <p className="text-caption text-text-muted">
                        {assessment.className}
                        {assessment.subjectName ? ` · ${assessment.subjectName}` : ""}
                      </p>
                    </div>
                    <Badge variant={badge.variant}>{badge.label}</Badge>
                  </div>
                  <p className="text-caption text-text-muted mt-1">
                    {assessment.attempts} attempt{assessment.attempts === 1 ? "" : "s"} ·{" "}
                    {assessment.completed} completed
                    {assessment.inProgress > 0 ? ` · ${assessment.inProgress} in progress` : ""}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
