"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, Button, Input, Badge, Table, Modal, toast } from "@/components/ui";
import { AiQuestionImportModal } from "./AiQuestionImportModal";

/**
 * CBT question bank (Phase 17 UI).
 *
 * The teacher's authoring surface: write a question, get it approved, keep it.
 *
 * Two things this screen is careful about:
 *
 * 1. It renders the ALLOWED SHAPE ONLY. The list endpoint returns neither options
 *    nor the answer key, and this page does not fetch the key to render a table —
 *    that would put correct answers into a browser that has no use for them. The
 *    key is fetched only when ONE question is opened for editing.
 *
 * 2. It surfaces the API's refusals verbatim. "An approved question cannot be
 *    edited in place — reopen it first" is actionable advice; rewriting it into
 *    "Something went wrong" throws away the only useful part.
 *
 * Styling note: the class names here were taken from `globals.css`, not from
 * `docs/DESIGN_TOKENS.md` — the doc still describes an older palette (`brand-*`,
 * `bg-bg-surface`, `text-heading1`) that no longer generates utilities, so those
 * classes would silently do nothing.
 */

type QuestionType = "mcq" | "true_false" | "theory";
type QuestionStatus = "draft" | "review" | "approved" | "archived";

type Question = {
  id: string;
  question_type: QuestionType;
  question_text: string;
  marks: number;
  status: QuestionStatus;
  topic: string | null;
  section: string | null;
  class_id: string | null;
  subject_id: string | null;
};

type ClassOption = { id: string; name: string; subjects: { id: string; name: string }[] };

const TYPE_LABELS: Record<QuestionType, string> = {
  mcq: "Multiple choice",
  true_false: "True / False",
  theory: "Theory",
};

const STATUS_VARIANT: Record<QuestionStatus, "draft" | "info" | "success" | "default"> = {
  draft: "draft",
  review: "info",
  approved: "success",
  archived: "default",
};

const TRUE_FALSE_OPTIONS = ["True", "False"];

const TEXTAREA_CLASS =
  "w-full mt-1 px-3 py-2.5 border border-border rounded-lg text-body bg-surface resize-y focus:outline-none focus:border-primary transition-colors";

type FormState = {
  question_type: QuestionType;
  question_text: string;
  marks: string;
  topic: string;
  section: string;
  class_id: string;
  subject_id: string;
  options: string[];
  correctIndex: number;
  modelAnswer: string;
  rubric: string;
};

const emptyForm = (): FormState => ({
  question_type: "mcq",
  question_text: "",
  marks: "1",
  topic: "",
  section: "",
  class_id: "",
  subject_id: "",
  options: ["", ""],
  correctIndex: 0,
  modelAnswer: "",
  rubric: "",
});

export default function QuestionBankPage() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<QuestionStatus | "all">("all");

  // Context filters. Questions belong to a class + subject, and a teacher's bank
  // opens on their own classes first (untagged legacy questions stay visible).
  const [classOptions, setClassOptions] = useState<ClassOption[]>([]);
  const [filterClass, setFilterClass] = useState("");
  const [filterSubject, setFilterSubject] = useState("");
  const [showAllSchool, setShowAllSchool] = useState(false);

  // AI import availability (school AI flag). Hidden until proven enabled.
  const [aiEnabled, setAiEnabled] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (filterClass) {
        params.set("class_id", filterClass);
        params.set("include_unscoped", "1");
      }
      if (filterSubject) {
        params.set("subject_id", filterSubject);
        params.set("include_unscoped", "1");
      }
      const query = params.toString();
      const res = await fetch(`/api/cbt/questions${query ? `?${query}` : ""}`);
      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(body.error || `Could not load the question bank (HTTP ${res.status})`);
        setQuestions([]);
        return;
      }
      setQuestions(body.questions ?? []);
    } catch {
      setError("Could not reach the server.");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, filterClass, filterSubject]);

  useEffect(() => {
    // The builder-options endpoint already answers "which classes and subjects
    // may this actor work with" — reuse it rather than growing a second rule.
    fetch("/api/cbt/assessments/options")
      .then((r) => {
        if (!r.ok) throw new Error("options");
        return r.json();
      })
      .then((d) => setClassOptions(Array.isArray(d.classes) ? d.classes : []))
      .catch(() =>
        toast.error("Could not load your classes", "Class and subject filters may be incomplete."),
      );
  }, []);

  useEffect(() => {
    fetch("/api/cbt/questions/ai-organize")
      .then((r) => (r.ok ? r.json() : { enabled: false }))
      .then((d) => setAiEnabled(d?.enabled === true))
      .catch(() => setAiEnabled(false));
  }, []);

  useEffect(() => {
    // Deferred to a microtask. `load` sets state as its first act, and calling it
    // synchronously from the effect body trips the cascading-render lint rule —
    // the existing pages sidestep it with a `.then()` chain.
    void Promise.resolve().then(load);
  }, [load]);

  const openNew = () => {
    setEditingId(null);
    setForm(emptyForm());
    setFormError(null);
    setIsFormOpen(true);
  };

  const openEdit = async (q: Question) => {
    setFormError(null);
    setEditingId(q.id);
    const res = await fetch(`/api/cbt/questions/${q.id}`);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setFormError(body.error || "Could not load that question.");
      setIsFormOpen(true);
      return;
    }
    const detail = body.question;
    const options: string[] = (detail.options ?? []).map((o: { option_text: string }) => o.option_text);
    const correctOptionId: string | null = detail.answer_key?.correct_option_id ?? null;
    const correctIndex = correctOptionId
      ? (detail.options ?? []).findIndex((o: { id: string }) => o.id === correctOptionId)
      : 0;

    setForm({
      question_type: detail.question_type,
      question_text: detail.question_text,
      marks: String(detail.marks),
      topic: detail.topic ?? "",
      section: detail.section ?? "",
      class_id: detail.class_id ?? "",
      subject_id: detail.subject_id ?? "",
      options: options.length >= 2 ? options : ["", ""],
      correctIndex: correctIndex >= 0 ? correctIndex : 0,
      modelAnswer: detail.answer_key?.model_answer ?? "",
      rubric: detail.answer_key?.marking_rubric ?? "",
    });
    setIsFormOpen(true);
  };

  const setType = (question_type: QuestionType) => {
    setForm((f) => ({
      ...f,
      question_type,
      options:
        question_type === "true_false"
          ? [...TRUE_FALSE_OPTIONS]
          : question_type === "theory"
            ? []
            : f.options.length >= 2
              ? f.options
              : ["", ""],
      correctIndex: 0,
    }));
  };

  const submit = async () => {
    // Scope is part of a question's identity, so when the teacher has classes
    // available the class and subject are required — the question lands in the
    // right bank. A teacher with no class assignments can still save a general
    // question rather than being blocked entirely.
    if (classOptions.length > 0) {
      if (!form.class_id) {
        setFormError("Choose the class this question belongs to.");
        return;
      }
      if (!form.subject_id) {
        setFormError("Choose the subject this question belongs to.");
        return;
      }
    }

    setSaving(true);
    setFormError(null);

    const payload: Record<string, unknown> = {
      question_type: form.question_type,
      question_text: form.question_text,
      marks: Number(form.marks),
      topic: form.topic || null,
      section: form.section.trim() || null,
      class_id: form.class_id || null,
      subject_id: form.subject_id || null,
    };

    if (form.question_type === "theory") {
      payload.model_answer = form.modelAnswer || null;
      payload.marking_rubric = form.rubric || null;
    } else {
      payload.options = form.options.map((option_text) => ({ option_text }));
      payload.correct_option_index = form.correctIndex;
    }

    try {
      const res = await fetch(editingId ? `/api/cbt/questions/${editingId}` : "/api/cbt/questions", {
        method: editingId ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        setFormError(body.error || `Could not save (HTTP ${res.status})`);
        return;
      }

      toast.success(editingId ? "Question updated" : "Question created");
      setIsFormOpen(false);
      await load();
    } catch {
      setFormError("Could not reach the server.");
    } finally {
      setSaving(false);
    }
  };

  const moveTo = async (q: Question, status: QuestionStatus) => {
    const res = await fetch(`/api/cbt/questions/${q.id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(body.error || "Could not change the status");
      return;
    }
    toast.success(`Moved to ${status}`);
    await load();
  };

  // Default view: the teacher's own context (plus untagged legacy questions),
  // so questions outside their classes/subjects are not the first thing they see.
  const myClassIds = new Set(classOptions.map((c) => c.id));
  const subjectIdsByClass = new Map(
    classOptions.map((c) => [c.id, new Set(c.subjects.map((s) => s.id))]),
  );
  const inMyContext = (q: Question) => {
    if (!q.class_id) return true; // unscoped/legacy — still visible
    if (!myClassIds.has(q.class_id)) return false;
    if (!q.subject_id) return true; // scoped to the class only
    return subjectIdsByClass.get(q.class_id)?.has(q.subject_id) ?? true;
  };
  const contextFiltering = !filterClass && !filterSubject && !showAllSchool;
  const visibleQuestions = contextFiltering ? questions.filter(inMyContext) : questions;

  const columns = [
    {
      key: "question_text",
      header: "Question",
      render: (q: Question) => (
        <span className="line-clamp-2 max-w-[38ch] inline-block align-middle">{q.question_text}</span>
      ),
    },
    {
      key: "question_type",
      header: "Type",
      render: (q: Question) => (
        <span className="text-text-secondary">{TYPE_LABELS[q.question_type]}</span>
      ),
    },
    {
      key: "context",
      header: "Class / Subject",
      render: (q: Question) => {
        const cls = classOptions.find((c) => c.id === q.class_id);
        const subj = classOptions.flatMap((c) => c.subjects).find((s) => s.id === q.subject_id);
        return (
          <span className="text-caption text-text-secondary">
            {cls?.name ?? "—"}
            {subj ? ` · ${subj.name}` : ""}
            {q.section ? ` · ${q.section}` : ""}
          </span>
        );
      },
    },
    {
      key: "marks",
      header: "Marks",
      className: "w-20",
      render: (q: Question) => <span className="font-mono">{q.marks}</span>,
    },
    {
      key: "status",
      header: "Status",
      className: "w-28",
      render: (q: Question) => <Badge variant={STATUS_VARIANT[q.status]}>{q.status}</Badge>,
    },
    {
      key: "actions",
      header: "",
      className: "w-72",
      render: (q: Question) => (
        <div className="flex gap-2 justify-end">
          {(q.status === "draft" || q.status === "review") && (
            <Button size="sm" variant="secondary" onClick={() => void moveTo(q, "approved")}>
              Approve
            </Button>
          )}
          {q.status === "approved" && (
            <Button size="sm" variant="secondary" onClick={() => void moveTo(q, "review")}>
              Reopen
            </Button>
          )}
          {q.status === "archived" && (
            <Button size="sm" variant="secondary" onClick={() => void moveTo(q, "draft")}>
              Restore
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => void openEdit(q)}>
            Edit
          </Button>
          {q.status !== "archived" && (
            <Button size="sm" variant="ghost" onClick={() => void moveTo(q, "archived")}>
              Archive
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="p-6 tablet:p-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-h1 font-bold text-text-primary">Question bank</h1>
          <p className="text-body text-text-secondary mt-1">
            Write and approve questions. Each question is filed under its class and subject,
            and must be approved before an assessment containing it can be published.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {aiEnabled && (
            <Button variant="secondary" onClick={() => setAiOpen(true)}>
              AI import
            </Button>
          )}
          <Button variant="primary" onClick={openNew}>
            New question
          </Button>
        </div>
      </div>

      <Card variant="default" className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-caption text-text-secondary font-semibold">Show:</span>
          {(["all", "draft", "review", "approved", "archived"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1 rounded-full text-caption font-semibold border transition-colors ${
                statusFilter === s
                  ? "bg-primary text-text-inverse border-primary"
                  : "bg-surface text-text-secondary border-border hover:bg-clay"
              }`}
            >
              {s === "all" ? "All" : s}
            </button>
          ))}
          <div className="ml-auto">
            <Button size="sm" variant="ghost" onClick={() => void load()}>
              Refresh
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-caption text-text-secondary font-semibold">Class:</span>
          <select
            value={filterClass}
            onChange={(e) => {
              setFilterClass(e.target.value);
              setFilterSubject("");
            }}
            className="px-3 py-1.5 rounded-lg text-caption bg-surface border border-border focus:outline-none focus:border-primary transition-colors"
          >
            <option value="">All my classes</option>
            {classOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <span className="text-caption text-text-secondary font-semibold">Subject:</span>
          <select
            value={filterSubject}
            onChange={(e) => setFilterSubject(e.target.value)}
            disabled={!filterClass}
            className="px-3 py-1.5 rounded-lg text-caption bg-surface border border-border focus:outline-none focus:border-primary transition-colors disabled:opacity-50"
          >
            <option value="">All subjects</option>
            {(classOptions.find((c) => c.id === filterClass)?.subjects ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          {!filterClass && !filterSubject && (
            <button
              type="button"
              onClick={() => setShowAllSchool((v) => !v)}
              className={`px-3 py-1.5 rounded-full text-caption font-semibold border transition-colors ${
                showAllSchool
                  ? "bg-surface text-text-secondary border-border hover:bg-clay"
                  : "bg-primary text-text-inverse border-primary"
              }`}
            >
              {showAllSchool ? "Showing all school questions" : "Showing my classes only"}
            </button>
          )}
        </div>

        {error && (
          <div className="rounded-lg border border-error bg-error-bg px-4 py-3 text-body text-error">
            {error}
          </div>
        )}

        <Table
          columns={columns}
          data={visibleQuestions}
          keyExtractor={(q) => q.id}
          loading={loading}
          emptyMessage={
            contextFiltering && questions.length > 0
              ? "No questions for your classes yet. Switch to all school questions, or create one."
              : statusFilter === "all"
                ? "No questions yet. Start with New question."
                : `No ${statusFilter} questions.`
          }
        />
      </Card>

      <Modal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title={editingId ? "Edit question" : "New question"}
        size="lg"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setIsFormOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" loading={saving} onClick={() => void submit()}>
              {editingId ? "Save changes" : "Create question"}
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

          <div>
            <label className="text-caption font-semibold text-text-secondary">Type</label>
            <div className="flex flex-wrap gap-2 mt-1">
              {(Object.keys(TYPE_LABELS) as QuestionType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={`px-3 py-1.5 rounded-md text-caption font-semibold border transition-colors ${
                    form.question_type === t
                      ? "bg-primary text-text-inverse border-primary"
                      : "bg-surface text-text-secondary border-border hover:bg-clay"
                  }`}
                >
                  {TYPE_LABELS[t]}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 tablet:grid-cols-3 gap-4">
            <div>
              <label className="text-caption font-semibold text-text-secondary">Class</label>
              <select
                value={form.class_id}
                onChange={(e) =>
                  setForm((f) => ({ ...f, class_id: e.target.value, subject_id: "" }))
                }
                className="w-full mt-1 px-3 py-2.5 border border-border rounded-lg text-body bg-surface focus:outline-none focus:border-primary transition-colors"
              >
                <option value="">Select class…</option>
                {classOptions.map((c) => (
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
                className="w-full mt-1 px-3 py-2.5 border border-border rounded-lg text-body bg-surface focus:outline-none focus:border-primary transition-colors disabled:opacity-50"
              >
                <option value="">Select subject…</option>
                {(classOptions.find((c) => c.id === form.class_id)?.subjects ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <Input
              label="Section (optional)"
              value={form.section}
              onChange={(e) => setForm((f) => ({ ...f, section: e.target.value }))}
              placeholder="e.g. Section A"
            />
          </div>

          <div>
            <label className="text-caption font-semibold text-text-secondary">Question</label>
            <textarea
              rows={3}
              value={form.question_text}
              onChange={(e) => setForm((f) => ({ ...f, question_text: e.target.value }))}
              placeholder="What is 2 + 2?"
              className={TEXTAREA_CLASS}
            />
          </div>

          <div className="grid grid-cols-1 tablet:grid-cols-2 gap-4">
            <Input
              label="Marks"
              type="number"
              min={0.5}
              step={0.5}
              value={form.marks}
              onChange={(e) => setForm((f) => ({ ...f, marks: e.target.value }))}
            />
            <Input
              label="Topic (optional)"
              value={form.topic}
              onChange={(e) => setForm((f) => ({ ...f, topic: e.target.value }))}
            />
          </div>

          {form.question_type === "theory" ? (
            <>
              <div>
                <label className="text-caption font-semibold text-text-secondary">
                  Model answer (optional)
                </label>
                <textarea
                  rows={3}
                  value={form.modelAnswer}
                  onChange={(e) => setForm((f) => ({ ...f, modelAnswer: e.target.value }))}
                  className={TEXTAREA_CLASS}
                />
              </div>
              <div>
                <label className="text-caption font-semibold text-text-secondary">
                  Marking rubric
                </label>
                <textarea
                  rows={3}
                  value={form.rubric}
                  onChange={(e) => setForm((f) => ({ ...f, rubric: e.target.value }))}
                  placeholder="1 mark per correct stage, max 5."
                  className={TEXTAREA_CLASS}
                />
                <p className="text-caption text-text-secondary mt-1">
                  A theory question needs a model answer or a rubric, and is always marked by a
                  person — never automatically.
                </p>
              </div>
            </>
          ) : (
            <div>
              <label className="text-caption font-semibold text-text-secondary">
                Options — select the correct one
              </label>
              <div className="space-y-2 mt-1">
                {form.options.map((option, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="correct-option"
                      checked={form.correctIndex === i}
                      onChange={() => setForm((f) => ({ ...f, correctIndex: i }))}
                      aria-label={`Option ${i + 1} is correct`}
                      className="accent-[var(--color-primary)]"
                    />
                    <input
                      type="text"
                      value={option}
                      placeholder={`Option ${String.fromCharCode(65 + i)}`}
                      onChange={(e) =>
                        setForm((f) => {
                          const options = [...f.options];
                          options[i] = e.target.value;
                          return { ...f, options };
                        })
                      }
                      className="flex-1 px-3 py-2 border border-border rounded-lg text-body bg-surface focus:outline-none focus:border-primary transition-colors"
                    />
                    {form.question_type === "mcq" && form.options.length > 2 && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          setForm((f) => {
                            const options = f.options.filter((_, idx) => idx !== i);
                            return {
                              ...f,
                              options,
                              correctIndex: Math.min(f.correctIndex, options.length - 1),
                            };
                          })
                        }
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                ))}
              </div>
              {form.question_type === "mcq" && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setForm((f) => ({ ...f, options: [...f.options, ""] }))}
                >
                  Add option
                </Button>
              )}
            </div>
          )}
        </div>
      </Modal>

      <AiQuestionImportModal
        isOpen={aiOpen}
        onClose={() => setAiOpen(false)}
        classOptions={classOptions}
        onSaved={() => void load()}
      />
    </div>
  );
}
