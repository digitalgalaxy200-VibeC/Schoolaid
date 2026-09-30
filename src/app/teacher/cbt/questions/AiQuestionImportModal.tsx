"use client";

import { useState } from "react";
import { Badge, Button, Modal, toast } from "@/components/ui";

/**
 * AI question import — pick class + subject, paste the exam text, review what
 * the AI organised, correct anything, then Approve to save into the bank.
 *
 * The rule this screen exists to uphold: THE AI ORGANISES, THE TEACHER APPROVES.
 * Nothing the model produces is saved until a human has seen it — and a
 * multiple-choice question whose answer the model could not identify cannot be
 * saved until the teacher picks one.
 */

type QuestionType = "mcq" | "true_false" | "theory";

type ClassOption = { id: string; name: string; subjects: { id: string; name: string }[] };

type SectionDraft = { label: string; instruction: string };

type ReviewRow = {
  key: string;
  section: string; // "" = none
  question_type: QuestionType;
  question_text: string;
  options: string[];
  correct_index: number | null;
  marks: string;
  topic: string;
  model_answer: string;
};

const TYPE_LABELS: Record<QuestionType, string> = {
  mcq: "Multiple choice",
  true_false: "True / False",
  theory: "Theory",
};

const TEXTAREA_CLASS =
  "w-full mt-1 px-3 py-2 border border-border rounded-lg text-body bg-surface resize-y focus:outline-none focus:border-primary transition-colors";
const INPUT_CLASS =
  "w-full px-3 py-2 border border-border rounded-lg text-body bg-surface focus:outline-none focus:border-primary transition-colors";

let rowCounter = 0;
const nextKey = () => `row-${++rowCounter}`;

export function AiQuestionImportModal({
  isOpen,
  onClose,
  classOptions,
  onSaved,
  fixedClassId = null,
  fixedSubjectId = null,
  fixedLabel = null,
}: {
  isOpen: boolean;
  onClose: () => void;
  classOptions: ClassOption[];
  onSaved: () => void;
  /** Pinned context (the assessment builder): hides the class/subject pickers. */
  fixedClassId?: string | null;
  fixedSubjectId?: string | null;
  /** Display text for the pinned context, e.g. "Basic 1 · Mathematics". */
  fixedLabel?: string | null;
}) {
  const pinned = Boolean(fixedClassId && fixedSubjectId);
  const [phase, setPhase] = useState<"setup" | "organizing" | "review" | "saving">("setup");
  const [classId, setClassId] = useState(fixedClassId ?? "");
  const [subjectId, setSubjectId] = useState(fixedSubjectId ?? "");
  const [documentText, setDocumentText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sections, setSections] = useState<SectionDraft[]>([]);
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);

  const reset = () => {
    setPhase("setup");
    setClassId(fixedClassId ?? "");
    setSubjectId(fixedSubjectId ?? "");
    setDocumentText("");
    setError(null);
    setSections([]);
    setRows([]);
    setWarnings([]);
  };

  const disabled = phase === "organizing" || phase === "saving";

  const close = () => {
    reset();
    onClose();
  };

  const organize = async () => {
    setError(null);
    if (!classId) return setError("Choose the class first.");
    if (!subjectId) return setError("Choose the subject first.");
    if (!documentText.trim()) return setError("Paste the exam text first.");
    setPhase("organizing");
    try {
      const res = await fetch("/api/cbt/questions/ai-organize", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ class_id: classId, subject_id: subjectId, text: documentText }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error || `The AI could not organise this text (HTTP ${res.status}).`);
        setPhase("setup");
        return;
      }

      setSections(
        (Array.isArray(body.sections) ? body.sections : []).map((s: Record<string, unknown>) => ({
          label: String(s.label ?? ""),
          instruction: s.instruction == null ? "" : String(s.instruction),
        })),
      );
      setRows(
        (Array.isArray(body.questions) ? body.questions : []).map(
          (q: Record<string, unknown>): ReviewRow => {
            const type = (q.question_type ?? "mcq") as QuestionType;
            const rawOptions = Array.isArray(q.options) ? q.options.map(String) : [];
            return {
              key: nextKey(),
              section: q.section == null ? "" : String(q.section),
              question_type: type,
              question_text: String(q.question_text ?? ""),
              options:
                rawOptions.length > 0
                  ? rawOptions
                  : type === "mcq"
                    ? ["", ""]
                    : type === "true_false"
                      ? ["True", "False"]
                      : [],
              correct_index: typeof q.correct_index === "number" ? q.correct_index : null,
              marks: String(q.marks ?? 1),
              topic: q.topic == null ? "" : String(q.topic),
              model_answer: q.model_answer == null ? "" : String(q.model_answer),
            };
          },
        ),
      );
      setWarnings(Array.isArray(body.warnings) ? body.warnings.map(String) : []);
      setPhase("review");
    } catch {
      setError("Could not reach the server.");
      setPhase("setup");
    }
  };

  const updateRow = (key: string, patch: Partial<ReviewRow>) =>
    setRows((current) => current.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const save = async () => {
    setError(null);
    if (!classId || !subjectId) {
      setError("The class and subject are missing — start again.");
      return;
    }
    if (rows.length === 0) {
      setError("There is nothing to save.");
      return;
    }

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (!r.question_text.trim()) {
        setError(`Question ${i + 1}: the text is empty.`);
        return;
      }
      if (r.question_type !== "theory") {
        const filled = r.options.map((o) => o.trim()).filter(Boolean);
        if (filled.length < 2) {
          setError(`Question ${i + 1}: needs at least two options.`);
          return;
        }
        if (
          r.correct_index === null ||
          r.correct_index < 0 ||
          r.correct_index >= r.options.length ||
          !r.options[r.correct_index]?.trim()
        ) {
          setError(`Question ${i + 1}: choose the correct answer before saving.`);
          return;
        }
      }
    }

    setPhase("saving");
    try {
      const payload = {
        class_id: classId,
        subject_id: subjectId,
        sections: sections.map((s) => ({
          label: s.label,
          instruction: s.instruction.trim() || null,
        })),
        questions: rows.map((r) => {
          const base: Record<string, unknown> = {
            question_type: r.question_type,
            question_text: r.question_text.trim(),
            marks: Number(r.marks) || 1,
            topic: r.topic.trim() || null,
            section: r.section || null,
          };
          if (r.question_type === "theory") {
            base.model_answer = r.model_answer.trim() || null;
          } else {
            base.options = r.options
              .map((o) => ({ option_text: o.trim() }))
              .filter((o) => o.option_text);
            base.correct_option_index = r.correct_index;
          }
          return base;
        }),
      };

      const res = await fetch("/api/cbt/questions/ai-save", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error || `Could not save (HTTP ${res.status}).`);
        setPhase("review");
        return;
      }

      toast.success(`${body.created ?? rows.length} questions saved to the question bank`);
      reset();
      onSaved();
      onClose();
    } catch {
      setError("Could not reach the server.");
      setPhase("review");
    }
  };

  const sectionChoices = sections.map((s) => s.label);

  return (
    <Modal
      isOpen={isOpen}
      onClose={disabled ? () => undefined : close}
      title="AI question import"
      size="lg"
      footer={
        phase === "review" || phase === "saving" ? (
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setPhase("setup")} disabled={disabled}>
              Back
            </Button>
            <Button variant="primary" loading={phase === "saving"} onClick={() => void save()} disabled={disabled}>
              Approve &amp; save {rows.length} question{rows.length === 1 ? "" : "s"}
            </Button>
          </div>
        ) : (
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={close} disabled={disabled}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={phase === "organizing"}
              onClick={() => void organize()}
              disabled={disabled}
            >
              Organise with AI
            </Button>
          </div>
        )
      }
    >
      <div className="space-y-4">
        {error && (
          <div className="rounded-lg border border-error bg-error-bg px-4 py-3 text-body text-error">
            {error}
          </div>
        )}

        {phase === "setup" || phase === "organizing" ? (
          <>
            <p className="text-body text-text-secondary">
              {pinned
                ? "Paste the exam text (sections and instructions included). The AI organises it — nothing is saved until you review and approve."
                : "Choose the class and subject first, then paste the exam text (sections and instructions included). The AI organises it — nothing is saved until you review and approve."}
            </p>

            {pinned ? (
              <div className="rounded-lg border border-border bg-clay px-3 py-2">
                <p className="text-caption text-text-secondary">
                  Filing under{" "}
                  <span className="font-semibold text-text-primary">
                    {fixedLabel ?? "this assessment's class and subject"}
                  </span>
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 tablet:grid-cols-2 gap-4">
                <div>
                  <label className="text-caption font-semibold text-text-secondary">Class</label>
                  <select
                    value={classId}
                    onChange={(e) => {
                      setClassId(e.target.value);
                      setSubjectId("");
                    }}
                    className={`${INPUT_CLASS} mt-1`}
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
                    value={subjectId}
                    onChange={(e) => setSubjectId(e.target.value)}
                    disabled={!classId}
                    className={`${INPUT_CLASS} mt-1 disabled:opacity-50`}
                  >
                    <option value="">Select subject…</option>
                    {(classOptions.find((c) => c.id === classId)?.subjects ?? []).map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            <div>
              <label className="text-caption font-semibold text-text-secondary">Exam text</label>
              <textarea
                rows={12}
                value={documentText}
                onChange={(e) => setDocumentText(e.target.value)}
                placeholder={
                  "SECTION A – OBJECTIVE\n\nInstruction: Answer all questions.\n\n1. What is 5 × 4?\nA. 10\nB. 15\nC. 20\nD. 25\nAnswer: C"
                }
                className={TEXTAREA_CLASS}
              />
            </div>
          </>
        ) : (
          <>
            {warnings.length > 0 && (
              <div className="rounded-lg border border-warning bg-warning-bg px-4 py-3 text-caption text-warning space-y-1">
                {warnings.slice(0, 6).map((w, i) => (
                  <p key={i}>{w}</p>
                ))}
                {warnings.length > 6 && <p>…and {warnings.length - 6} more.</p>}
              </div>
            )}

            {sections.length > 0 && (
              <div className="space-y-2">
                <p className="text-caption font-semibold text-text-secondary">Sections</p>
                {sections.map((s, i) => (
                  <div key={i} className="rounded-lg border border-border bg-surface px-3 py-2 space-y-1">
                    <p className="text-caption font-semibold">{s.label}</p>
                    <textarea
                      rows={2}
                      value={s.instruction}
                      placeholder="Section instruction (optional)"
                      onChange={(e) =>
                        setSections((current) =>
                          current.map((x, j) => (j === i ? { ...x, instruction: e.target.value } : x)),
                        )
                      }
                      className={TEXTAREA_CLASS}
                    />
                  </div>
                ))}
              </div>
            )}

            <p className="text-caption text-text-secondary">
              {rows.length} question{rows.length === 1 ? "" : "s"} organised — review and correct
              anything before saving.
            </p>

            <div className="space-y-3">
              {rows.map((r, index) => (
                <div key={r.key} className="rounded-lg border border-border bg-surface px-3 py-3 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-caption font-bold">Q{index + 1}</span>
                    <Badge variant="info">{TYPE_LABELS[r.question_type]}</Badge>
                    {sectionChoices.length > 0 && (
                      <select
                        value={r.section}
                        onChange={(e) => updateRow(r.key, { section: e.target.value })}
                        className="px-2 py-1 rounded border border-border text-caption bg-surface"
                      >
                        <option value="">No section</option>
                        {sectionChoices.map((label) => (
                          <option key={label} value={label}>
                            {label}
                          </option>
                        ))}
                      </select>
                    )}
                    <label className="text-caption text-text-secondary ml-auto flex items-center gap-1">
                      Marks
                      <input
                        type="number"
                        min={0.5}
                        step={0.5}
                        value={r.marks}
                        onChange={(e) => updateRow(r.key, { marks: e.target.value })}
                        className="w-20 px-2 py-1 rounded border border-border text-caption bg-surface"
                      />
                    </label>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setRows((current) => current.filter((x) => x.key !== r.key))}
                    >
                      Remove
                    </Button>
                  </div>

                  <textarea
                    rows={2}
                    value={r.question_text}
                    onChange={(e) => updateRow(r.key, { question_text: e.target.value })}
                    className={TEXTAREA_CLASS}
                  />

                  {r.question_type === "theory" ? (
                    <textarea
                      rows={2}
                      value={r.model_answer}
                      placeholder="Model answer (optional)"
                      onChange={(e) => updateRow(r.key, { model_answer: e.target.value })}
                      className={TEXTAREA_CLASS}
                    />
                  ) : (
                    <div className="space-y-1">
                      {r.options.map((option, oi) => (
                        <div key={oi} className="flex items-center gap-2">
                          <input
                            type="radio"
                            name={`correct-${r.key}`}
                            checked={r.correct_index === oi}
                            onChange={() => updateRow(r.key, { correct_index: oi })}
                            className="accent-[var(--color-primary)]"
                          />
                          <input
                            type="text"
                            value={option}
                            onChange={(e) =>
                              updateRow(r.key, {
                                options: r.options.map((o, j) => (j === oi ? e.target.value : o)),
                              })
                            }
                            className="flex-1 px-3 py-1.5 border border-border rounded-lg text-body bg-surface focus:outline-none focus:border-primary transition-colors"
                          />
                        </div>
                      ))}
                      {r.correct_index === null && (
                        <p className="text-caption text-warning">
                          The correct answer was not identified — select it.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
