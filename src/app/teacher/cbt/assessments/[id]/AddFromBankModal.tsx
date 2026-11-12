"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Button, Modal, toast } from "@/components/ui";

/**
 * "Add from Question Bank".
 *
 * The historical library, browsed the way the school actually stores it:
 * session → term → class → subject. The builder opens it already pointed at this
 * examination's own context, so the common case is one click; stepping back a
 * session is how last year's questions are reached.
 *
 * Two actions per question, and the difference matters:
 *   Reuse            — the paper points at the ORIGINAL row. Editing it later
 *                      changes every paper built on it, which is correct while
 *                      nobody has sat it, and is why the API refuses an in-place
 *                      edit once an attempt exists.
 *   Reuse & Edit     — the server creates an independent copy (`derived_from_id`)
 *                      filed under THIS examination's context, and the editor
 *                      opens on it. The historical question is untouched.
 */

type BankSubject = { id: string; name: string; questions: number };
type BankClass = { id: string; name: string; questions: number; subjects: BankSubject[] };
type BankTerm = { id: string; name: string; questions: number; classes: BankClass[] };
type BankSession = { id: string; name: string; questions: number; terms: BankTerm[] };

type BankTree = {
  tree: BankSession[];
  unfiled: number;
};

type BankQuestion = {
  id: string;
  question_text: string;
  question_type: string;
  marks: number;
  status: string;
  has_image: boolean;
  derived_from_id: string | null;
};

/** The shape `GET /api/cbt/questions/{id}` returns for the inline preview. */
type QuestionDetail = {
  options: { id: string; label: string | null; option_text: string }[];
  answer_key: {
    correct_option_id: string | null;
    model_answer: string | null;
    marking_rubric: string | null;
  } | null;
  image_url: string | null;
};

const TYPE_LABEL: Record<string, string> = {
  mcq: "MCQ",
  true_false: "T/F",
  theory: "Theory",
};

function Select({
  label,
  value,
  onChange,
  options,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { id: string; name: string; questions?: number }[];
  disabled?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1 text-caption text-text-secondary">
      {label}
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 tablet:h-10 px-3 rounded-lg border border-border bg-surface text-body text-text-primary focus:outline-none focus:border-primary disabled:opacity-60"
      >
        <option value="">Select {label.toLowerCase()}…</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
            {typeof o.questions === "number" ? ` (${o.questions})` : ""}
          </option>
        ))}
      </select>
    </label>
  );
}

export function AddFromBankModal({
  isOpen,
  onClose,
  assessment,
  alreadyOnPaper,
  onAdded,
}: {
  isOpen: boolean;
  onClose: () => void;
  assessment: {
    session_id: string | null;
    term_id: string | null;
    class_id: string | null;
    subject_id: string | null;
  };
  /** Question ids already on this paper — their Reuse button is disabled. */
  alreadyOnPaper: string[];
  /**
   * `editId` is set by "Reuse & Edit": the builder should open the editor on the
   * new copy straight away.
   */
  onAdded: (questionIds: string[], editId?: string) => void;
}) {
  const [tree, setTree] = useState<BankTree | null>(null);
  const [treeError, setTreeError] = useState<string | null>(null);

  const [sessionId, setSessionId] = useState("");
  const [termId, setTermId] = useState("");
  const [classId, setClassId] = useState("");
  const [subjectId, setSubjectId] = useState("");

  const [questions, setQuestions] = useState<BankQuestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  // Lazy preview: options, the correct answer and the image are only fetched for
  // a question the teacher actually opens, so the list stays one request.
  const [details, setDetails] = useState<Record<string, QuestionDetail>>({});
  const [previewOpen, setPreviewOpen] = useState<Record<string, boolean>>({});
  const [detailLoading, setDetailLoading] = useState<string | null>(null);

  const onPaper = useMemo(() => new Set(alreadyOnPaper), [alreadyOnPaper]);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return questions;
    return questions.filter((q) => q.question_text.toLowerCase().includes(needle));
  }, [questions, search]);

  const loadTree = useCallback(async () => {
    setTreeError(null);
    try {
      const res = await fetch("/api/cbt/questions/bank");
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setTreeError(body.error || `Could not load the question bank (HTTP ${res.status})`);
        return;
      }
      setTree(body as BankTree);
    } catch {
      setTreeError("Could not reach the server.");
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    void loadTree();
  }, [isOpen, loadTree]);

  // Point the browser at this examination's context as soon as the tree arrives,
  // falling back to the newest branch that actually contains questions.
  useEffect(() => {
    if (!tree || !isOpen) return;
    if (sessionId || termId || classId || subjectId) return;

    const firstSession =
      tree.tree.find((s) => s.id === assessment.session_id) ?? tree.tree[0] ?? null;
    if (!firstSession) return;
    const term =
      firstSession.terms.find((t) => t.id === assessment.term_id) ?? firstSession.terms[0] ?? null;
    if (!term) {
      setSessionId(firstSession.id);
      return;
    }
    const cls = term.classes.find((c) => c.id === assessment.class_id) ?? term.classes[0] ?? null;
    if (!cls) {
      setSessionId(firstSession.id);
      setTermId(term.id);
      return;
    }
    const subject =
      cls.subjects.find((s) => s.id === assessment.subject_id) ?? cls.subjects[0] ?? null;

    setSessionId(firstSession.id);
    setTermId(term.id);
    setClassId(cls.id);
    if (subject) setSubjectId(subject.id);
  }, [tree, isOpen, assessment, sessionId, termId, classId, subjectId]);

  const session = tree?.tree.find((s) => s.id === sessionId) ?? null;
  const term = session?.terms.find((t) => t.id === termId) ?? null;
  const cls = term?.classes.find((c) => c.id === classId) ?? null;

  useEffect(() => {
    if (!isOpen || !sessionId || !termId || !classId || !subjectId) {
      setQuestions([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setListError(null);

    const params = new URLSearchParams({
      session_id: sessionId,
      term_id: termId,
      class_id: classId,
      subject_id: subjectId,
      status: "approved",
      // Only the historical bank is offered for reuse. Questions still in
      // preparation belong to the paper being written, not to the library.
      published: "1",
      include_unscoped: "1",
    });

    fetch(`/api/cbt/questions?${params.toString()}`)
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setListError(body.error || `Could not load the questions (HTTP ${res.status})`);
          setQuestions([]);
          return;
        }
        setQuestions((body.questions ?? []) as BankQuestion[]);
      })
      .catch(() => {
        if (!cancelled) setListError("Could not reach the server.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, sessionId, termId, classId, subjectId]);

  const togglePreview = async (id: string) => {
    setPreviewOpen((current) => ({ ...current, [id]: !current[id] }));
    if (details[id] || detailLoading === id) return;

    setDetailLoading(id);
    try {
      const res = await fetch(`/api/cbt/questions/${id}`);
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.question) {
        setDetails((current) => ({ ...current, [id]: body.question as QuestionDetail }));
      } else {
        toast.error(body.error || "Could not load that question");
      }
    } catch {
      toast.error("Could not reach the server.");
    } finally {
      setDetailLoading(null);
    }
  };

  const reuse = (q: BankQuestion) => {
    onAdded([q.id]);
    setAdded((current) => new Set(current).add(q.id));
  };

  const reuseAndEdit = async (q: BankQuestion) => {
    setBusyId(q.id);
    try {
      const res = await fetch(`/api/cbt/questions/${q.id}/copy`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          session_id: assessment.session_id,
          term_id: assessment.term_id,
          class_id: assessment.class_id,
          subject_id: assessment.subject_id,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || typeof body.id !== "string") {
        toast.error(body.error || "Could not copy that question");
        return;
      }
      onAdded([body.id], body.id);
      toast.success("Copy created — edit it now, the original is unchanged");
      onClose();
    } catch {
      toast.error("Could not reach the server.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Add from Question Bank"
      size="lg"
      footer={
        <Button variant="ghost" className="w-full tablet:w-auto" onClick={onClose}>
          Done
        </Button>
      }
    >
      <div className="space-y-4">
        <p className="text-caption text-text-secondary">
          Previous questions, organised by session, term, class and subject. Reuse one as it stands,
          or copy it and edit the copy — the original always stays as it was.
        </p>

        {treeError && (
          <div className="rounded-lg border border-error bg-error-bg px-3 py-2 text-body text-error">
            {treeError}
          </div>
        )}

        <div className="grid grid-cols-1 tablet:grid-cols-2 gap-3">
          <Select
            label="Session"
            value={sessionId}
            onChange={(v) => {
              setSessionId(v);
              setTermId("");
              setClassId("");
              setSubjectId("");
            }}
            options={tree?.tree ?? []}
          />
          <Select
            label="Term"
            value={termId}
            disabled={!session}
            onChange={(v) => {
              setTermId(v);
              setClassId("");
              setSubjectId("");
            }}
            options={session?.terms ?? []}
          />
          <Select
            label="Class"
            value={classId}
            disabled={!term}
            onChange={(v) => {
              setClassId(v);
              setSubjectId("");
            }}
            options={term?.classes ?? []}
          />
          <Select
            label="Subject"
            value={subjectId}
            disabled={!cls}
            onChange={setSubjectId}
            options={cls?.subjects ?? []}
          />
        </div>

        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search these questions…"
          className="w-full h-11 tablet:h-10 px-3 rounded-lg border border-border bg-surface text-body text-text-primary focus:outline-none focus:border-primary"
        />

        {listError && (
          <div className="rounded-lg border border-error bg-error-bg px-3 py-2 text-body text-error">
            {listError}
          </div>
        )}

        {loading && <p className="text-body text-text-secondary">Loading questions…</p>}

        {!loading && !listError && questions.length === 0 && (
          <p className="text-body text-text-secondary">
            No questions in this session, term, class and subject yet.
          </p>
        )}

        {!loading && questions.length > 0 && visible.length === 0 && (
          <p className="text-body text-text-secondary">
            No question here matches “{search.trim()}”.
          </p>
        )}

        {!loading && visible.length > 0 && (
          <ul className="space-y-2">
            {visible.map((q) => {
              const isAdded = added.has(q.id) || onPaper.has(q.id);
              return (
                <li
                  key={q.id}
                  className="rounded-lg border border-border bg-surface px-3 py-3 space-y-2"
                >
                  <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
                    <span className="flex-1 min-w-0 text-body text-text-primary whitespace-pre-wrap">
                      {q.question_text}
                    </span>
                    <span className="text-caption text-text-secondary">
                      {TYPE_LABEL[q.question_type] ?? q.question_type}
                    </span>
                    <span className="text-caption font-mono text-text-secondary">
                      {Number(q.marks)} mark(s)
                    </span>
                    {q.derived_from_id && <Badge variant="info">Copy</Badge>}
                    {q.has_image && <Badge variant="default">Image</Badge>}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-11 tablet:h-auto"
                      disabled={isAdded}
                      onClick={() => reuse(q)}
                    >
                      {isAdded ? "On the paper" : "Reuse"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-11 tablet:h-auto"
                      loading={busyId === q.id}
                      onClick={() => void reuseAndEdit(q)}
                    >
                      Reuse &amp; Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-11 tablet:h-auto"
                      loading={detailLoading === q.id}
                      onClick={() => void togglePreview(q.id)}
                    >
                      {previewOpen[q.id] ? "Hide" : "Preview"}
                    </Button>
                  </div>

                  {previewOpen[q.id] && (
                    <div className="rounded border border-border bg-clay/40 p-2 space-y-1">
                      {detailLoading === q.id && (
                        <p className="text-caption text-text-secondary">Loading…</p>
                      )}
                      {details[q.id] && (
                        <>
                          {details[q.id].image_url && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={details[q.id].image_url as string}
                              alt=""
                              className="max-h-40 rounded border border-border object-contain"
                            />
                          )}
                          {details[q.id].options.length > 0 && (
                            <ol className="space-y-0.5">
                              {details[q.id].options.map((o) => {
                                const correct =
                                  o.id === details[q.id].answer_key?.correct_option_id;
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
                          )}
                          {details[q.id].answer_key?.model_answer && (
                            <p className="text-caption text-text-secondary whitespace-pre-wrap">
                              Model answer: {details[q.id].answer_key?.model_answer}
                            </p>
                          )}
                          {details[q.id].options.length === 0 &&
                            !details[q.id].answer_key?.model_answer && (
                              <p className="text-caption text-text-secondary">
                                Written answer — marked by the teacher.
                              </p>
                            )}
                        </>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {tree && tree.unfiled > 0 && (
          <p className="text-caption text-text-secondary">
            {tree.unfiled} question(s) are not filed under a term yet. They still appear in the
            Question Bank list.
          </p>
        )}
      </div>
    </Modal>
  );
}
