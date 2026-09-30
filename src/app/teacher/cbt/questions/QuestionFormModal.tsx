"use client";

import { useEffect, useState } from "react";
import { Button, Input, Modal, toast } from "@/components/ui";

/**
 * The one question form (create and edit), shared by the question bank and the
 * CBT assessment builder.
 *
 * It is deliberately the SAME component in both places: "+ Add Question" during
 * assessment setup is not a second question system — it is this form with the
 * class and subject pinned to the assessment's context. The save goes through
 * the same `POST /api/cbt/questions`, which also puts the question in the
 * question bank.
 */

type QuestionType = "mcq" | "true_false" | "theory";

type ClassOption = { id: string; name: string; subjects: { id: string; name: string }[] };

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

const TYPE_LABELS: Record<QuestionType, string> = {
  mcq: "Multiple choice",
  true_false: "True / False",
  theory: "Theory",
};

const TRUE_FALSE_OPTIONS = ["True", "False"];

const TEXTAREA_CLASS =
  "w-full px-3 py-2.5 border border-border rounded-lg text-body bg-surface resize-y focus:outline-none focus:border-primary transition-colors";

function emptyForm(classId: string, subjectId: string): FormState {
  return {
    question_type: "mcq",
    question_text: "",
    marks: "1",
    topic: "",
    section: "",
    class_id: classId,
    subject_id: subjectId,
    options: ["", "", "", ""],
    correctIndex: 0,
    modelAnswer: "",
    rubric: "",
  };
}

export function QuestionFormModal({
  isOpen,
  onClose,
  onSaved,
  classes,
  questionId = null,
  fixedClassId = null,
  fixedSubjectId = null,
  fixedLabel = null,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSaved: (questionId: string | null) => void;
  /** Class + subject options the actor may use (may be empty for a pinned context). */
  classes: ClassOption[];
  /** Edit mode: load and update this question instead of creating one. */
  questionId?: string | null;
  /** Create mode with a pinned context (the assessment builder). */
  fixedClassId?: string | null;
  fixedSubjectId?: string | null;
  /** Display text for the pinned context, e.g. "Basic 1 · Mathematics". */
  fixedLabel?: string | null;
}) {
  const pinned = Boolean(fixedClassId && fixedSubjectId);
  const editing = Boolean(questionId);

  const [form, setForm] = useState<FormState>(() =>
    emptyForm(fixedClassId ?? "", fixedSubjectId ?? ""),
  );
  const [saving, setSaving] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Reset (or load the question being edited) each time the modal opens.
  useEffect(() => {
    if (!isOpen) return;

    setFormError(null);

    if (!questionId) {
      setForm(emptyForm(fixedClassId ?? "", fixedSubjectId ?? ""));
      return;
    }

    let cancelled = false;
    setLoadingDetail(true);
    fetch(`/api/cbt/questions/${questionId}`)
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          setFormError(body.error || "Could not load that question.");
          return;
        }
        if (cancelled) return;
        const detail = body.question;
        const options: string[] = (detail.options ?? []).map(
          (o: { option_text: string }) => o.option_text,
        );
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
      })
      .catch(() => setFormError("Could not load that question."))
      .finally(() => {
        if (!cancelled) setLoadingDetail(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, questionId, fixedClassId, fixedSubjectId]);

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
              : ["", "", "", ""],
      correctIndex: 0,
    }));
  };

  const submit = async () => {
    // Scope is part of a question's identity: when the actor has classes to file
    // under, the class and subject are required. A pinned context supplies both.
    if (!pinned && classes.length > 0) {
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

    const classId = pinned ? fixedClassId : form.class_id || null;
    const subjectId = pinned ? fixedSubjectId : form.subject_id || null;

    const payload: Record<string, unknown> = {
      question_type: form.question_type,
      question_text: form.question_text,
      marks: Number(form.marks),
      topic: form.topic || null,
      section: form.section.trim() || null,
      class_id: classId,
      subject_id: subjectId,
    };

    if (form.question_type === "theory") {
      payload.model_answer = form.modelAnswer || null;
      payload.marking_rubric = form.rubric || null;
    } else {
      payload.options = form.options.map((option_text) => ({ option_text }));
      payload.correct_option_index = form.correctIndex;
    }

    try {
      const res = await fetch(
        editing ? `/api/cbt/questions/${questionId}` : "/api/cbt/questions",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        setFormError(body.error || `Could not save (HTTP ${res.status})`);
        return;
      }

      toast.success(editing ? "Question updated" : "Question saved");
      onSaved(editing ? (questionId ?? null) : (typeof body.id === "string" ? body.id : null));
      onClose();
    } catch {
      setFormError("Could not reach the server.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={editing ? "Edit question" : "Add question"}
      size="lg"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={saving}
            disabled={loadingDetail}
            onClick={() => void submit()}
          >
            Save question
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

        {pinned ? (
          <div className="rounded-lg border border-border bg-clay px-3 py-2">
            <p className="text-caption text-text-secondary">
              Filed under{" "}
              <span className="font-semibold text-text-primary">
                {fixedLabel ?? "this assessment's class and subject"}
              </span>
            </p>
          </div>
        ) : (
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
                className="w-full mt-1 px-3 py-2.5 border border-border rounded-lg text-body bg-surface focus:outline-none focus:border-primary transition-colors disabled:opacity-50"
              >
                <option value="">Select subject…</option>
                {(classes.find((c) => c.id === form.class_id)?.subjects ?? []).map((s) => (
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
        )}

        {pinned && (
          <Input
            label="Section (optional)"
            value={form.section}
            onChange={(e) => setForm((f) => ({ ...f, section: e.target.value }))}
            placeholder="e.g. Section A"
          />
        )}

        <div>
          <label className="text-caption font-semibold text-text-secondary">Question</label>
          <textarea
            rows={3}
            value={form.question_text}
            onChange={(e) => setForm((f) => ({ ...f, question_text: e.target.value }))}
            placeholder="What is 5 × 4?"
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
  );
}
