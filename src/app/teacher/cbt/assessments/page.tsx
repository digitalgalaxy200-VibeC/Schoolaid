"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Button, Input, Badge, Table, Modal, toast } from "@/components/ui";

/**
 * CBT assessments (Phase 17 UI) — the list, and creating one.
 *
 * Creating an assessment is the step that gives a question bank a purpose: it
 * binds School → Session → Term → Class → Subject → Teacher → Component and
 * declares the rules a student meets.
 *
 * The class/subject/component choices come from `/api/cbt/assessments/options`,
 * which is a SERVER endpoint because `components_rows` is deny-all to tenant
 * tokens — a browser could not read the component list even if it tried.
 */

type AssessmentStatus = "draft" | "review" | "published" | "archived";

type Assessment = {
  id: string;
  title: string;
  status: AssessmentStatus;
  class_id: string;
  subject_id: string | null;
  term_id: string | null;
  max_attempts: number;
  time_limit_minutes: number | null;
  official_attempt_rule: string;
};

type ClassOption = { id: string; name: string; subjects: { id: string; name: string }[] };
type ComponentOption = { id: string; name: string; maximum_score: number | null };

const STATUS_VARIANT: Record<AssessmentStatus, "draft" | "info" | "success" | "default"> = {
  draft: "draft",
  review: "info",
  published: "success",
  archived: "default",
};

const SELECT_CLASS =
  "w-full px-3 py-2.5 border border-border rounded-lg text-body bg-surface focus:outline-none focus:border-primary transition-colors";

const RULE_LABELS: Record<string, string> = {
  latest: "Latest attempt counts",
  best: "Best attempt counts",
  first: "First attempt counts",
  manual: "Chosen manually by a teacher",
};

export default function AssessmentsPage() {
  const router = useRouter();

  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [term, setTerm] = useState<{ id: string; name: string } | null>(null);
  const [components, setComponents] = useState<ComponentOption[]>([]);
  const [subjects, setSubjects] = useState<{ id: string; name: string }[]>([]);
  const [optionsError, setOptionsError] = useState<string | null>(null);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: "",
    class_id: "",
    subject_id: "",
    component_id: "",
    max_attempts: "1",
    time_limit_minutes: "",
    official_attempt_rule: "latest",
    instructions: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/cbt/assessments");
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error || `Could not load assessments (HTTP ${res.status})`);
        setAssessments([]);
        return;
      }
      setAssessments(body.assessments ?? []);
    } catch {
      setError("Could not reach the server.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadOptions = useCallback(async () => {
    setOptionsError(null);
    try {
      const res = await fetch("/api/cbt/assessments/options");
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setOptionsError(body.error || "Could not load your classes.");
        return;
      }
      setClasses(body.classes ?? []);
      setTerm(body.term ?? null);
    } catch {
      setOptionsError("Could not reach the server.");
    }
  }, []);

  // Components and subjects depend on the class, so they are fetched when one is
  // chosen rather than up front.
  const loadClassOptions = useCallback(async (classId: string) => {
    try {
      const res = await fetch(`/api/cbt/assessments/options?class_id=${classId}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setComponents([]);
        setSubjects([]);
        return;
      }
      setComponents(body.components ?? []);
      setSubjects(body.subjects ?? []);
    } catch {
      setComponents([]);
      setSubjects([]);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
    void Promise.resolve().then(loadOptions);
  }, [load, loadOptions]);

  const chooseClass = (classId: string) => {
    setForm((f) => ({ ...f, class_id: classId, subject_id: "", component_id: "" }));
    setComponents([]);
    setSubjects([]);
    if (classId) void loadClassOptions(classId);
  };

  const openNew = () => {
    setForm({
      title: "",
      class_id: "",
      subject_id: "",
      component_id: "",
      max_attempts: "1",
      time_limit_minutes: "",
      official_attempt_rule: "latest",
      instructions: "",
    });
    setFormError(null);
    setComponents([]);
    setSubjects([]);
    setIsFormOpen(true);
  };

  const submit = async () => {
    setSaving(true);
    setFormError(null);
    try {
      const res = await fetch("/api/cbt/assessments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          class_id: form.class_id,
          subject_id: form.subject_id || null,
          component_id: form.component_id || null,
          term_id: term?.id ?? null,
          max_attempts: Number(form.max_attempts) || 1,
          time_limit_minutes: form.time_limit_minutes ? Number(form.time_limit_minutes) : null,
          official_attempt_rule: form.official_attempt_rule,
          instructions: form.instructions || null,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFormError(body.error || `Could not create the assessment (HTTP ${res.status})`);
        return;
      }
      toast.success("Assessment created");
      setIsFormOpen(false);
      // Straight to the builder: an assessment with no questions cannot be
      // published, so creating one is only half the job.
      router.push(`/teacher/cbt/assessments/${body.id}`);
    } catch {
      setFormError("Could not reach the server.");
    } finally {
      setSaving(false);
    }
  };

  const classNameOf = (id: string) => classes.find((c) => c.id === id)?.name ?? "—";

  const columns = [
    {
      key: "title",
      header: "Assessment",
      render: (a: Assessment) => (
        <button
          type="button"
          onClick={() => router.push(`/teacher/cbt/assessments/${a.id}`)}
          className="text-left font-semibold text-primary hover:underline"
        >
          {a.title}
        </button>
      ),
    },
    {
      key: "class_id",
      header: "Class",
      render: (a: Assessment) => <span className="text-text-secondary">{classNameOf(a.class_id)}</span>,
    },
    {
      key: "rules",
      header: "Rules",
      render: (a: Assessment) => (
        <span className="text-text-secondary text-caption">
          {a.max_attempts} attempt(s)
          {a.time_limit_minutes ? ` · ${a.time_limit_minutes} min` : " · untimed"}
          {` · ${a.official_attempt_rule}`}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      className: "w-28",
      render: (a: Assessment) => <Badge variant={STATUS_VARIANT[a.status]}>{a.status}</Badge>,
    },
    {
      key: "actions",
      header: "",
      className: "w-28",
      render: (a: Assessment) => (
        <div className="flex justify-end">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => router.push(`/teacher/cbt/assessments/${a.id}`)}
          >
            Open
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="p-6 tablet:p-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-h1 font-bold text-text-primary">CBT assessments</h1>
          <p className="text-body text-text-secondary mt-1">
            Build a paper from approved questions, then publish it to the class.
          </p>
        </div>
        <Button variant="primary" onClick={openNew}>
          New assessment
        </Button>
      </div>

      {!term && (
        <div className="rounded-lg border border-warning bg-warning-bg px-4 py-3 text-body text-warning">
          No active term is configured for this school. Assessments must belong to a term, because
          a score is recorded against one.
        </div>
      )}

      <Card variant="default" className="space-y-4">
        {error && (
          <div className="rounded-lg border border-error bg-error-bg px-4 py-3 text-body text-error">
            {error}
          </div>
        )}
        <Table
          columns={columns}
          data={assessments}
          keyExtractor={(a) => a.id}
          loading={loading}
          emptyMessage="No assessments yet. Start with New assessment."
        />
      </Card>

      <Modal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title="New assessment"
        size="lg"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setIsFormOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" loading={saving} onClick={() => void submit()}>
              Create and add questions
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {formError && (
            <div className="rounded-lg border border-error bg-error-bg px-4 py-3 text-body text-error">
              {formError}
            </div>
          )}
          {optionsError && (
            <div className="rounded-lg border border-error bg-error-bg px-4 py-3 text-body text-error">
              {optionsError}
            </div>
          )}

          <Input
            label="Title"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="Mathematics — First Term Test"
          />

          <div className="grid grid-cols-1 tablet:grid-cols-2 gap-4">
            <div>
              <label className="text-caption font-semibold text-text-secondary">Class</label>
              <select
                value={form.class_id}
                onChange={(e) => chooseClass(e.target.value)}
                className={`${SELECT_CLASS} mt-1`}
              >
                <option value="">Select a class…</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-caption font-semibold text-text-secondary">Subject</label>
              <select
                value={form.subject_id}
                onChange={(e) => setForm((f) => ({ ...f, subject_id: e.target.value }))}
                disabled={!form.class_id}
                className={`${SELECT_CLASS} mt-1 disabled:opacity-60`}
              >
                <option value="">Select a subject…</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-caption font-semibold text-text-secondary">
              Report-card component
            </label>
            <select
              value={form.component_id}
              onChange={(e) => setForm((f) => ({ ...f, component_id: e.target.value }))}
              disabled={!form.class_id}
              className={`${SELECT_CLASS} mt-1 disabled:opacity-60`}
            >
              <option value="">Select a component…</option>
              {components.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.maximum_score !== null ? ` (max ${c.maximum_score})` : ""}
                </option>
              ))}
            </select>
            <p className="text-caption text-text-secondary mt-1">
              The CBT score is written into this component on the report card. A component can only
              have one source at a time.
            </p>
          </div>

          <div className="grid grid-cols-1 tablet:grid-cols-3 gap-4">
            <Input
              label="Attempts allowed"
              type="number"
              min={1}
              value={form.max_attempts}
              onChange={(e) => setForm((f) => ({ ...f, max_attempts: e.target.value }))}
            />
            <Input
              label="Time limit (min)"
              type="number"
              min={1}
              value={form.time_limit_minutes}
              onChange={(e) => setForm((f) => ({ ...f, time_limit_minutes: e.target.value }))}
            />
            <div>
              <label className="text-caption font-semibold text-text-secondary">
                Official attempt
              </label>
              <select
                value={form.official_attempt_rule}
                onChange={(e) => setForm((f) => ({ ...f, official_attempt_rule: e.target.value }))}
                className={`${SELECT_CLASS} mt-1`}
              >
                {Object.entries(RULE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-caption font-semibold text-text-secondary">
              Instructions (optional)
            </label>
            <textarea
              rows={3}
              value={form.instructions}
              onChange={(e) => setForm((f) => ({ ...f, instructions: e.target.value }))}
              placeholder="Answer all questions. No calculators."
              className="w-full mt-1 px-3 py-2.5 border border-border rounded-lg text-body bg-surface resize-y focus:outline-none focus:border-primary transition-colors"
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
