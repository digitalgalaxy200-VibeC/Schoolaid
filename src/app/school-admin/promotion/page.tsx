"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, ConfirmDialog, toast } from "@/components/ui";

// ── Shapes returned by the promotion APIs ────────────────────────────────────
type ClassRow = { id: string; name: string; student_count: number };

type PreviewStudent = { id: string; name: string; admission_no: string | null };
type FlaggedStudent = PreviewStudent & { reason: string };

type PreviewGroup = {
  source_class_id: string;
  source_class_name: string;
  action: "promote" | "graduate";
  destination_class_id: string | null;
  destination_class_name: string | null;
  students: PreviewStudent[];
  flagged: FlaggedStudent[];
};

type Preview = {
  groups: PreviewGroup[];
  totals: { total: number; promoted: number; graduated: number; flagged: number };
  unconfigured_classes: ClassRow[];
  unassigned: FlaggedStudent[];
  warnings: string[];
};

type RunSummary = {
  run_id: string;
  status: "running" | "completed" | "partial" | "failed";
  target_term_id: string | null;
  total: number;
  promoted: number;
  graduated: number;
  skipped: number;
  failed: number;
  errors: { student_id: string; reason: string }[];
  groups: { source_class_name: string; destination: string; action: string; count: number }[];
};

type TermOption = { id: string; label: string; is_active: boolean };

/** A mapping select value: "" = not configured, "graduate", or "promote:<classId>". */
type Selection = Record<string, string>;

function selectionFromSaved(
  mappings: { source_class_id: string; destination_class_id: string | null; action: string }[],
): Selection {
  const out: Selection = {};
  for (const m of mappings) {
    out[m.source_class_id] =
      m.action === "graduate" ? "graduate" : `promote:${m.destination_class_id ?? ""}`;
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
      payload.push({
        source_class_id: cls.id,
        action: "graduate",
        destination_class_id: null,
      });
      continue;
    }
    if (value.startsWith("promote:")) {
      const destination = value.slice("promote:".length);
      if (!destination) continue;
      payload.push({
        source_class_id: cls.id,
        action: "promote",
        destination_class_id: destination,
      });
    }
  }

  return payload;
}

export default function PromoteStudentsPage() {
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [selection, setSelection] = useState<Selection>({});
  const [terms, setTerms] = useState<TermOption[]>([]);
  const [targetTermId, setTargetTermId] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [summary, setSummary] = useState<RunSummary | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const configuredCount = useMemo(
    () => Object.values(selection).filter(Boolean).length,
    [selection],
  );

  const loadConfiguration = useCallback(() => {
    fetch("/api/school-admin/promotion/mappings")
      .then((r) =>
        r
          .json()
          .then((data) => ({ ok: r.ok, data }))
          .catch(() => ({ ok: r.ok, data: {} as Record<string, unknown> })),
      )
      .then(({ ok, data }) => {
        if (!ok) throw new Error((data?.error as string) || "Could not load promotion settings.");
        setClasses(Array.isArray(data.classes) ? (data.classes as ClassRow[]) : []);
        setSelection(
          selectionFromSaved(
            Array.isArray(data.mappings)
              ? (data.mappings as { source_class_id: string; destination_class_id: string | null; action: string }[])
              : [],
          ),
        );
        setError(null);
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Could not load promotion settings."),
      )
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadConfiguration();

    fetch("/api/school-admin/sessions")
      .then((r) => (r.ok ? r.json() : []))
      .then((sessions) => {
        const flat: TermOption[] = [];
        for (const session of Array.isArray(sessions) ? sessions : []) {
          for (const term of session.terms ?? []) {
            flat.push({
              id: term.id,
              label: `${session.name} — ${term.name}`,
              is_active: term.is_active === true,
            });
          }
        }
        setTerms(flat);
        const active = flat.find((t) => t.is_active);
        if (active) setTargetTermId(active.id);
      })
      .catch(() => {});
  }, [loadConfiguration]);

  async function saveConfiguration(): Promise<boolean> {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/school-admin/promotion/mappings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mappings: payloadFromSelection(classes, selection) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Could not save promotion settings.");
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not save promotion settings.";
      setError(message);
      toast.error("Mappings not saved", message);
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function handleSave() {
    const ok = await saveConfiguration();
    if (ok) toast.success("Mappings saved", "You can now preview the promotion.");
  }

  async function handlePreview() {
    setPreviewing(true);
    setSummary(null);
    setError(null);
    try {
      const saved = await saveConfiguration();
      if (!saved) return;
      const res = await fetch("/api/school-admin/promotion/preview");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Could not build the preview.");
      setPreview(data as Preview);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not build the preview.";
      setError(message);
      toast.error("Preview failed", message);
    } finally {
      setPreviewing(false);
    }
  }

  async function handleExecute() {
    setExecuting(true);
    setError(null);
    try {
      const res = await fetch("/api/school-admin/promotion/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true, term_id: targetTermId || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Promotion failed.");
      setSummary(data as RunSummary);
      setPreview(null);
      setConfirmOpen(false);
      toast.success("Promotion complete", "The summary is shown below.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Promotion failed.";
      setError(message);
      toast.error("Promotion failed", message);
    } finally {
      setExecuting(false);
    }
  }

  const canExecute = preview !== null && preview.totals.total > 0 && !executing;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-h1 font-bold">Promote Students</h1>
          <p className="text-small text-text-muted mt-1">
            Choose where each class moves. Destinations are your decision — nothing is inferred
            from class names or order.
          </p>
        </div>
        <a
          href="/school-admin/graduated"
          className="inline-flex items-center h-9 px-4 rounded-lg border border-border text-small font-semibold hover:bg-bg"
        >
          View Graduated Students
        </a>
      </div>

      {error ? (
        <div className="bg-error-bg border border-error rounded-sm px-4 py-3 text-small text-error font-medium">
          {error}
        </div>
      ) : null}

      {/* ── Step 1: mappings ─────────────────────────────────────────────── */}
      <Card
        header={
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-h3 font-bold">1. Class destinations</h2>
              <p className="text-caption text-text-muted mt-0.5">
                {configuredCount} of {classes.length} classes configured
              </p>
            </div>
            <Button onClick={handleSave} loading={saving} variant="secondary" size="sm">
              Save mappings
            </Button>
          </div>
        }
      >
        {loading ? (
          <p className="text-small text-text-muted">Loading classes…</p>
        ) : classes.length === 0 ? (
          <p className="text-small text-text-muted">
            This school has no classes yet. Create classes first.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-small">
              <thead>
                <tr className="border-b border-border text-left text-caption uppercase tracking-wider text-text-muted">
                  <th className="py-2 pr-4 font-semibold">Current class</th>
                  <th className="py-2 pr-4 font-semibold">Students</th>
                  <th className="py-2 font-semibold">Destination</th>
                </tr>
              </thead>
              <tbody>
                {classes.map((cls) => (
                  <tr key={cls.id} className="border-b border-border/60 last:border-0">
                    <td className="py-3 pr-4 font-semibold text-text-primary">{cls.name}</td>
                    <td className="py-3 pr-4 text-text-secondary">{cls.student_count}</td>
                    <td className="py-3">
                      <select
                        aria-label={`Destination for ${cls.name}`}
                        value={selection[cls.id] ?? ""}
                        onChange={(e) =>
                          setSelection((prev) => {
                            const next = { ...prev };
                            if (!e.target.value) delete next[cls.id];
                            else next[cls.id] = e.target.value;
                            return next;
                          })
                        }
                        className="w-full max-w-xs px-3 h-10 bg-surface border border-border rounded-lg text-small focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                      >
                        <option value="">— Not configured —</option>
                        {classes
                          .filter((option) => option.id !== cls.id)
                          .map((option) => (
                            <option key={option.id} value={`promote:${option.id}`}>
                              {option.name}
                            </option>
                          ))}
                        <option value="graduate">Graduated (no next class)</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ── Step 2: target term + review ─────────────────────────────────── */}
      <Card
        header={
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-h3 font-bold">2. Review</h2>
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-caption text-text-muted">
                <span className="block mb-1 font-semibold">Target session / term</span>
                <select
                  value={targetTermId}
                  onChange={(e) => setTargetTermId(e.target.value)}
                  className="px-3 h-10 bg-surface border border-border rounded-lg text-small focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                >
                  <option value="">Active term (automatic)</option>
                  {terms.map((term) => (
                    <option key={term.id} value={term.id}>
                      {term.label}
                      {term.is_active ? " (active)" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <Button onClick={handlePreview} loading={previewing} variant="secondary">
                Preview promotion
              </Button>
            </div>
          </div>
        }
      >
        {!preview ? (
          <p className="text-small text-text-muted">
            Save your mappings, then preview to see exactly who moves, who graduates, and who
            needs attention.
          </p>
        ) : (
          <div className="space-y-5">
            <div className="flex flex-wrap gap-2">
              <Badge variant="info">Promote: {preview.totals.promoted}</Badge>
              <Badge variant="success">Graduate: {preview.totals.graduated}</Badge>
              <Badge
                variant={
                  preview.totals.flagged + preview.unassigned.length > 0
                    ? "warning"
                    : "default"
                }
              >
                Needs review: {preview.totals.flagged + preview.unassigned.length}
              </Badge>
            </div>

            {preview.warnings.length > 0 ? (
              <div className="bg-warning-bg border border-warning rounded-sm px-4 py-3 text-small text-warning">
                {preview.warnings.join(" ")}
              </div>
            ) : null}

            {preview.groups.length === 0 ? (
              <p className="text-small text-text-muted">
                No classes are configured yet.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-small">
                  <thead>
                    <tr className="border-b border-border text-left text-caption uppercase tracking-wider text-text-muted">
                      <th className="py-2 pr-4 font-semibold">Current class</th>
                      <th className="py-2 pr-4 font-semibold">Destination</th>
                      <th className="py-2 pr-4 font-semibold">Moving</th>
                      <th className="py-2 pr-4 font-semibold">Graduating</th>
                      <th className="py-2 font-semibold">Needs review</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.groups.map((group) => (
                      <tr
                        key={group.source_class_id}
                        className="border-b border-border/60 last:border-0"
                      >
                        <td className="py-3 pr-4 font-semibold text-text-primary">
                          {group.source_class_name}
                        </td>
                        <td className="py-3 pr-4">
                          {group.action === "graduate" ? (
                            <Badge variant="success">Graduated</Badge>
                          ) : (
                            <span className="text-text-secondary">
                              {group.destination_class_name ?? "—"}
                            </span>
                          )}
                        </td>
                        <td className="py-3 pr-4 text-text-secondary">
                          {group.action === "promote" ? group.students.length : 0}
                        </td>
                        <td className="py-3 pr-4 text-text-secondary">
                          {group.action === "graduate" ? group.students.length : 0}
                        </td>
                        <td className="py-3 text-text-secondary">{group.flagged.length}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {preview.totals.flagged > 0 || preview.unassigned.length > 0 ? (
              <div className="space-y-3">
                <h3 className="text-body font-bold text-text-primary">
                  Students requiring attention
                </h3>
                <div className="space-y-2">
                  {preview.groups.flatMap((group) =>
                    group.flagged.map((student) => (
                      <div
                        key={`${group.source_class_id}-${student.id}`}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-bg px-3 py-2 text-small"
                      >
                        <span className="font-semibold text-text-primary">
                          {student.name}
                          {student.admission_no ? ` · ${student.admission_no}` : ""}
                        </span>
                        <span className="text-text-muted">
                          {group.source_class_name} — {student.reason}
                        </span>
                      </div>
                    )),
                  )}
                  {preview.unassigned.map((student) => (
                    <div
                      key={`unassigned-${student.id}`}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-bg px-3 py-2 text-small"
                    >
                      <span className="font-semibold text-text-primary">
                        {student.name}
                        {student.admission_no ? ` · ${student.admission_no}` : ""}
                      </span>
                      <span className="text-text-muted">{student.reason}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {preview.unconfigured_classes.length > 0 ? (
              <p className="text-caption text-text-muted">
                Not configured (students in these classes will not be touched):{" "}
                {preview.unconfigured_classes.map((c) => c.name).join(", ")}.
              </p>
            ) : null}

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Button
                onClick={() => setConfirmOpen(true)}
                disabled={!canExecute}
                loading={executing}
              >
                Confirm &amp; execute promotion
              </Button>
              <span className="text-caption text-text-muted">
                {preview.totals.total} student(s) will be processed.
              </span>
            </div>
          </div>
        )}
      </Card>

      {/* ── Step 3: result ───────────────────────────────────────────────── */}
      {summary ? (
        <Card header={<h2 className="text-h3 font-bold">3. Promotion summary</h2>}>
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge
                variant={
                  summary.status === "completed"
                    ? "success"
                    : summary.status === "partial"
                      ? "warning"
                      : "error"
                }
              >
                {summary.status}
              </Badge>
              <Badge variant="info">Promoted: {summary.promoted}</Badge>
              <Badge variant="success">Graduated: {summary.graduated}</Badge>
              <Badge variant="default">Skipped: {summary.skipped}</Badge>
              <Badge variant={summary.failed > 0 ? "error" : "default"}>
                Failed: {summary.failed}
              </Badge>
            </div>

            {summary.groups.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-small">
                  <thead>
                    <tr className="border-b border-border text-left text-caption uppercase tracking-wider text-text-muted">
                      <th className="py-2 pr-4 font-semibold">From</th>
                      <th className="py-2 pr-4 font-semibold">To</th>
                      <th className="py-2 font-semibold">Planned</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.groups.map((group, index) => (
                      <tr key={`${group.source_class_name}-${index}`} className="border-b border-border/60 last:border-0">
                        <td className="py-2 pr-4 font-semibold text-text-primary">
                          {group.source_class_name}
                        </td>
                        <td className="py-2 pr-4 text-text-secondary">{group.destination}</td>
                        <td className="py-2 text-text-secondary">{group.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}

            {summary.errors.length > 0 ? (
              <div className="space-y-2">
                <h3 className="text-body font-bold text-error">Records requiring attention</h3>
                {summary.errors.map((item) => (
                  <div
                    key={item.student_id}
                    className="rounded-md border border-error bg-error-bg px-3 py-2 text-small text-error"
                  >
                    {item.student_id}: {item.reason}
                  </div>
                ))}
              </div>
            ) : null}

            <p className="text-caption text-text-muted">
              Historical report cards, attendance and finance records were not modified.
            </p>
          </div>
        </Card>
      ) : null}

      <ConfirmDialog
        open={confirmOpen}
        title="Execute promotion"
        message={
          preview
            ? `This will move ${preview.totals.promoted} student(s) to their destination classes and graduate ${preview.totals.graduated}. It cannot be undone from this screen. Continue?`
            : "Continue with the promotion?"
        }
        confirmLabel="Execute promotion"
        variant="warning"
        loading={executing}
        onConfirm={handleExecute}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
