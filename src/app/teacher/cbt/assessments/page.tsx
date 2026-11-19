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

/**
 * The class a teacher is working in, remembered between visits.
 *
 * Class-first, not paper-first: a class teacher wants "what is on for Year 3"
 * rather than a list mixed across every class they touch. The choice is stored
 * so the question is asked once, not on every navigation back to this screen.
 */
const ACTIVE_CLASS_KEY = "cbt_active_class";

export default function AssessmentsPage() {
  const router = useRouter();

  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [classes, setClasses] = useState<ClassOption[]>([]);
  // "" until a class is chosen — the picker is shown instead of the list.
  const [activeClassId, setActiveClassId] = useState<string>("");
  const [term, setTerm] = useState<{ id: string; name: string; session_name?: string } | null>(null);
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
      const list = (body.classes ?? []) as ClassOption[];
      setClasses(list);
      setTerm(body.term ?? null);

      // Restore the remembered class, but only if it is still one of theirs: a
      // class can be un-assigned, and silently listing another class's papers
      // would be worse than asking again.
      let remembered: string | null = null;
      try {
        remembered = window.localStorage.getItem(ACTIVE_CLASS_KEY);
      } catch {
        remembered = null;
      }
      if (remembered && list.some((c) => c.id === remembered)) {
        setActiveClassId(remembered);
      }
    } catch {
      setOptionsError("Could not reach the server.");
    }
  }, []);

  const chooseActiveClass = (classId: string) => {
    setActiveClassId(classId);
    try {
      if (classId) window.localStorage.setItem(ACTIVE_CLASS_KEY, classId);
      else window.localStorage.removeItem(ACTIVE_CLASS_KEY);
    } catch {
      // A blocked storage does not break the screen; it only forgets the choice.
    }
  };

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

  const generateTitle = (
    classId: string,
    subjectId: string,
    componentId: string,
    componentsList: ComponentOption[] = components,
    subjectsList: { id: string; name: string }[] = subjects
  ) => {
    const comp = componentsList.find((c) => c.id === componentId);
    const subj = subjectsList.find((s) => s.id === subjectId);
    const cls = classes.find((c) => c.id === classId);

    const compName = comp ? comp.name : "";
    const subjName = subj ? subj.name : "";
    const clsName = cls ? cls.name : "";
    const termInfo = [term?.session_name, term?.name].filter(Boolean).join(" ");

    // e.g. "CA 1 — Mathematics (JSS 1 · 2026/2027 First Term)"
    const parts: string[] = [];
    if (compName && subjName) {
      parts.push(`${compName} — ${subjName}`);
    } else if (compName) {
      parts.push(compName);
    } else if (subjName) {
      parts.push(subjName);
    }

    const details: string[] = [];
    if (clsName) details.push(clsName);
    if (termInfo) details.push(termInfo);

    if (details.length > 0 && parts.length > 0) {
      return `${parts.join("")} (${details.join(" · ")})`;
    } else if (parts.length > 0) {
      return parts.join("");
    } else if (details.length > 0) {
      return `Assessment (${details.join(" · ")})`;
    }
    return "";
  };

  const chooseSubject = (subjectId: string) => {
    setForm((f) => {
      const nextTitle = generateTitle(f.class_id, subjectId, f.component_id, components, subjects);
      return {
        ...f,
        subject_id: subjectId,
        title: nextTitle || f.title,
      };
    });
  };

  const chooseComponent = (componentId: string) => {
    setForm((f) => {
      const nextTitle = generateTitle(f.class_id, f.subject_id, componentId, components, subjects);
      return {
        ...f,
        component_id: componentId,
        title: nextTitle || f.title,
      };
    });
  };

  const openNew = () => {
    setForm({
      title: "",
      // The class is already decided: it is the one the page is working in.
      class_id: activeClassId,
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
    // Subjects and components belong to that class, so they are loaded from it
    // rather than asked for a second time.
    if (activeClassId) void loadClassOptions(activeClassId);
  };

  const submit = async () => {
    if (!form.class_id) {
      setFormError("Please select a class.");
      return;
    }
    if (!form.subject_id && form.class_id && subjects.length > 0) {
      setFormError("Choose the subject — it decides which questions this paper can draw from.");
      return;
    }
    // Asked once, here. The builder shows it read-only afterwards, so the two
    // screens cannot contradict each other — and a paper is never created
    // without a component it could publish into.
    if (!form.component_id) {
      setFormError(
        components.length === 0
          ? "This class has no assessment types configured yet. Ask a school admin to set them up under School Settings → Assessment Components."
          : "Choose the assessment type — it decides which report-card component the scores are written into.",
      );
      return;
    }
    const finalTitle = (form.title.trim() || generateTitle(form.class_id, form.subject_id, form.component_id)).trim();
    if (!finalTitle) {
      setFormError("Please provide or generate a title for the assessment.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const res = await fetch("/api/cbt/assessments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: finalTitle,
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

  const activeClass = classes.find((c) => c.id === activeClassId) ?? null;
  // Class-first: the list below only ever describes the class being worked in.
  const classAssessments = activeClassId
    ? assessments.filter((a) => a.class_id === activeClassId)
    : [];
  const drafts = classAssessments.filter(
    (a) => a.status === "draft" || a.status === "review",
  ).length;
  const published = classAssessments.filter((a) => a.status === "published").length;

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
    <div className="p-4 tablet:p-8 space-y-6">
      <div className="flex flex-col gap-4 tablet:flex-row tablet:flex-wrap tablet:items-center tablet:justify-between">
        <div>
          <h1 className="text-h1 font-bold text-text-primary">CBT assessments</h1>
          <p className="text-body text-text-secondary mt-1">
            {activeClass
              ? `Papers for ${activeClass.name} — drafts and published.`
              : "Choose the class you are working in."}
          </p>
        </div>
        {activeClassId && (
          <Button variant="primary" onClick={openNew} className="w-full tablet:w-auto">
            New assessment
          </Button>
        )}
      </div>

      {!term && (
        <div className="rounded-lg border border-warning bg-warning-bg px-4 py-3 text-body text-warning">
          No active term is configured for this school. Assessments must belong to a term, because
          a score is recorded against one.
        </div>
      )}

      {/* ASK ONCE. Until a class is chosen this screen shows the picker and
          nothing else, so there is no list to misread as "my papers" when it is
          really every paper I can reach. The choice is remembered (see
          `ACTIVE_CLASS_KEY`), so coming back does not ask again. */}
      {!activeClassId ? (
        <Card variant="default" className="space-y-4">
          <div>
            <h2 className="text-h2 font-semibold text-text-primary">
              Which class are you working in?
            </h2>
            <p className="text-body text-text-secondary mt-1">
              Pick a class to see its assessments. We remember your choice, so you will not be
              asked again.
            </p>
          </div>
          {classes.length === 0 ? (
            <p className="text-body text-text-secondary">
              {optionsError ??
                "No classes are assigned to you yet — ask your school admin to assign you to a class."}
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-3 tablet:grid-cols-2">
              {classes.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => chooseActiveClass(c.id)}
                  className="min-h-[56px] rounded-lg border border-border bg-surface px-4 py-3 text-left transition-colors hover:border-primary/50 hover:bg-clay"
                >
                  <span className="block text-body-lg font-semibold text-text-primary">
                    {c.name}
                  </span>
                  <span className="mt-0.5 block text-caption text-text-secondary">
                    {c.subjects.length} subject{c.subjects.length === 1 ? "" : "s"}
                  </span>
                </button>
              ))}
            </div>
          )}
        </Card>
      ) : (
        <>
          <Card variant="default" className="flex flex-col gap-3 tablet:flex-row tablet:items-end tablet:justify-between">
            <div className="w-full tablet:max-w-xs">
              <label className="text-caption font-semibold text-text-secondary">Working in</label>
              <select
                value={activeClassId}
                onChange={(e) => chooseActiveClass(e.target.value)}
                className={`${SELECT_CLASS} mt-1`}
              >
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-caption text-text-secondary">
              <Badge variant="draft">{drafts} draft{drafts === 1 ? "" : "s"}</Badge>
              <Badge variant="success">
                {published} published
              </Badge>
            </div>
          </Card>

          <Card variant="default" className="space-y-4">
            {error && (
              <div className="rounded-lg border border-error bg-error-bg px-4 py-3 text-body text-error">
                {error}
              </div>
            )}
            <Table
              columns={columns}
              data={classAssessments}
              keyExtractor={(a) => a.id}
              loading={loading}
              emptyMessage={`Nothing for ${activeClass?.name ?? "this class"} yet. Start with New assessment.`}
              mobileCard={(a) => (
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-body-lg font-semibold text-text-primary">{a.title}</p>
                    <Badge variant={STATUS_VARIANT[a.status]}>{a.status}</Badge>
                  </div>
                  <div className="space-y-1 text-caption text-text-secondary">
                    <p>
                      {a.max_attempts} attempt(s)
                      {a.time_limit_minutes ? ` · ${a.time_limit_minutes} min` : " · untimed"}
                      {` · ${a.official_attempt_rule}`}
                    </p>
                  </div>
                  <Button
                    variant="secondary"
                    size="lg"
                    className="w-full"
                    onClick={() => router.push(`/teacher/cbt/assessments/${a.id}`)}
                  >
                    Open
                  </Button>
                </div>
              )}
            />
          </Card>
        </>
      )}

      <Modal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title="New assessment"
        size="lg"
        footer={
          <div className="flex flex-col gap-2 tablet:flex-row tablet:justify-end">
            <Button
              variant="ghost"
              className="w-full tablet:w-auto"
              onClick={() => setIsFormOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={saving}
              className="w-full tablet:w-auto"
              onClick={() => void submit()}
            >
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

          <div className="grid grid-cols-1 tablet:grid-cols-2 gap-4">
            <div>
              {/* Not a question any more: the class was chosen on the way in and
                  is remembered, so asking for it again here was the duplicate the
                  teacher had already answered. Change it with "Working in" above. */}
              <label className="text-caption font-semibold text-text-secondary">Class</label>
              <p className="mt-1 h-11 tablet:h-10 flex items-center px-3 rounded-lg border border-border bg-clay text-body font-medium text-text-primary">
                {activeClass?.name ?? "—"}
              </p>
              <p className="text-caption text-text-secondary mt-1">
                Change the class with &ldquo;Working in&rdquo; above.
              </p>
            </div>

            <div>
              <label className="text-caption font-semibold text-text-secondary">
                Subject{form.class_id && subjects.length > 0 ? " *" : ""}
              </label>
              <select
                value={form.subject_id}
                onChange={(e) => chooseSubject(e.target.value)}
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
              {form.class_id && subjects.length > 0 && !form.subject_id && (
                <p className="text-caption text-text-secondary mt-1">
                  Required — the subject is the question pool this paper is built from.
                </p>
              )}
            </div>
          </div>

          <div>
            <label className="text-caption font-semibold text-text-secondary">
              Assessment Type (School Component) *
            </label>
            <select
              value={form.component_id}
              onChange={(e) => chooseComponent(e.target.value)}
              disabled={!form.class_id}
              className={`${SELECT_CLASS} mt-1 disabled:opacity-60`}
            >
              <option value="">Select assessment type (e.g. Test 1, Exam, CA 1)…</option>
              {components.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.maximum_score !== null ? ` (max ${c.maximum_score} pts)` : ""}
                </option>
              ))}
            </select>
            <p className="text-caption text-text-secondary mt-1">
              Derived from the school&apos;s configured grading components. CBT scores will sync into this component.
            </p>
          </div>

          <div>
            <label className="text-caption font-semibold text-text-secondary">
              Assessment Title (Auto-generated)
            </label>
            <Input
              value={form.title}
              readOnly
              placeholder="Auto-generated from Class, Subject, Assessment Type, and Term…"
              className="mt-1 opacity-90 cursor-not-allowed bg-bg"
            />
            <p className="text-caption text-text-secondary mt-1">
              Automatically generated based on the chosen Class, Subject, School Assessment Type, and active Term.
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
