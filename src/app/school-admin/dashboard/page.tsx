"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button, Card } from "@/components/ui";
import { ShareAccessModal } from "@/components/school-admin/ShareAccessModal";
import { formatDate } from "@/lib/dates";
import type {
  DashboardSummary,
  FinanceSummary,
  ReadinessRow,
} from "@/lib/school-admin/dashboard-summary";
import type { TermProgress } from "@/lib/school-admin/term";

const LINK_BUTTON =
  "inline-flex items-center justify-center gap-2 font-semibold rounded-lg px-5 py-2.5 text-body min-h-[42px] bg-surface text-primary border border-primary hover:bg-primary-light transition-colors";

const QUICK_ACTION =
  "block rounded-lg border border-border bg-surface px-4 py-3 text-small font-semibold text-text-primary hover:border-primary hover:text-primary transition-colors";

function termProgressLabel(progress: TermProgress | null): string {
  if (!progress) return "";
  if (progress.status === "upcoming") {
    return `Starts in ${progress.daysRemaining} day${progress.daysRemaining === 1 ? "" : "s"}`;
  }
  if (progress.status === "ended") return "Term ended";
  return `Week ${progress.week} of ${progress.totalWeeks} · ${progress.daysRemaining} day${
    progress.daysRemaining === 1 ? "" : "s"
  } left`;
}

function ProgressBar({ percent }: { percent: number }) {
  const tone =
    percent >= 100 ? "bg-success" : percent >= 50 ? "bg-accent" : "bg-error";
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

function AttentionCard({
  label,
  value,
  hint,
  href,
  action,
}: {
  label: string;
  value: string | number;
  hint: string;
  href: string;
  action: string;
}) {
  return (
    <Link
      href={href}
      className="block rounded-lg border border-border bg-surface p-4 hover:border-primary transition-colors"
    >
      <p className="text-h3 font-bold text-text-primary">{value}</p>
      <p className="text-small font-semibold text-text-primary mt-1">{label}</p>
      <p className="text-caption text-text-muted mt-0.5">{hint}</p>
      <span className="text-caption font-semibold text-primary mt-2 inline-block">
        {action} →
      </span>
    </Link>
  );
}

function ReadinessRowView({ row }: { row: ReadinessRow }) {
  const measured = row.percent !== null;
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-small font-medium text-text-primary truncate">{row.className}</span>
        <span className={`text-caption font-semibold ${measured ? "text-text-primary" : "text-text-muted"}`}>
          {measured ? `${row.percent}%` : "Not configured"}
        </span>
      </div>
      <div className="mt-1.5">
        <ProgressBar percent={row.percent ?? 0} />
      </div>
      <p className="text-caption text-text-muted mt-1">
        {measured
          ? `${row.entered} of ${row.expected} marks entered · ${row.studentCount} students, ${row.subjectCount} subjects`
          : row.componentCount === 0
            ? "No assessment components are set up for this class yet."
            : "No subjects or students are assigned to this class yet."}
      </p>
    </div>
  );
}

export default function SchoolAdminDashboard() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [financeState, setFinanceState] = useState<{
    termId: string;
    data: FinanceSummary;
  } | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [openingTeacherView, setOpeningTeacherView] = useState(false);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/school-admin/dashboard/summary")
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) {
          throw new Error(body?.error || "Could not load the dashboard.");
        }
        return body as DashboardSummary;
      })
      .then((data) => {
        if (!cancelled) setSummary(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load the dashboard.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const termId = summary?.term?.id ?? null;
  const finance = financeState?.termId === termId ? financeState.data : null;

  useEffect(() => {
    if (!termId) return;
    let cancelled = false;

    fetch(`/api/school-admin/finance/dashboard?term_id=${encodeURIComponent(termId)}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!cancelled && data && typeof data.expected === "number") {
          setFinanceState({ termId, data: data as FinanceSummary });
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [termId]);

  const openTeacherView = async () => {
    setOpeningTeacherView(true);
    const res = await fetch("/api/super-admin/impersonate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "teacher" }),
    });
    if (res.ok) {
      const data = await res.json();
      window.location.href = data.redirect || "/teacher/dashboard";
      return;
    }
    setOpeningTeacherView(false);
  };

  if (loading) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Loading dashboard">
        <div className="h-20 skeleton rounded-lg" />
        <div className="h-36 skeleton rounded-lg" />
        <div className="grid grid-cols-1 tablet:grid-cols-2 gap-4">
          <div className="h-48 skeleton rounded-lg" />
          <div className="h-48 skeleton rounded-lg" />
        </div>
      </div>
    );
  }

  if (error || !summary) {
    return (
      <Card variant="default" className="text-center py-10">
        <h1 className="text-h3 font-bold mb-2">Could not load your dashboard</h1>
        <p className="text-small text-text-muted mb-4">{error || "No data was returned."}</p>
        <Button
          variant="secondary"
          onClick={() => {
            setLoading(true);
            setError(null);
            setReloadKey((key) => key + 1);
          }}
        >
          Try again
        </Button>
      </Card>
    );
  }

  const { school, term, counts } = summary;
  const loginPath = school.slug ? `/school/${school.slug}/login` : "/login";

  const missingScores = summary.readiness.filter(
    (row) => row.percent !== null && row.percent < 100,
  );
  const pendingCards = summary.needsAttention.pendingReportCards;
  const studentsWithoutClass = summary.needsAttention.studentsWithoutClass;
  const outstanding = finance?.outstandingAmount ?? 0;
  const unmarkedAttendance = summary.attendance.unmarkedClasses;
  const attentionTotal =
    missingScores.length +
    pendingCards.length +
    studentsWithoutClass +
    unmarkedAttendance.length +
    (outstanding > 0 ? 1 : 0);

  const measured = summary.readiness.filter((row) => row.percent !== null);
  const overallReadiness =
    measured.length > 0
      ? Math.round(
          measured.reduce((sum, row) => sum + (row.percent ?? 0), 0) / measured.length,
        )
      : null;

  const setupIncomplete = summary.setup && summary.setup.percent < 100;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-h1 font-bold">{school.name} Dashboard</h1>
          {school.motto && (
            <p className="text-small text-text-muted italic mt-1">&quot;{school.motto}&quot;</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {summary.impersonated && (
            <Button
              variant="accent"
              size="sm"
              onClick={openTeacherView}
              loading={openingTeacherView}
              title="Open the teacher view for this school"
            >
              Open teacher view
            </Button>
          )}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShareOpen(true)}
            icon={
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
            }
          >
            Share access
          </Button>
        </div>
      </div>

      {/* Current session and term — the frame every school decision sits in. */}
      <Card variant="default" padding="md">
        {term ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-caption uppercase tracking-wide text-text-muted font-semibold">
                Current term
              </p>
              <p className="text-h3 font-bold text-text-primary truncate">
                {term.sessionName ? `${term.sessionName} · ` : ""}
                {term.name}
              </p>
              <p className="text-small text-text-muted mt-0.5">
                {termProgressLabel(term.progress)}
                {term.progress?.status === "active" && (
                  <> · ends {formatDate(term.endDate)}</>
                )}
              </p>
            </div>
            <Link href="/school-admin/sessions" className="text-caption font-semibold text-primary hover:underline">
              Term settings →
            </Link>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-caption uppercase tracking-wide text-text-muted font-semibold">
                Current term
              </p>
              <p className="text-h3 font-bold text-text-primary">No active term</p>
              <p className="text-small text-text-muted mt-0.5">
                Set a session and term before entering marks, report cards or fees.
              </p>
            </div>
            <Link href="/school-admin/sessions" className={LINK_BUTTON}>
              Set up sessions &amp; terms
            </Link>
          </div>
        )}
      </Card>

      {/* Needs attention */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-h2 font-bold">Needs attention</h2>
            <p className="text-small text-text-muted">
              {attentionTotal > 0
                ? `${attentionTotal} item${attentionTotal === 1 ? "" : "s"} need a decision.`
                : "Nothing needs your attention right now."}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 desktop:grid-cols-5 gap-3">
          <AttentionCard
            label="Classes missing marks"
            value={missingScores.length}
            hint={
              missingScores.length > 0
                ? `${missingScores[0].className} is at ${missingScores[0].percent}%`
                : "All configured classes have complete marks"
            }
            href="/school-admin/score-entry"
            action="Review marks"
          />
          <AttentionCard
            label="Report cards awaiting approval"
            value={pendingCards.length}
            hint={
              pendingCards.length > 0
                ? `${pendingCards[0].className} was submitted${pendingCards[0].submittedBy ? ` by ${pendingCards[0].submittedBy}` : ""}`
                : "No classes are waiting for review"
            }
            href="/school-admin/report-cards"
            action="Review report cards"
          />
          <AttentionCard
            label="Students without a class"
            value={studentsWithoutClass}
            hint={
              studentsWithoutClass > 0
                ? "They will be missing marks, report cards and bills"
                : "Every active student is in a class"
            }
            href="/school-admin/students"
            action="Assign students"
          />
          <AttentionCard
            label="Classes without attendance today"
            value={unmarkedAttendance.length}
            hint={
              unmarkedAttendance.length > 0
                ? `${unmarkedAttendance[0].className} has no register yet`
                : "Every class with students has a register"
            }
            href="/school-admin/teachers"
            action="Follow up"
          />
          <AttentionCard
            label="Outstanding fees this term"
            value={finance ? finance.outstanding : "—"}
            hint={
              finance
                ? `${finance.student_counts.unpaid + finance.student_counts.partial} of ${finance.student_counts.total} students have a balance`
                : term
                  ? "Loading fee figures…"
                  : "Needs an active term"
            }
            href="/school-admin/finance"
            action="Open finance"
          />
        </div>
      </section>

      <div className="grid grid-cols-1 desktop:grid-cols-2 gap-4">
        {/* Results readiness */}
        <Card variant="default" padding="md">
          <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
            <div>
              <h2 className="text-h3 font-bold">Results readiness</h2>
              <p className="text-caption text-text-muted mt-0.5">
                Marks recorded against the marks expected for the term.
              </p>
            </div>
            {overallReadiness !== null && (
              <span className="text-caption font-semibold text-text-primary">
                School-wide {overallReadiness}%
              </span>
            )}
          </div>

          {summary.readiness.length === 0 ? (
            <p className="text-small text-text-muted">
              Add classes and assign subjects to see readiness.{" "}
              <Link href="/school-admin/classes" className="text-primary hover:underline">
                Go to classes
              </Link>
            </p>
          ) : (
            <div className="space-y-4 max-h-80 overflow-auto pr-1">
              {summary.readiness.map((row) => (
                <ReadinessRowView key={row.classId} row={row} />
              ))}
            </div>
          )}

          <div className="mt-4 pt-3 border-t border-border">
            <Link href="/school-admin/score-entry" className="text-caption font-semibold text-primary hover:underline">
              Open score entry →
            </Link>
          </div>
        </Card>

        <div className="space-y-4">
        {/* Fees */}
        <Card variant="default" padding="md">
          <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
            <div>
              <h2 className="text-h3 font-bold">Fees this term</h2>
              <p className="text-caption text-text-muted mt-0.5">
                Billed, collected and still outstanding.
              </p>
            </div>
            <Link href="/school-admin/finance" className="text-caption font-semibold text-primary hover:underline">
              Finance →
            </Link>
          </div>

          {!term ? (
            <p className="text-small text-text-muted">Set an active term to see fee totals.</p>
          ) : !finance ? (
            <p className="text-small text-text-muted">Loading fee figures…</p>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <p className="text-caption uppercase tracking-wide text-text-muted font-semibold">Billed</p>
                  <p className="text-h3 font-bold text-text-primary mt-0.5">{finance.totalCharged}</p>
                </div>
                <div>
                  <p className="text-caption uppercase tracking-wide text-text-muted font-semibold">Collected</p>
                  <p className="text-h3 font-bold text-success mt-0.5">{finance.totalCollected}</p>
                </div>
                <div>
                  <p className="text-caption uppercase tracking-wide text-text-muted font-semibold">Outstanding</p>
                  <p className="text-h3 font-bold text-error mt-0.5">{finance.outstanding}</p>
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between text-caption mb-1">
                  <span className="text-text-muted">Collection rate</span>
                  <span className="font-semibold text-text-primary">{finance.collectionRate}%</span>
                </div>
                <ProgressBar percent={finance.collectionRate} />
              </div>
              <p className="text-caption text-text-muted">
                {finance.student_counts.paid} paid · {finance.student_counts.partial} part-paid ·{" "}
                {finance.student_counts.unpaid} unpaid
              </p>
            </div>
          )}
        </Card>

        {/* Today's daily register */}
        <Card variant="default" padding="md">
          <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
            <div>
              <h2 className="text-h3 font-bold">Attendance today</h2>
              <p className="text-caption text-text-muted mt-0.5">
                {formatDate(summary.attendance.date)} · daily register
              </p>
            </div>
            {summary.attendance.rate !== null && (
              <span className="text-h3 font-bold text-primary">{summary.attendance.rate}%</span>
            )}
          </div>

          {summary.attendance.marked === 0 ? (
            <p className="text-small text-text-muted">No attendance has been marked today.</p>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <p className="text-caption uppercase tracking-wide text-text-muted font-semibold">Present</p>
                  <p className="text-h3 font-bold text-success mt-0.5">{summary.attendance.present}</p>
                </div>
                <div>
                  <p className="text-caption uppercase tracking-wide text-text-muted font-semibold">Absent</p>
                  <p className="text-h3 font-bold text-error mt-0.5">{summary.attendance.absent}</p>
                </div>
                <div>
                  <p className="text-caption uppercase tracking-wide text-text-muted font-semibold">Marked</p>
                  <p className="text-h3 font-bold text-text-primary mt-0.5">{summary.attendance.marked}</p>
                </div>
              </div>
              <p className="text-caption text-text-muted mt-2">
                {summary.attendance.late} late · {summary.attendance.excused} excused
              </p>
            </>
          )}

          {summary.attendance.unmarkedClasses.length > 0 ? (
            <div className="mt-3 pt-3 border-t border-border">
              <p className="text-caption text-text-muted">
                No register:{" "}
                {summary.attendance.unmarkedClasses.slice(0, 3).map((cls) => cls.className).join(", ")}
                {summary.attendance.unmarkedClasses.length > 3
                  ? ` +${summary.attendance.unmarkedClasses.length - 3} more`
                  : ""}
              </p>
              <Link
                href="/school-admin/teachers"
                className="text-caption font-semibold text-primary hover:underline"
              >
                Follow up with teachers →
              </Link>
            </div>
          ) : (
            <p className="text-caption text-success mt-3">
              Every class with students has a register today.
            </p>
          )}
        </Card>
        </div>
      </div>

      {/* Quick actions */}
      <section className="space-y-3">
        <h2 className="text-h2 font-bold">Quick actions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 desktop:grid-cols-4 gap-3">
          <Link href="/school-admin/students?new=1" className={QUICK_ACTION}>
            Add student
          </Link>
          <Link href="/school-admin/finance/payments" className={QUICK_ACTION}>
            Record payment
          </Link>
          <Link href="/school-admin/report-cards" className={QUICK_ACTION}>
            Review report cards
          </Link>
          <Link href="/school-admin/classes" className={QUICK_ACTION}>
            View all classes
          </Link>
        </div>
      </section>

      {/* Setup checklist */}
      {setupIncomplete && summary.setup && (
        <Card variant="default" padding="md">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="text-h3 font-bold">Finish setting up</h2>
              <p className="text-caption text-text-muted mt-0.5">
                {summary.setup.requiredComplete} of {summary.setup.requiredTotal} required steps complete.
              </p>
            </div>
            <span className="text-h3 font-bold text-primary">{summary.setup.percent}%</span>
          </div>
          <div className="mt-3">
            <ProgressBar percent={summary.setup.percent} />
          </div>
          {summary.setup.next.length > 0 && (
            <ul className="mt-4 divide-y divide-border">
              {summary.setup.next.map((item) => (
                <li key={item.id} className="py-2.5 flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-small font-medium text-text-primary">{item.label}</p>
                    <p className="text-caption text-text-muted">{item.detail}</p>
                  </div>
                  <Link href={item.href} className="text-caption font-semibold text-primary hover:underline shrink-0">
                    {item.action} →
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {/* At a glance — small, clickable counts */}
      <section>
        <h2 className="text-h2 font-bold mb-3">At a glance</h2>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Classes", value: counts.classes, href: "/school-admin/classes" },
            { label: "Teachers", value: counts.teachers, href: "/school-admin/teachers" },
            { label: "Students", value: counts.students, href: "/school-admin/students" },
          ].map((stat) => (
            <Link
              key={stat.label}
              href={stat.href}
              className="rounded-lg border border-border bg-surface px-4 py-3 text-center hover:border-primary transition-colors"
            >
              <p className="text-h2 font-bold text-text-primary">{stat.value}</p>
              <p className="text-caption text-text-muted">{stat.label}</p>
            </Link>
          ))}
        </div>
      </section>

      <ShareAccessModal
        isOpen={shareOpen}
        onClose={() => setShareOpen(false)}
        schoolName={school.name}
        loginPath={loginPath}
      />
    </div>
  );
}
