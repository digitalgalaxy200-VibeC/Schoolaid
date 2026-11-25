"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge, Button, Card } from "@/components/ui";
import { ShareAccessModal } from "@/components/school-admin/ShareAccessModal";
import type { DashboardSummary } from "@/lib/school-admin/dashboard-summary";

type TermRow = {
  id: string;
  name: string;
  session_name: string | null;
  start_date: string;
  end_date: string;
  is_active: boolean;
};

const STEPS = ["Term", "People", "Setup & access", "Start"];

function termLabel(term: TermRow): string {
  return `${term.session_name ? `${term.session_name} — ` : ""}${term.name}`;
}

function CheckRow({
  done,
  title,
  detail,
  href,
  action,
}: {
  done: boolean;
  title: string;
  detail: string;
  href?: string;
  action?: string;
}) {
  return (
    <li className="py-3 flex flex-wrap items-center justify-between gap-2">
      <div className="min-w-0">
        <p className="text-small font-medium text-text-primary flex items-center gap-2">
          <span
            className={`inline-block w-2 h-2 rounded-full ${done ? "bg-success" : "bg-warning"}`}
            aria-hidden="true"
          />
          {title}
        </p>
        <p className="text-caption text-text-muted">{detail}</p>
      </div>
      {done ? (
        <Badge variant="success">Ready</Badge>
      ) : href ? (
        <Link href={href} className="text-caption font-semibold text-primary hover:underline shrink-0">
          {action || "Fix"} →
        </Link>
      ) : (
        <Badge variant="warning">To do</Badge>
      )}
    </li>
  );
}

export default function BeginningOfTermWizardPage() {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [terms, setTerms] = useState<TermRow[]>([]);
  const [termId, setTermId] = useState("");
  const [activating, setActivating] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function fetchSummary(): Promise<DashboardSummary> {
    const response = await fetch("/api/school-admin/dashboard/summary");
    const body = await response.json();
    if (!response.ok) throw new Error(body?.error || "Could not read the term setup.");
    return body as DashboardSummary;
  }

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      fetch("/api/school-admin/terms").then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body?.error || "Could not load terms.");
        return (Array.isArray(body) ? body : []) as TermRow[];
      }),
      fetchSummary(),
    ])
      .then(([termRows, data]) => {
        if (cancelled) return;
        setTerms(termRows);
        setSummary(data);
        const active = termRows.find((term) => term.is_active);
        setTermId(data.term?.id || active?.id || termRows[0]?.id || "");
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load the wizard.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const selectedTerm = terms.find((term) => term.id === termId) || null;
  const activeTerm = terms.find((term) => term.is_active) || null;
  const isActive = !!selectedTerm && selectedTerm.is_active;

  async function activateTerm() {
    if (!termId) return;
    setActivating(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/school-admin/terms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: termId, is_active: true }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || "Could not activate the term.");

      setTerms((current) => current.map((term) => ({ ...term, is_active: term.id === termId })));
      const updated = await fetchSummary();
      setSummary(updated);
      setMessage(`${selectedTerm ? termLabel(selectedTerm) : "The term"} is now active.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not activate the term.");
    } finally {
      setActivating(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Loading beginning-of-term wizard">
        <div className="h-16 skeleton rounded-lg" />
        <div className="h-64 skeleton rounded-lg" />
      </div>
    );
  }

  const counts = summary?.counts;
  const setup = summary?.setup;
  const setupReady = !!setup && setup.percent >= 100;
  const unassigned = summary?.needsAttention.studentsWithoutClass ?? 0;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-h2 font-bold">Beginning of Term</h1>
        <p className="text-small text-text-muted mt-0.5">
          Activate the term, check that people and classes are in place, and give
          teachers what they need to start.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {STEPS.map((label, index) => {
          const number = index + 1;
          const active = step === number;
          const done = step > number;
          return (
            <span
              key={label}
              className={`px-2.5 py-1 rounded-full text-caption font-semibold ${
                active
                  ? "bg-primary text-white"
                  : done
                    ? "bg-success-bg text-success"
                    : "bg-bg text-text-muted border border-border"
              }`}
            >
              {number}. {label}
            </span>
          );
        })}
      </div>

      {error && (
        <div className="bg-error-bg border border-error rounded-lg px-4 py-3">
          <p className="text-small text-error font-medium">{error}</p>
        </div>
      )}
      {message && (
        <div className="bg-success-bg border border-success rounded-lg px-4 py-3">
          <p className="text-small text-success font-medium">{message}</p>
        </div>
      )}

      {step === 1 && (
        <Card variant="default" padding="md">
          <h2 className="text-h3 font-bold mb-1">Which term are you opening?</h2>
          <p className="text-small text-text-muted mb-4">
            The active term is the one attendance, marks, report cards and fees use.
            Only one term can be active at a time.
          </p>

          {terms.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-small text-text-muted mb-3">
                There are no terms yet. Create the session and its terms first.
              </p>
              <Link href="/school-admin/sessions" className="text-caption font-semibold text-primary hover:underline">
                Sessions &amp; terms →
              </Link>
            </div>
          ) : (
            <>
              <label className="block">
                <span className="text-caption font-medium text-text-primary block mb-1">Term</span>
                <select
                  value={termId}
                  onChange={(event) => setTermId(event.target.value)}
                  className="w-full h-11 px-3 border border-border rounded-lg bg-surface text-small text-text-primary focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                >
                  {terms.map((term) => (
                    <option key={term.id} value={term.id}>
                      {termLabel(term)}
                      {term.is_active ? " (active)" : ""}
                    </option>
                  ))}
                </select>
              </label>

              <p className="text-caption text-text-muted mt-3">
                {isActive
                  ? "This term is already active."
                  : activeTerm
                    ? `The current active term is ${termLabel(activeTerm)}. Activating another term moves the whole school to it.`
                    : "No term is active right now."}
              </p>

              {!isActive && (
                <div className="flex justify-end mt-4">
                  <Button onClick={activateTerm} loading={activating} disabled={!termId}>
                    Activate this term
                  </Button>
                </div>
              )}
            </>
          )}

          <div className="flex justify-end mt-4">
            <Button variant={isActive ? "primary" : "secondary"} onClick={() => setStep(2)} disabled={!termId}>
              Continue
            </Button>
          </div>
        </Card>
      )}

      {step === 2 && (
        <Card variant="default" padding="md">
          <h2 className="text-h3 font-bold mb-1">People and classes</h2>
          <p className="text-small text-text-muted mb-3">
            A term starts with a class for every student and a teacher for every
            class.
          </p>

          <ul className="divide-y divide-border">
            <CheckRow
              done={(counts?.classes ?? 0) > 0}
              title="Classes"
              detail={`${counts?.classes ?? 0} class${counts?.classes === 1 ? "" : "es"} set up`}
              href="/school-admin/classes"
              action="Add classes"
            />
            <CheckRow
              done={(counts?.teachers ?? 0) > 0}
              title="Teachers"
              detail={`${counts?.teachers ?? 0} active teacher${counts?.teachers === 1 ? "" : "s"}`}
              href="/school-admin/teachers"
              action="Add teachers"
            />
            <CheckRow
              done={(counts?.students ?? 0) > 0}
              title="Students"
              detail={`${counts?.students ?? 0} active student${counts?.students === 1 ? "" : "s"}`}
              href="/school-admin/students?new=1"
              action="Add students"
            />
            <CheckRow
              done={unassigned === 0}
              title="Every student has a class"
              detail={
                unassigned === 0
                  ? "No student is waiting for a class."
                  : `${unassigned} student${unassigned === 1 ? "" : "s"} have no class and will be invisible to attendance and report cards.`
              }
              href="/school-admin/students"
              action="Assign students"
            />
          </ul>

          <div className="flex justify-between mt-4">
            <Button variant="ghost" onClick={() => setStep(1)}>Back</Button>
            <Button onClick={() => setStep(3)}>Continue</Button>
          </div>
        </Card>
      )}

      {step === 3 && (
        <Card variant="default" padding="md">
          <h2 className="text-h3 font-bold mb-1">Setup and access</h2>
          <p className="text-small text-text-muted mb-3">
            The remaining setup is what teachers need on day one.
          </p>

          <ul className="divide-y divide-border">
            <CheckRow
              done={setupReady}
              title="Required school setup"
              detail={
                setup
                  ? `${setup.requiredComplete} of ${setup.requiredTotal} required steps complete (${setup.percent}%).`
                  : "Setup status could not be read."
              }
              href="/school-admin/profile"
              action="Finish setup"
            />
            {setup?.next.map((item) => (
              <li key={item.id} className="py-2.5 flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-caption font-medium text-text-primary">{item.label}</p>
                  <p className="text-caption text-text-muted">{item.detail}</p>
                </div>
                <Link href={item.href} className="text-caption font-semibold text-primary hover:underline shrink-0">
                  {item.action} →
                </Link>
              </li>
            ))}
          </ul>

          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-bg border border-border p-3">
              <div>
                <p className="text-small font-semibold text-text-primary">Share the login link</p>
                <p className="text-caption text-text-muted">
                  Teachers and students need the school link and QR code.
                </p>
              </div>
              <Button variant="secondary" size="sm" onClick={() => setShareOpen(true)}>
                Share access
              </Button>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-bg border border-border p-3">
              <div>
                <p className="text-small font-semibold text-text-primary">Daily attendance</p>
                <p className="text-caption text-text-muted">
                  Form teachers can take the register on a phone and it updates the
                  report-card totals.
                </p>
              </div>
              <Link href="/school-admin/teachers" className="text-caption font-semibold text-primary hover:underline">
                Check form teachers →
              </Link>
            </div>
          </div>

          <div className="flex justify-between mt-4">
            <Button variant="ghost" onClick={() => setStep(2)}>Back</Button>
            <Button onClick={() => setStep(4)}>Continue</Button>
          </div>
        </Card>
      )}

      {step === 4 && (
        <Card variant="default" padding="md">
          <h2 className="text-h3 font-bold mb-1">The term is ready to run</h2>
          <p className="text-small text-text-muted mb-4">
            {summary?.term
              ? `${summary.term.sessionName ? `${summary.term.sessionName} — ` : ""}${summary.term.name} is active.`
              : "No term is active yet — go back to step 1."}
          </p>

          <ul className="divide-y divide-border">
            <CheckRow
              done={isActive}
              title="Term active"
              detail={selectedTerm ? termLabel(selectedTerm) : "No term selected"}
              href="/school-admin/sessions"
              action="Set up terms"
            />
            <CheckRow
              done={(counts?.classes ?? 0) > 0 && (counts?.teachers ?? 0) > 0}
              title="People in place"
              detail={`${counts?.classes ?? 0} classes · ${counts?.teachers ?? 0} teachers · ${counts?.students ?? 0} students`}
              href="/school-admin/teachers"
              action="Review people"
            />
            <CheckRow
              done={setupReady}
              title="Setup"
              detail={setup ? `${setup.percent}% complete` : "Unknown"}
              href="/school-admin/profile"
              action="Finish setup"
            />
            <CheckRow
              done={unassigned === 0}
              title="No unassigned students"
              detail={
                unassigned === 0 ? "Every active student has a class." : `${unassigned} still need a class.`
              }
              href="/school-admin/students"
              action="Assign students"
            />
          </ul>

          <div className="flex flex-wrap justify-between gap-2 mt-4">
            <Button variant="ghost" onClick={() => setStep(3)}>Back</Button>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/school-admin/score-entry"
                className="inline-flex items-center justify-center font-semibold rounded-lg px-5 py-2.5 text-body min-h-[42px] bg-surface text-primary border border-primary hover:bg-primary-light"
              >
                Open score entry
              </Link>
              <Link
                href="/school-admin/dashboard"
                className="inline-flex items-center justify-center font-semibold rounded-lg px-5 py-2.5 text-body min-h-[42px] bg-primary text-white hover:bg-primary-dark"
              >
                Go to dashboard
              </Link>
            </div>
          </div>
        </Card>
      )}

      <ShareAccessModal
        isOpen={shareOpen}
        onClose={() => setShareOpen(false)}
        schoolName={summary?.school.name || "your school"}
        loginPath={summary?.school.slug ? `/school/${summary.school.slug}/login` : "/login"}
      />
    </div>
  );
}
