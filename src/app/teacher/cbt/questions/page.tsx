"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Card, Table } from "@/components/ui";
import { AiQuestionImportModal } from "./AiQuestionImportModal";
import { QuestionFormModal } from "./QuestionFormModal";

/**
 * Question bank (teacher-facing) — a repository of saved questions, viewed one
 * class + one subject at a time.
 *
 * The lifecycle (draft/review/approved/archived) still exists underneath — the
 * assessment pool reads `approved`, and the publish gate checks it — but it is
 * not a teacher workflow: saving a question is the approval step, and this
 * screen shows saved questions rather than statuses. Archived questions are
 * retired and hidden here.
 *
 * The class/subject lists come from `/api/cbt/questions/context`, which returns
 * only contexts the actor is actually assigned to — and the server enforces the
 * same rule on every read and write, so the dropdowns are convenience, not the
 * control.
 */

type QuestionType = "mcq" | "true_false" | "theory";

type Question = {
  id: string;
  question_type: QuestionType;
  question_text: string;
  marks: number;
  status: string;
  class_id: string | null;
  subject_id: string | null;
  section: string | null;
  has_image?: boolean;
};

type ClassOption = { id: string; name: string; subjects: { id: string; name: string }[] };

const TYPE_LABELS: Record<QuestionType, string> = {
  mcq: "Multiple choice",
  true_false: "True / False",
  theory: "Theory",
};

const SELECT_CLASS =
  "px-3 py-2 rounded-lg text-body bg-surface border border-border focus:outline-none focus:border-primary transition-colors";

export default function QuestionBankPage() {
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [classesError, setClassesError] = useState<string | null>(null);

  const [classId, setClassId] = useState("");
  const [subjectId, setSubjectId] = useState("");

  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // AI import availability (school AI flag). Hidden until proven enabled.
  const [aiEnabled, setAiEnabled] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const contextChosen = Boolean(classId && subjectId);
  const noAssignments = classes.length === 0 && !classesError;

  useEffect(() => {
    fetch("/api/cbt/questions/context")
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(body.error || "Could not load your classes.");
        return body;
      })
      .then((d) => setClasses(Array.isArray(d.classes) ? d.classes : []))
      .catch(() =>
        setClassesError(
          "Could not load your classes and subjects. Reload the page, or ask your school admin to assign you.",
        ),
      );
  }, []);

  useEffect(() => {
    fetch("/api/cbt/questions/ai-organize")
      .then((r) => (r.ok ? r.json() : { enabled: false }))
      .then((d) => setAiEnabled(d?.enabled === true))
      .catch(() => setAiEnabled(false));
  }, []);

  const load = useCallback(async () => {
    if (!classId || !subjectId) {
      setQuestions([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ class_id: classId, subject_id: subjectId });
      const res = await fetch(`/api/cbt/questions?${params.toString()}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error || `Could not load questions (HTTP ${res.status})`);
        setQuestions([]);
        return;
      }
      // Retired questions are not part of the working bank.
      setQuestions(
        (body.questions ?? []).filter((q: Question) => q.status !== "archived"),
      );
    } catch {
      setError("Could not reach the server.");
      setQuestions([]);
    } finally {
      setLoading(false);
    }
  }, [classId, subjectId]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const chooseClass = (value: string) => {
    setClassId(value);
    setSubjectId("");
  };

  const openNew = () => {
    setEditingId(null);
    setFormOpen(true);
  };

  const openEdit = (q: Question) => {
    setEditingId(q.id);
    setFormOpen(true);
  };

  const subjectName = classes
    .find((c) => c.id === classId)
    ?.subjects.find((s) => s.id === subjectId)?.name;
  const className = classes.find((c) => c.id === classId)?.name;

  const columns = [
    {
      key: "question_text",
      header: "Question",
      render: (q: Question) => (
        <span className="line-clamp-2 max-w-[52ch] inline-block align-middle">
          {q.question_text}
        </span>
      ),
    },
    {
      key: "meta",
      header: "Details",
      render: (q: Question) => (
        <span className="text-caption text-text-secondary">
          {TYPE_LABELS[q.question_type]} · {q.marks} mark(s)
          {q.section ? ` · ${q.section}` : ""}
          {q.has_image ? " · Image" : ""}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      className: "w-24",
      render: (q: Question) => (
        <div className="flex justify-end">
          <Button size="sm" variant="ghost" onClick={() => openEdit(q)}>
            Edit
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="p-4 tablet:p-8 space-y-6">
      <div>
        <h1 className="text-h1 font-bold text-text-primary">Question bank</h1>
        <p className="text-body text-text-secondary mt-1">
          Saved questions, filed under a class and subject. Questions saved here can be used in any
          CBT assessment for that class and subject.
        </p>
      </div>

      {classesError && (
        <div className="rounded-lg border border-error bg-error-bg px-4 py-3 text-body text-error">
          {classesError}
        </div>
      )}

      {noAssignments && !classesError && (
        <div className="rounded-lg border border-warning bg-warning-bg px-4 py-3 text-body text-warning">
          You have no class and subject assignments yet, so there is no bank to show. Ask your
          school admin to assign you to the subjects you teach.
        </div>
      )}

      <Card variant="default" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="w-full tablet:w-auto">
              <label className="text-caption font-semibold text-text-secondary">Class</label>
              <select
                value={classId}
                onChange={(e) => chooseClass(e.target.value)}
                className={`${SELECT_CLASS} block mt-1 w-full min-w-44 tablet:w-auto`}
              >
                <option value="">Select class…</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="w-full tablet:w-auto">
              <label className="text-caption font-semibold text-text-secondary">Subject</label>
              <select
                value={subjectId}
                onChange={(e) => setSubjectId(e.target.value)}
                disabled={!classId}
                className={`${SELECT_CLASS} block mt-1 w-full min-w-44 tablet:w-auto disabled:opacity-50`}
              >
                <option value="">Select subject…</option>
                {(classes.find((c) => c.id === classId)?.subjects ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {contextChosen && aiEnabled && (
              <Button
                variant="secondary"
                className="w-full tablet:w-auto"
                onClick={() => setAiOpen(true)}
              >
                AI import
              </Button>
            )}
            {contextChosen && (
              <Button variant="primary" className="w-full tablet:w-auto" onClick={openNew}>
                New question
              </Button>
            )}
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-error bg-error-bg px-4 py-3 text-body text-error">
            {error}
          </div>
        )}

        {!contextChosen ? (
          <p className="text-body text-text-secondary">
            {classes.length > 0
              ? "Choose a class and a subject to see its saved questions."
              : "Saved questions appear here once you have a class and subject."}
          </p>
        ) : (
          <>
            <p className="text-caption text-text-secondary">
              Saved questions for{" "}
              <span className="font-semibold text-text-primary">
                {className}
                {subjectName ? ` · ${subjectName}` : ""}
              </span>
            </p>
            <Table
              columns={columns}
              data={questions}
              keyExtractor={(q) => q.id}
              loading={loading}
              emptyMessage="No saved questions for this class and subject yet. Start with New question."
              mobileCard={(q) => (
                <div className="space-y-3">
                  <p className="text-body-lg font-semibold text-text-primary">{q.question_text}</p>
                  <p className="text-caption text-text-secondary">
                    {TYPE_LABELS[q.question_type]} · {q.marks} mark(s)
                    {q.section ? ` · ${q.section}` : ""}
                    {q.has_image ? " · Image" : ""}
                  </p>
                  <Button
                    variant="secondary"
                    size="lg"
                    className="w-full"
                    onClick={() => openEdit(q)}
                  >
                    Edit
                  </Button>
                </div>
              )}
            />
          </>
        )}
      </Card>

      <QuestionFormModal
        isOpen={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditingId(null);
        }}
        onSaved={() => void load()}
        classes={classes}
        questionId={editingId}
        initialClassId={classId || null}
        initialSubjectId={subjectId || null}
      />

      <AiQuestionImportModal
        isOpen={aiOpen}
        onClose={() => setAiOpen(false)}
        classOptions={classes}
        onSaved={() => void load()}
        initialClassId={classId || null}
        initialSubjectId={subjectId || null}
      />
    </div>
  );
}
