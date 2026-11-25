"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Badge, Button, Card } from "@/components/ui";
import type { DashboardSummary } from "@/lib/school-admin/dashboard-summary";

type ClassRow = { id: string; name: string; student_count: number };
type TermRow = {
  id: string;
  name: string;
  session_name: string | null;
  start_date: string;
  end_date: string;
  is_active: boolean;
};

type PreviewStudent = { id: string; name: string; admission_no: string | null };
type PreviewGroup = {
  source_class_id: string;
  source_class_name: string;
  action: "promote" | "graduate";
  destination_class_id: string | null;
  destination_class_name: string | null;
  students: PreviewStudent[];
  flagged: (PreviewStudent & { reason: string })[];
};
type Preview = {
  groups: PreviewGroup[];
  totals: { total: number; promoted: number; graduated: number; flagged: number };
  unconfigured_classes: ClassRow[];
  unassigned: (PreviewStudent & { reason: string })[];
  warnings: string[];
};
type RunSummary = {
  run_id: string;
  status: "running" | "completed" | "partial" | "failed";
  total: number;
  promoted: number;
  graduated: number;
  skipped: number;
  failed: number;
  errors: { student_id: string; reason: string }[];
};

type Selection = Record<string, string>;

const STEPS = ["Close term", "Next term", "Map classes", "Preview", "Run"];

function selectionFromSaved(
  mapped: { source_class_id: string; destination_class_id: string | null; action: string }[],
): Selection {
  const out: Selection = {};
  for (const row of mapped) {
    out[row.source_class_id] =
      row.action === "graduate" ? "graduate" : `promote:${row.destination_class_id ?? ""}`;
  }
  return out;
}

function payloadFromSelection(classes: ClassRow[], selection: Selection) {
  const payload: {
    source_class_id: string;
    action: "promote" | "graduate";
    destination_class_id: string | null;
  }[] = [];

  for (const cls of classes) {
    const value = selection[cls.id];
    if (!value) continue;
    if (value === "graduate") {
      payload.push({ source_class_id: cls.id, action: "graduate", destination_class_id: null });
      continue;
    }
    if (value.startsWith("promote:")) {
      const destination = value.slice("promote:".length);
      if (destination) {
        payload.push({
          source_class_id: cls.id,
          action: "promote",
          destination_class_id: destination,
        });
      }
    }
  }

  return payload;
}

function termLabel(term: TermRow): string {
  return `${term.session_name ? `${term.session_name} — ` : ""}${term.name}`;
}

export default function EndOfTermWizardPage() {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [selection, setSelection] = useState<Selection>({});
  const [terms, setTerms] = useState<TermRow[]>([]);
  const [targetTermId, setTargetTermId] = useState("");

  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [run, setRun] = useState<RunSummary | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      fetch("/api/school-admin/promotion/mappings").then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body?.error || "Could not load classes.");
        return body as {
          classes?: ClassRow[];
          mappings?: { source_class_id: string; destination_class_id: string | null; action: string }[];
        };
      }),
      fetch("/api/school-admin/terms").then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body?.error || "Could not load terms.");
        return (Array.isArray(body) ? body : []) as TermRow[];
      }),
    ])
      .then(([configuration, termRows]) => {
        if (cancelled) return;
        setClasses(Array.isArray(configuration.classes) ? configuration.classes : []);
        setSelection(selectionFromSaved(configuration.mappings || []));
        setTerms(termRows);

        const active = termRows.find((term) => term.is_active);
        const afterActive = active
          ? termRows
              .filter((term) => term.start_date > active.end_date)
              .sort((a, b) => a.start_date.localeCompare(b.start_date))[0]
          : null;
        const next =
          afterActive ??
          termRows
            .filter((term) => !term.is_active)
            .sort((a, b) => a.start_date.localeCompare(b.start_date))[0] ??
          active ??
          null;
        if (next) setTargetTermId(next.id);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load the wizard.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    fetch("/api/school-admin/dashboard/summary")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!cancelled && data) setSummary(data as DashboardSummary);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  const configuredCount = useMemo(
    () => Object.values(selection).filter(Boolean).length,
    [selection],
  );

  const targetTerm = terms.find((term) => term.id === targetTermId) || null;
  const activeTerm = terms.find((term) => term.is_active) || null;

  const readiness = summary?.readiness.filter((row) => row.percent !== null) ?? [];
  const overallReadiness =
    readiness.length > 0
      ? Math.round(readiness.reduce((sum, row) => sum + (row.percent ?? 0), 0) / readiness.length)
      : null;
  const classesBehind = readiness.filter((row) => (row.percent ?? 0) < 100);
  const pendingCards = summary?.needsAttention.pendingReportCards ?? [];
  const studentsWithoutClass = summary?.needsAttention.studentsWithoutClass ?? 0;

  async function saveMappings(): Promise<boolean> {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/school-admin/promotion/mappings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mappings: payloadFromSelection(classes, selection) }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || "Could not save the class mapping.");
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the class mapping.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function buildPreview() {
    if (configuredCount === 0) {
      setError("Choose where at least one class moves before previewing.");
      return;
    }
    setPreviewing(true);
    setError(null);
    try {
      const saved = await saveMappings();
      if (!saved) return;
      const response = await fetch("/api/school-admin/promotion/preview");
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || "Could not build the preview.");
      setPreview(body as Preview);
      setConfirmed(false);
      setStep(4);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not build the preview.");
    } finally {
      setPreviewing(false);
    }
  }

  async function execute() {
    if (!confirmed) {
      setError("Confirm that you have reviewed the preview before running.");
      return;
    }
    setExecuting(true);
    setError(null);
    try {
      const response = await fetch("/api/school-admin/promotion/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true, term_id: targetTermId || undefined }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || "Promotion failed.");
      setRun(body as RunSummary);
      setStep(5);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Promotion failed.");
    } finally {
      setExecuting(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Loading end-of-term wizard">
        <div className="h-16 skeleton rounded-lg" />
        <div className="h-64 skeleton rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-h2 font-bold">End of Term</h1>
        <p className="text-small text-text-muted mt-0.5">
          Close the term, move every class forward, and graduate the final year —
          one guided pass.
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

      {step === 1 && (
        <Card variant="default" padding="md">
          <h2 className="text-h3 font-bold mb-1">Before you move anyone</h2>
          <p className="text-small text-text-muted mb-4">
            These are advisory checks. You can still continue, but a class with
            unfinished marks or an unpublished report card will be harder to
            correct afterwards.
          </p>

          <ul className="divide-y divide-border">
            <li className="py-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-small font-medium text-text-primary">Active term</p>
                <p className="text-caption text-text-muted">
                  {summary?.term
                    ? `${summary.term.sessionName ? `${summary.term.sessionName} — ` : ""}${summary.term.name}`
                    : "No active term is set."}
                </p>
              </div>
              {summary?.term ? (
                <Badge variant="success">Set</Badge>
              ) : (
                <Link href="/school-admin/sessions" className="text-caption font-semibold text-primary hover:underline">
                  Set up terms →
                </Link>
              )}
            </li>

            <li className="py-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-small font-medium text-text-primary">Results readiness</p>
                <p className="text-caption text-text-muted">
                  {overallReadiness === null
                    ? "No configured classes to measure yet."
                    : classesBehind.length === 0
                      ? "Every configured class has complete marks."
                      : `${classesBehind.length} class${classesBehind.length === 1 ? "" : "es"} still have marks outstanding (school-wide ${overallReadiness}%).`}
                </p>
              </div>
              <Link href="/school-admin/score-entry" className="text-caption font-semibold text-primary hover:underline">
                {classesBehind.length > 0 ? "Review marks →" : "Open score entry →"}
              </Link>
            </li>

            <li className="py-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-small font-medium text-text-primary">Report cards awaiting approval</p>
                <p className="text-caption text-text-muted">
                  {pendingCards.length === 0
                    ? "Nothing is waiting for review."
                    : `${pendingCards.length} class${pendingCards.length === 1 ? "" : "es"} submitted and waiting.`}
                </p>
              </div>
              <Link href="/school-admin/report-cards" className="text-caption font-semibold text-primary hover:underline">
                {pendingCards.length > 0 ? "Review report cards →" : "Open report cards →"}
              </Link>
            </li>

            <li className="py-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-small font-medium text-text-primary">Students without a class</p>
                <p className="text-caption text-text-muted">
                  {studentsWithoutClass === 0
                    ? "Every active student is in a class."
                    : `${studentsWithoutClass} student${studentsWithoutClass === 1 ? "" : "s"} will not be moved.`}
                </p>
              </div>
              <Link href="/school-admin/students" className="text-caption font-semibold text-primary hover:underline">
                {studentsWithoutClass > 0 ? "Assign students →" : "Open students →"}
              </Link>
            </li>
          </ul>

          <div className="flex justify-end mt-4">
            <Button onClick={() => setStep(2)}>Continue</Button>
          </div>
        </Card>
      )}

      {step === 2 && (
        <Card variant="default" padding="md">
          <h2 className="text-h3 font-bold mb-1">Where should students land?</h2>
          <p className="text-small text-text-muted mb-4">
            Promotion writes each student&apos;s new enrolment into this term. Pick
            the next term, not the one you are closing.
          </p>

          {terms.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-small text-text-muted mb-3">
                There are no terms yet. Create the next session and term first.
              </p>
              <Link href="/school-admin/sessions" className="text-caption font-semibold text-primary hover:underline">
                Sessions &amp; terms →
              </Link>
            </div>
          ) : (
            <>
              <label className="block">
                <span className="text-caption font-medium text-text-primary block mb-1">
                  Target term
                </span>
                <select
                  value={targetTermId}
                  onChange={(event) => setTargetTermId(event.target.value)}
                  className="w-full h-11 px-3 border border-border rounded-lg bg-surface text-small text-text-primary focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                >
                  {terms.map((term) => (
                    <option key={term.id} value={term.id}>
                      {termLabel(term)}
                      {term.is_active ? " (current)" : ""}
                    </option>
                  ))}
                </select>
              </label>

              {targetTerm && activeTerm && targetTerm.id === activeTerm.id && (
                <p className="text-caption text-warning mt-2">
                  You selected the active term. Promotion is normally into the next
                  term — continue only if that is deliberate.
                </p>
              )}

              {targetTerm && (
                <p className="text-caption text-text-muted mt-3">
                  Target: <span className="font-semibold text-text-primary">{termLabel(targetTerm)}</span>
                </p>
              )}
            </>
          )}

          <div className="flex justify-between mt-4">
            <Button variant="ghost" onClick={() => setStep(1)}>Back</Button>
            <Button onClick={() => setStep(3)} disabled={!targetTermId}>
              Continue
            </Button>
          </div>
        </Card>
      )}

      {step === 3 && (
        <Card variant="default" padding="md">
          <h2 className="text-h3 font-bold mb-1">Map every class</h2>
          <p className="text-small text-text-muted mb-4">
            Nothing is inferred from class names. A class left as “Not moving”
            stays exactly where it is.
          </p>

          {classes.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-small text-text-muted mb-3">No classes are set up yet.</p>
              <Link href="/school-admin/classes" className="text-caption font-semibold text-primary hover:underline">
                Add classes →
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {classes.map((cls) => (
                <div
                  key={cls.id}
                  className="flex flex-wrap items-center justify-between gap-3 border border-border rounded-lg p-3"
                >
                  <div className="min-w-0">
                    <p className="text-small font-semibold text-text-primary">{cls.name}</p>
                    <p className="text-caption text-text-muted">
                      {cls.student_count} active student{cls.student_count === 1 ? "" : "s"}
                    </p>
                  </div>
                  <select
                    value={selection[cls.id] || ""}
                    onChange={(event) =>
                      setSelection((current) => ({ ...current, [cls.id]: event.target.value }))
                    }
                    className="h-10 px-3 border border-border rounded-lg bg-surface text-small text-text-primary focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 min-w-[220px]"
                  >
                    <option value="">Not moving</option>
                    <option value="graduate">Graduate</option>
                    {classes
                      .filter((destination) => destination.id !== cls.id)
                      .map((destination) => (
                        <option key={destination.id} value={`promote:${destination.id}`}>
                          Promote to {destination.name}
                        </option>
                      ))}
                  </select>
                </div>
              ))}
            </div>
          )}

          <p className="text-caption text-text-muted mt-3">
            {configuredCount} of {classes.length} classes configured.
          </p>

          <div className="flex justify-between mt-4">
            <Button variant="ghost" onClick={() => setStep(2)}>Back</Button>
            <Button
              onClick={buildPreview}
              loading={previewing || saving}
              disabled={classes.length === 0 || configuredCount === 0}
            >
              Preview the move
            </Button>
          </div>
        </Card>
      )}

      {step === 4 && preview && (
        <Card variant="default" padding="md">
          <h2 className="text-h3 font-bold mb-1">Review before running</h2>
          <p className="text-small text-text-muted mb-4">
            This is the exact plan that will run. Flagged students need attention
            before or after the run.
          </p>

          <div className="grid grid-cols-2 desktop:grid-cols-4 gap-3 mb-4">
            {[
              { label: "Students", value: preview.totals.total },
              { label: "Promoted", value: preview.totals.promoted },
              { label: "Graduated", value: preview.totals.graduated },
              { label: "Flagged", value: preview.totals.flagged },
            ].map((item) => (
              <div key={item.label} className="rounded-lg bg-bg border border-border p-3">
                <p className="text-caption text-text-muted uppercase tracking-wide font-semibold">
                  {item.label}
                </p>
                <p className="text-h3 font-bold text-text-primary">{item.value}</p>
              </div>
            ))}
          </div>

          <div className="divide-y divide-border">
            {preview.groups.map((group) => (
              <div key={group.source_class_id} className="py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-small font-semibold text-text-primary">
                    {group.source_class_name} →{" "}
                    {group.action === "graduate"
                      ? "Graduated"
                      : group.destination_class_name || "Unmapped"}
                  </p>
                  <Badge variant={group.action === "graduate" ? "success" : "info"}>
                    {group.action === "graduate" ? "Graduate" : "Promote"}
                  </Badge>
                </div>
                <p className="text-caption text-text-muted mt-1">
                  {group.students.length} student{group.students.length === 1 ? "" : "s"}
                  {group.flagged.length > 0 ? ` · ${group.flagged.length} flagged` : ""}
                </p>
                {group.flagged.length > 0 && (
                  <ul className="mt-1 space-y-0.5">
                    {group.flagged.map((student) => (
                      <li key={student.id} className="text-caption text-warning">
                        {student.name}: {student.reason}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>

          {preview.warnings.length > 0 && (
            <ul className="mt-3 space-y-1">
              {preview.warnings.map((warning) => (
                <li key={warning} className="text-caption text-warning">
                  {warning}
                </li>
              ))}
            </ul>
          )}

          {preview.unconfigured_classes.length > 0 && (
            <p className="text-caption text-warning mt-3">
              {preview.unconfigured_classes.length} class
              {preview.unconfigured_classes.length === 1 ? "" : "es"} have no mapping
              and will not move.
            </p>
          )}

          <label className="flex items-start gap-2 mt-4 text-small text-text-secondary">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-primary"
            />
            <span>
              I reviewed the plan. Run it against{" "}
              <span className="font-semibold text-text-primary">
                {targetTerm ? termLabel(targetTerm) : "the selected term"}
              </span>
              .
            </span>
          </label>

          <div className="flex justify-between mt-4">
            <Button variant="ghost" onClick={() => setStep(3)}>Back</Button>
            <Button
              onClick={execute}
              loading={executing}
              disabled={!confirmed || preview.totals.total === 0}
            >
              Run promotion
            </Button>
          </div>
        </Card>
      )}

      {step === 5 && run && (
        <Card variant="default" padding="md">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="text-h3 font-bold">Promotion complete</h2>
              <p className="text-small text-text-muted mt-0.5">
                {run.promoted} promoted · {run.graduated} graduated · {run.skipped} skipped
                {run.failed > 0 ? ` · ${run.failed} failed` : ""}
              </p>
            </div>
            <Badge variant={run.status === "completed" ? "success" : run.status === "failed" ? "error" : "warning"}>
              {run.status}
            </Badge>
          </div>

          {run.errors.length > 0 && (
            <ul className="mt-3 space-y-1">
              {run.errors.map((failure) => (
                <li key={`${failure.student_id}-${failure.reason}`} className="text-caption text-error">
                  {failure.reason}
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap gap-2 mt-4">
            <Link
              href="/school-admin/graduated"
              className="inline-flex items-center justify-center font-semibold rounded-lg px-5 py-2.5 text-body min-h-[42px] bg-surface text-primary border border-primary hover:bg-primary-light"
            >
              View graduated students
            </Link>
            <Link
              href="/school-admin/year-end/beginning-of-term"
              className="inline-flex items-center justify-center font-semibold rounded-lg px-5 py-2.5 text-body min-h-[42px] bg-primary text-white hover:bg-primary-dark"
            >
              Start the new term
            </Link>
            <Link
              href="/school-admin/dashboard"
              className="inline-flex items-center justify-center font-semibold rounded-lg px-5 py-2.5 text-body min-h-[42px] bg-surface text-text-secondary border border-border hover:bg-bg"
            >
              Go to dashboard
            </Link>
          </div>
        </Card>
      )}
    </div>
  );
}
