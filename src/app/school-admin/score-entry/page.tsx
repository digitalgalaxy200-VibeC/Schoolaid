"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui";
import type { DashboardSummary, ReadinessRow } from "@/lib/school-admin/dashboard-summary";

function ProgressBar({ percent }: { percent: number }) {
  const tone = percent >= 100 ? "bg-success" : percent >= 50 ? "bg-accent" : "bg-error";
  return (
    <div
      className="h-1.5 w-full rounded-full bg-border overflow-hidden"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
    >
      <div className={`h-full rounded-full ${tone}`} style={{ width: `${percent}%` }} />
    </div>
  );
}

function ReadinessRowView({ row }: { row: ReadinessRow }) {
  const measured = row.percent !== null;
  const missing = measured ? Math.max(0, row.expected - row.entered) : 0;

  return (
    <div className="py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-small font-semibold text-text-primary">{row.className}</p>
          <p className="text-caption text-text-muted">
            {row.studentCount} students · {row.subjectCount} subjects · {row.componentCount} components
          </p>
        </div>
        <span className={`text-small font-bold ${measured ? "text-text-primary" : "text-text-muted"}`}>
          {measured ? `${row.percent}%` : "Not configured"}
        </span>
      </div>

      <div className="mt-2">
        <ProgressBar percent={row.percent ?? 0} />
      </div>

      <p className="text-caption text-text-muted mt-1.5">
        {measured ? (
          <>
            {row.entered} of {row.expected} marks entered
            {missing > 0 ? ` · ${missing} still missing` : " · complete"}
          </>
        ) : row.componentCount === 0 ? (
          <>
            No assessment components are set up for this class.{" "}
            <Link href="/school-admin/assessment" className="text-primary hover:underline">
              Configure assessment
            </Link>
          </>
        ) : (
          "Assign students and subjects to this class to measure readiness."
        )}
      </p>
    </div>
  );
}

export default function ScoreEntryPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/school-admin/dashboard/summary")
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body?.error || "Could not load score entry status.");
        return body as DashboardSummary;
      })
      .then((data) => {
        if (!cancelled) setSummary(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load score entry status.");
        }
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
      <div className="space-y-4" aria-busy="true" aria-label="Loading score entry status">
        <div className="h-16 skeleton rounded-lg" />
        <div className="h-64 skeleton rounded-lg" />
      </div>
    );
  }

  if (error || !summary) {
    return (
      <Card variant="default" className="text-center py-10">
        <h1 className="text-h3 font-bold mb-2">Could not load score entry status</h1>
        <p className="text-small text-text-muted">{error || "No data was returned."}</p>
      </Card>
    );
  }

  if (!summary.term) {
    return (
      <Card variant="default" className="text-center py-10">
        <h1 className="text-h3 font-bold mb-2">Score Entry</h1>
        <p className="text-small text-text-muted mb-4">
          Marks are measured against the active term. Set a session and term first.
        </p>
        <Link
          href="/school-admin/sessions"
          className="inline-flex items-center justify-center font-semibold rounded-lg px-5 py-2.5 text-body min-h-[42px] bg-surface text-primary border border-primary hover:bg-primary-light"
        >
          Set up sessions &amp; terms
        </Link>
      </Card>
    );
  }

  const measured = summary.readiness.filter((row) => row.percent !== null);
  const overall =
    measured.length > 0
      ? Math.round(measured.reduce((sum, row) => sum + (row.percent ?? 0), 0) / measured.length)
      : null;
  const incomplete = summary.readiness.filter(
    (row) => row.percent !== null && row.percent < 100,
  ).length;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-h2 font-bold">Score Entry</h1>
        <p className="text-small text-text-muted mt-0.5">
          {summary.term.sessionName ? `${summary.term.sessionName} · ` : ""}
          {summary.term.name} — marks recorded against the marks expected for this term.
        </p>
      </div>

      <Card variant="default" padding="md">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-caption uppercase tracking-wide text-text-muted font-semibold">
              School-wide readiness
            </p>
            <p className="text-display font-extrabold text-primary">
              {overall === null ? "—" : `${overall}%`}
            </p>
            <p className="text-small text-text-muted">
              {incomplete > 0
                ? `${incomplete} class${incomplete === 1 ? "" : "es"} still have marks outstanding.`
                : "Every configured class has complete marks."}
            </p>
          </div>
          <Link
            href="/school-admin/report-cards"
            className="text-caption font-semibold text-primary hover:underline"
          >
            Go to report cards →
          </Link>
        </div>
      </Card>

      <Card variant="default" padding="md">
        {summary.readiness.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-small text-text-muted">
              No classes are set up for this term yet.
            </p>
            <Link
              href="/school-admin/classes"
              className="text-caption font-semibold text-primary hover:underline mt-2 inline-block"
            >
              Add classes →
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {summary.readiness.map((row) => (
              <ReadinessRowView key={row.classId} row={row} />
            ))}
          </div>
        )}
      </Card>

      <p className="text-caption text-text-muted">
        Readiness counts marks recorded for each student across the subjects and
        assessment components configured for their class. A class with no students,
        subjects or components is shown as &quot;Not configured&quot; rather than 0%.
      </p>
    </div>
  );
}
