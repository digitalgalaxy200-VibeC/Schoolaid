"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Card, Modal, Table, toast } from "@/components/ui";
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

type BankSubject = { id: string; name: string; questions: number };
type BankClass = { id: string; name: string; questions: number; subjects: BankSubject[] };
type BankTerm = { id: string; name: string; questions: number; classes: BankClass[] };
type BankSession = { id: string; name: string; questions: number; terms: BankTerm[] };

/** The shape `GET /api/cbt/questions/{id}` returns for the preview modal. */
type QuestionDetail = {
  options: { id: string; label: string | null; option_text: string }[];
  answer_key: {
    correct_option_id: string | null;
    model_answer: string | null;
    marking_rubric: string | null;
  } | null;
  image_url: string | null;
};

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
  // Academic context. Empty means "every session / term", so the screen opens on
  // the teacher's whole history for that class and subject rather than guessing.
  const [sessionId, setSessionId] = useState("");
  const [termId, setTermId] = useState("");
  // Publication lifecycle: the historical library, or the questions still being
  // prepared. The paper builder keeps showing its own drafts regardless.
  const [view, setView] = useState<"history" | "preparation">("history");
  const [sessions, setSessions] = useState<{ id: string; name: string }[]>([]);
  const [terms, setTerms] = useState<{ id: string; name: string; session_id: string | null }[]>([]);
  // The collapsible academic tree, built from questions that actually exist.
  const [tree, setTree] = useState<BankSession[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Preview and search are the two ways a teacher finds a question without
  // opening the editor first.
  const [search, setSearch] = useState("");
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [previewDetail, setPreviewDetail] = useState<QuestionDetail | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

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

  // The academic tree behind the session/term filters.
  useEffect(() => {
    fetch("/api/cbt/questions/bank")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        setSessions(Array.isArray(d.sessions) ? d.sessions : []);
        setTerms(Array.isArray(d.terms) ? d.terms : []);
        setTree(Array.isArray(d.tree) ? d.tree : []);
      })
      .catch(() => {});
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
      if (sessionId) params.set("session_id", sessionId);
      if (termId) params.set("term_id", termId);
      params.set("published", view === "history" ? "1" : "0");
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
  }, [classId, subjectId, sessionId, termId, view]);

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

  const openPreview = async (q: Question) => {
    setPreviewId(q.id);
    setPreviewDetail(null);
    setPreviewLoading(true);
    try {
      const res = await fetch(`/api/cbt/questions/${q.id}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.question) {
        toast.error(body.error || "Could not load that question");
        setPreviewId(null);
        return;
      }
      setPreviewDetail(body.question as QuestionDetail);
    } catch {
      toast.error("Could not reach the server.");
      setPreviewId(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  const visibleQuestions = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return questions;
    return questions.filter((q) => q.question_text.toLowerCase().includes(needle));
  }, [questions, search]);

  /**
   * "Reuse & Edit" from the bank itself.
   *
   * With no examination open there is no paper to add to, so the copy is filed
   * under the school's ACTIVE term and opened in the editor. Editing the
   * historical row in place is deliberately not offered: it would rewrite what a
   * previous term asked.
   */
  const copyAndEdit = async (q: Question) => {
    setBusyId(q.id);
    try {
      const res = await fetch(`/api/cbt/questions/${q.id}/copy`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ class_id: classId, subject_id: subjectId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || typeof body.id !== "string") {
        toast.error(body.error || "Could not copy that question");
        return;
      }
      toast.success("Copy created — editing the copy, the original is unchanged");
      setEditingId(body.id);
      setFormOpen(true);
      void load();
    } catch {
      toast.error("Could not reach the server.");
    } finally {
      setBusyId(null);
    }
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
      className: "w-56",
      render: (q: Question) => (
        <div className="flex flex-wrap justify-end gap-1">
          <Button size="sm" variant="ghost" onClick={() => void openPreview(q)}>
            Preview
          </Button>
          <Button size="sm" variant="ghost" onClick={() => openEdit(q)}>
            Edit
          </Button>
          <Button
            size="sm"
            variant="ghost"
            loading={busyId === q.id}
            onClick={() => void copyAndEdit(q)}
          >
            Copy &amp; Edit
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
        <div className="inline-flex rounded-lg border border-border overflow-hidden">
          <button
            type="button"
            onClick={() => setView("history")}
            className={`px-3 py-2 text-body transition-colors ${
              view === "history"
                ? "bg-primary text-white font-medium"
                : "bg-surface text-text-secondary hover:bg-clay"
            }`}
          >
            Published history
          </button>
          <button
            type="button"
            onClick={() => setView("preparation")}
            className={`px-3 py-2 text-body transition-colors ${
              view === "preparation"
                ? "bg-primary text-white font-medium"
                : "bg-surface text-text-secondary hover:bg-clay"
            }`}
          >
            In preparation
          </button>
        </div>

        {view === "history" && tree.length > 0 && (
          <div className="rounded-lg border border-border bg-surface">
            <p className="px-3 py-2 text-caption font-semibold text-text-secondary">
              Browse previous sessions
            </p>
            <ul className="max-h-64 overflow-y-auto border-t border-border">
              {tree.map((s) => (
                <li key={s.id} className="px-3 py-2">
                  <details>
                    <summary className="cursor-pointer select-none text-body">
                      <span className="font-medium text-text-primary">{s.name}</span>
                      <span className="ml-2 text-caption text-text-secondary">{s.questions}</span>
                    </summary>
                    <ul className="mt-2 ml-3 space-y-1">
                      {s.terms.map((t) => (
                        <li key={t.id}>
                          <details>
                            <summary className="cursor-pointer select-none text-body text-text-secondary">
                              {t.name}
                              <span className="ml-2 text-caption">({t.questions})</span>
                            </summary>
                            <ul className="mt-1 ml-3 space-y-1">
                              {t.classes.map((c) => (
                                <li key={c.id}>
                                  <details>
                                    <summary className="cursor-pointer select-none text-body text-text-secondary">
                                      {c.name}
                                      <span className="ml-2 text-caption">({c.questions})</span>
                                    </summary>
                                    <ul className="mt-1 ml-3 space-y-1">
                                      {c.subjects.map((sub) => {
                                        const active =
                                          sessionId === s.id &&
                                          termId === t.id &&
                                          classId === c.id &&
                                          subjectId === sub.id;
                                        return (
                                          <li key={sub.id}>
                                            <button
                                              type="button"
                                              onClick={() => {
                                                setSessionId(s.id);
                                                setTermId(t.id);
                                                setClassId(c.id);
                                                setSubjectId(sub.id);
                                              }}
                                              className={`w-full text-left rounded px-2 py-1 text-body transition-colors ${
                                                active
                                                  ? "bg-primary/10 text-primary font-medium"
                                                  : "text-text-primary hover:bg-clay"
                                              }`}
                                            >
                                              {sub.name}
                                              <span className="ml-2 text-caption text-text-secondary">
                                                {sub.questions}
                                              </span>
                                            </button>
                                          </li>
                                        );
                                      })}
                                    </ul>
                                  </details>
                                </li>
                              ))}
                            </ul>
                          </details>
                        </li>
                      ))}
                    </ul>
                  </details>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="w-full tablet:w-auto">
              <label className="text-caption font-semibold text-text-secondary">Session</label>
              <select
                value={sessionId}
                onChange={(e) => {
                  setSessionId(e.target.value);
                  setTermId("");
                }}
                className={`${SELECT_CLASS} block mt-1 w-full min-w-44 tablet:w-auto`}
              >
                <option value="">All sessions</option>
                {sessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="w-full tablet:w-auto">
              <label className="text-caption font-semibold text-text-secondary">Term</label>
              <select
                value={termId}
                onChange={(e) => setTermId(e.target.value)}
                className={`${SELECT_CLASS} block mt-1 w-full min-w-44 tablet:w-auto`}
              >
                <option value="">All terms</option>
                {terms
                  .filter((t) => !sessionId || t.session_id === sessionId)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
              </select>
            </div>
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
            <div className="w-full tablet:w-auto">
              <label className="text-caption font-semibold text-text-secondary">Search</label>
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Find a question…"
                className={`${SELECT_CLASS} block mt-1 w-full tablet:w-56`}
              />
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
            {view === "history"
              ? "Choose a class and a subject to browse published questions from previous sessions and terms."
              : "Choose a class and a subject to see questions that are still in preparation. They become part of the published bank when an examination that uses them is published."}
          </p>
        ) : (
          <>
            <p className="text-caption text-text-secondary">
              {view === "history" ? "Published questions for" : "Questions in preparation for"}{" "}
              <span className="font-semibold text-text-primary">
                {className}
                {subjectName ? ` · ${subjectName}` : ""}
              </span>
            </p>
            <Table
              columns={columns}
              data={visibleQuestions}
              keyExtractor={(q) => q.id}
              loading={loading}
              emptyMessage={
                search.trim()
                  ? `No question here matches “${search.trim()}”.`
                  : view === "history"
                    ? "No published questions for this class and subject yet. Questions appear here once an examination using them is published."
                    : "Nothing in preparation for this class and subject. Start with New question."
              }
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

      <Modal
        isOpen={previewId !== null}
        onClose={() => {
          setPreviewId(null);
          setPreviewDetail(null);
        }}
        title="Question preview"
        size="md"
        footer={
          <Button
            variant="ghost"
            className="w-full tablet:w-auto"
            onClick={() => {
              setPreviewId(null);
              setPreviewDetail(null);
            }}
          >
            Close
          </Button>
        }
      >
        {previewLoading && <p className="text-body text-text-secondary">Loading…</p>}
        {!previewLoading && previewDetail && (
          <div className="space-y-3">
            {previewDetail.image_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewDetail.image_url}
                alt=""
                className="max-h-56 rounded border border-border object-contain"
              />
            )}
            {previewDetail.options.length > 0 ? (
              <ol className="space-y-1">
                {previewDetail.options.map((o) => {
                  const correct = o.id === previewDetail.answer_key?.correct_option_id;
                  return (
                    <li
                      key={o.id}
                      className={
                        correct
                          ? "text-body text-success font-medium"
                          : "text-body text-text-primary"
                      }
                    >
                      {(o.label ?? "").trim() || "•"}. {o.option_text}
                      {correct ? " ✓" : ""}
                    </li>
                  );
                })}
              </ol>
            ) : (
              <p className="text-body text-text-secondary">
                Written answer — marked by the teacher.
              </p>
            )}
            {previewDetail.answer_key?.model_answer && (
              <p className="text-caption text-text-secondary whitespace-pre-wrap">
                Model answer: {previewDetail.answer_key.model_answer}
              </p>
            )}
          </div>
        )}
      </Modal>

      <QuestionFormModal
        isOpen={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditingId(null);
        }}
        onSaved={() => {
          // A new question is in preparation, never history, until its paper is
          // published — so show the list that contains it.
          setView("preparation");
          void load();
        }}
        classes={classes}
        questionId={editingId}
        initialClassId={classId || null}
        initialSubjectId={subjectId || null}
      />

      <AiQuestionImportModal
        isOpen={aiOpen}
        onClose={() => setAiOpen(false)}
        classOptions={classes}
        onSaved={() => {
          setView("preparation");
          void load();
        }}
        initialClassId={classId || null}
        initialSubjectId={subjectId || null}
      />
    </div>
  );
}
