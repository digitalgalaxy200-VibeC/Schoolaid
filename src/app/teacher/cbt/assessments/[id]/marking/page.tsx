"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, Button, Badge, ConfirmDialog, Table, Modal, toast } from "@/components/ui";

/**
 * CBT marking and results (Phase 20 UI).
 *
 * This screen closes the loop. Until it exists, a theory answer stays
 * `submitted` forever: objective answers are marked deterministically at submit
 * time, but a written answer waits for a person, and the attempt cannot become
 * the official result until every one of them has an award.
 *
 * TWO RULES THIS SCREEN REFLECTS RATHER THAN DECIDES
 *
 * 1. A REASON IS REQUIRED FOR EVERY MARK. The API refuses an award without one,
 *    and this screen collects a note for the marking pass and sends it with each
 *    award. "25 marks appeared on this paper" with no record of who wrote them is
 *    exactly what the audit trail exists to prevent.
 *
 * 2. PUBLISHING IS NOT AUTOMATIC AND IS NEVER BLIND. A submitted CBT result
 *    stays a CBT result until a teacher publishes it; the batch publish is
 *    previewed first (the same request the server runs, with `dryRun`), and a
 *    single reviewed result is published from its own row. A score on a child's
 *    report card is not something to discover afterwards — and the preview is
 *    also where a clash with a manually entered score shows up, before anything
 *    is written.
 *
 * The counts on this page (who still needs marking, who has an official result)
 * come from the server, not from counting rows here.
 */

type WorklistAttempt = {
  id: string;
  attempt_number: number;
  status: string;
  submitted_at: string | null;
  /** The deterministic objective half — available as soon as it is submitted. */
  objective_score: number | null;
  /** The teacher-marked half; null until a person has awarded it. */
  subjective_score: number | null;
  total_score: number | null;
  max_score: number | null;
  percentage: number | null;
  is_official: boolean;
  pending_theory: number;
};

type WorklistStudent = {
  student_id: string;
  name: string;
  attempted: boolean;
  official_attempt_id: string | null;
  pending_theory: number;
  /** The student's mark in the Marks system, once a teacher publishes it. */
  published: { score: number; published_at: string | null; attempt_id: string | null } | null;
  attempts: WorklistAttempt[];
};

type Worklist = {
  assessment: {
    id: string;
    title: string;
    class_id: string;
    subject_id: string | null;
    term_id: string | null;
    component_id: string | null;
    status: string;
    max_attempts: number;
  };
  students: WorklistStudent[];
  summary: {
    class_size: number;
    attempted: number;
    needing_marking: number;
    official_set: number;
  };
};

type AttemptDetail = {
  attempt: { id: string; attempt_number: number; status: string };
  questions: {
    id: string;
    display_order: number;
    question_type: "mcq" | "true_false" | "theory";
    question_text: string;
    model_answer: string | null;
    marking_rubric: string | null;
    marks: number;
  }[];
  answers: {
    attempt_question_id: string;
    selected_option_id: string | null;
    answer_text: string | null;
    awarded_marks: number | null;
  }[];
};

const STATUS_VARIANT: Record<string, "default" | "info" | "success" | "warning"> = {
  in_progress: "info",
  submitted: "warning",
  marked: "success",
  invalidated: "default",
};

export default function MarkingPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const assessmentId = params?.id;

  const [worklist, setWorklist] = useState<Worklist | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [openStudent, setOpenStudent] = useState<WorklistStudent | null>(null);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AttemptDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [note, setNote] = useState("");
  const [awards, setAwards] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [overriding, setOverriding] = useState<string | null>(null);

  const [preview, setPreview] = useState<{
    would_write: number;
    conflicts: { studentId: string; reason: string }[];
    official_results: number;
  } | null>(null);
  const [pushing, setPushing] = useState(false);
  // Publishing ONE reviewed result is the normal act; the dialog states exactly
  // which result it will make official before anything is written.
  const [confirmPublishStudent, setConfirmPublishStudent] = useState<WorklistStudent | null>(null);
  const [publishingId, setPublishingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!assessmentId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/cbt/assessments/${assessmentId}/marking`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error || `Could not load the marking list (HTTP ${res.status})`);
        return;
      }
      setWorklist(body);
    } catch {
      setError("Could not reach the server.");
    } finally {
      setLoading(false);
    }
  }, [assessmentId]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const openAttempt = async (student: WorklistStudent, attempt: WorklistAttempt) => {
    setOpenStudent(student);
    setAttemptId(attempt.id);
    setDetail(null);
    setNote("");
    setAwards({});
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/cbt/attempts/${attempt.id}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error || "Could not load that attempt");
        return;
      }
      const payload = body as AttemptDetail;
      setDetail(payload);

      // Pre-fill any award already recorded, so re-opening does not look like the
      // teacher's earlier marking was lost.
      const existing: Record<string, string> = {};
      for (const a of payload.answers ?? []) {
        if (a.awarded_marks !== null && a.awarded_marks !== undefined) {
          existing[a.attempt_question_id] = String(a.awarded_marks);
        }
      }
      setAwards(existing);
    } catch {
      toast.error("Could not reach the server.");
    } finally {
      setDetailLoading(false);
    }
  };

  const closePanel = () => {
    setOpenStudent(null);
    setAttemptId(null);
    setDetail(null);
  };

  const award = async (attemptQuestionId: string) => {
    if (!attemptId) return;
    const raw = awards[attemptQuestionId];
    if (raw === undefined || raw === "") {
      toast.error("Enter the marks to award");
      return;
    }
    if (note.trim().length < 5) {
      toast.error("Add a short note — every mark needs a reason on record");
      return;
    }

    setSavingId(attemptQuestionId);
    try {
      const res = await fetch(`/api/cbt/attempts/${attemptId}/mark`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          attempt_question_id: attemptQuestionId,
          awarded_marks: Number(raw),
          reason: note.trim(),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error || "Could not record the mark");
        return;
      }
      const officiallySet = body.official_attempt_id === attemptId;
      toast.success(
        body.fully_marked
          ? `Saved — this attempt is now fully marked (${body.total_score} marks)${
              officiallySet ? " and it counts as the official result" : ""
            }`
          : `Saved — ${body.total_score} marks so far, more answers still to mark`,
      );
      await load();
      // Refresh the attempt so the next award is against current data.
      const student = openStudent;
      if (student) {
        const updated = worklist?.students.find((s) => s.student_id === student.student_id);
        const attempt = [...(updated?.attempts ?? [])].find((a) => a.id === attemptId);
        if (attempt && updated) await openAttempt(updated, attempt);
      }
    } catch {
      toast.error("Could not reach the server.");
    } finally {
      setSavingId(null);
    }
  };

  const makeOfficial = async (student: WorklistStudent, attempt: WorklistAttempt) => {
    if (note.trim().length < 5) {
      toast.error("Add a short note explaining why this attempt stands");
      return;
    }
    setOverriding(attempt.id);
    try {
      const res = await fetch(`/api/cbt/attempts/${attempt.id}/official`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: note.trim() }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error || "Could not set the official attempt");
        return;
      }
      toast.success(`Take ${attempt.attempt_number} now counts for ${student.name}`);
      await load();
    } catch {
      toast.error("Could not reach the server.");
    } finally {
      setOverriding(null);
    }
  };

  const runPreview = async () => {
    if (!assessmentId) return;
    try {
      const res = await fetch(`/api/cbt/assessments/${assessmentId}/results`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error || "Could not build the preview");
        return;
      }
      setPreview(body);
    } catch {
      toast.error("Could not reach the server.");
    }
  };

  const push = async () => {
    if (!assessmentId) return;
    setPushing(true);
    try {
      const res = await fetch(`/api/cbt/assessments/${assessmentId}/results`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error || "Could not publish the results");
        return;
      }
      toast.success(`${body.written} result(s) published to Marks`);
      setPreview(null);
      await load();
    } catch {
      toast.error("Could not reach the server.");
    } finally {
      setPushing(false);
    }
  };

  /**
   * Makes ONE reviewed result the student's official mark in the Marks system.
   * The server re-checks the lock, the attempt's official status and any manual
   * mark, so this button cannot bypass a rule by being clicked.
   */
  const publishStudent = async (student: WorklistStudent) => {
    if (!assessmentId) return;
    setPublishingId(student.student_id);
    setConfirmPublishStudent(null);
    try {
      const res = await fetch(`/api/cbt/assessments/${assessmentId}/results`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ student_id: student.student_id }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error || "Could not publish this result");
        return;
      }
      toast.success(`${student.name}'s result is now in Marks`);
      await load();
    } catch {
      toast.error("Could not reach the server.");
    } finally {
      setPublishingId(null);
    }
  };

  const theoryQuestions = (detail?.questions ?? []).filter((q) => q.question_type === "theory");
  const answerFor = (id: string) => detail?.answers.find((a) => a.attempt_question_id === id);

  // The STANDING numbers for a student: the official attempt when one exists,
  // else the latest. An attempt still being taken has no result to show yet.
  const standingAttempt = (s: WorklistStudent): WorklistAttempt | null =>
    s.attempts.find((a) => a.is_official) ?? s.attempts[s.attempts.length - 1] ?? null;

  const columns = [
    {
      key: "name",
      header: "Student",
      render: (s: WorklistStudent) => (
        <span className="text-text-primary font-medium">{s.name}</span>
      ),
    },
    {
      key: "attempts",
      header: "Attempts",
      render: (s: WorklistStudent) =>
        s.attempted ? (
          <div className="flex flex-wrap gap-1">
            {s.attempts.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => void openAttempt(s, a)}
                className={`px-2 py-1 rounded-md text-caption border transition-colors ${
                  a.is_official
                    ? "border-success bg-success-bg text-success"
                    : "border-border bg-surface text-text-secondary hover:bg-clay"
                }`}
              >
                Take {a.attempt_number}
                {a.total_score !== null ? ` · ${a.total_score}` : ""}
                {a.is_official ? " ★" : ""}
              </button>
            ))}
          </div>
        ) : (
          <span className="text-caption text-text-disabled">did not sit</span>
        ),
    },
    {
      key: "objective",
      header: "Objective",
      className: "w-24",
      render: (s: WorklistStudent) => {
        const a = standingAttempt(s);
        if (!a || a.objective_score === null) {
          return <span className="text-caption text-text-disabled">—</span>;
        }
        return <span className="text-body font-mono text-text-primary">{a.objective_score}</span>;
      },
    },
    {
      key: "theory",
      header: "Theory",
      className: "w-28",
      render: (s: WorklistStudent) => {
        const a = standingAttempt(s);
        if (!a) return <span className="text-caption text-text-disabled">—</span>;
        // Pending is a first-class state: an objective-only total is NOT the
        // paper's score, and showing a number here would read as one.
        if (a.pending_theory > 0) return <Badge variant="warning">Pending</Badge>;
        if (a.subjective_score === null) {
          return <span className="text-caption text-text-disabled">—</span>;
        }
        return <span className="text-body font-mono text-text-primary">{a.subjective_score}</span>;
      },
    },
    {
      key: "total",
      header: "Total",
      className: "w-28",
      render: (s: WorklistStudent) => {
        const a = standingAttempt(s);
        if (!a || a.total_score === null) {
          return <span className="text-caption text-text-disabled">—</span>;
        }
        if (a.pending_theory > 0) {
          return <span className="text-caption text-text-disabled">awaiting marking</span>;
        }
        return (
          <span className="text-body font-mono text-text-primary">
            {a.total_score}/{a.max_score}
          </span>
        );
      },
    },
    {
      key: "status",
      header: "Status",
      className: "w-44",
      render: (s: WorklistStudent) => {
        const a = standingAttempt(s);
        if (!a) return <span className="text-caption text-text-disabled">Not sat</span>;
        if (a.status === "in_progress") return <Badge variant="info">In progress</Badge>;
        if (a.pending_theory > 0) return <Badge variant="warning">Awaiting marking</Badge>;

        // Marking is done — the remaining question is whether this reviewed
        // result is the official mark, or still only a CBT result.
        if (s.published) {
          return (
            <span className="inline-flex items-center gap-2">
              <Badge variant="success">Published</Badge>
              <span className="text-caption font-mono text-text-secondary">
                {s.published.score}
              </span>
            </span>
          );
        }
        if (a.status === "marked") return <Badge variant="info">Provisional</Badge>;
        return <Badge variant={STATUS_VARIANT[a.status] ?? "default"}>{a.status}</Badge>;
      },
    },
    {
      key: "action",
      header: "",
      className: "w-32",
      render: (s: WorklistStudent) => {
        const a = standingAttempt(s);
        if (!a || a.status === "in_progress" || a.pending_theory > 0) {
          return <span className="text-caption text-text-disabled">—</span>;
        }
        if (!s.official_attempt_id) {
          return (
            <span
              className="text-caption text-text-disabled"
              title="Open the student and choose which attempt counts first"
            >
              —
            </span>
          );
        }
        return (
          <Button
            size="sm"
            variant={s.published ? "secondary" : "primary"}
            loading={publishingId === s.student_id}
            onClick={() => setConfirmPublishStudent(s)}
          >
            {s.published ? "Republish" : "Publish"}
          </Button>
        );
      },
    },
  ];

  if (loading) {
    return (
      <div className="p-4 tablet:p-8">
        <p className="text-body text-text-secondary">Loading…</p>
      </div>
    );
  }

  if (error || !worklist) {
    return (
      <div className="p-4 tablet:p-8 space-y-4">
        <div className="rounded-lg border border-error bg-error-bg px-4 py-3 text-body text-error">
          {error ?? "Assessment not found."}
        </div>
        <Button
          variant="secondary"
          className="w-full tablet:w-auto"
          onClick={() => router.push("/teacher/cbt/assessments")}
        >
          Back to assessments
        </Button>
      </div>
    );
  }

  const s = worklist.summary;

  return (
    <div className="p-4 tablet:p-8 space-y-6">
      <div>
        <button
          type="button"
          onClick={() => router.push(`/teacher/cbt/assessments/${assessmentId}`)}
          className="text-caption text-text-secondary hover:text-primary transition-colors"
        >
          ← Back to the paper
        </button>
        <h1 className="text-h1 font-bold text-text-primary mt-1">
          Marking — {worklist.assessment.title}
        </h1>
      </div>

      <div className="grid grid-cols-2 tablet:grid-cols-4 gap-3">
        {[
          { label: "In the class", value: s.class_size },
          { label: "Sat the test", value: s.attempted },
          { label: "Still to mark", value: s.needing_marking },
          { label: "Result standing", value: s.official_set },
        ].map((stat) => (
          <Card key={stat.label} variant="default">
            <p className="text-h2 font-bold text-primary">{stat.value}</p>
            <p className="text-caption text-text-secondary">{stat.label}</p>
          </Card>
        ))}
      </div>

      <Card variant="default" className="space-y-4">
        <h2 className="text-h2 font-semibold text-text-primary">Who sat it</h2>
        <Table
          columns={columns}
          data={worklist.students}
          keyExtractor={(x) => x.student_id}
          emptyMessage="No students in this class."
          mobileCard={(s) => {
            const a = standingAttempt(s);
            return (
              <div className="space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="text-body-lg font-semibold text-text-primary">{s.name}</p>
                  {!a ? (
                    <span className="text-caption text-text-disabled">Not sat</span>
                  ) : a.status === "in_progress" ? (
                    <Badge variant="info">In progress</Badge>
                  ) : a.pending_theory > 0 ? (
                    <Badge variant="warning">Awaiting marking</Badge>
                  ) : a.status === "marked" ? (
                    s.published ? (
                      <span className="inline-flex items-center gap-2">
                        <Badge variant="success">Published</Badge>
                        <span className="text-caption font-mono text-text-secondary">
                          {s.published.score}
                        </span>
                      </span>
                    ) : (
                      <Badge variant="info">Provisional</Badge>
                    )
                  ) : (
                    <Badge variant={STATUS_VARIANT[a.status] ?? "default"}>{a.status}</Badge>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <p className="text-caption text-text-secondary">Objective</p>
                    {!a || a.objective_score === null ? (
                      <span className="text-caption text-text-disabled">—</span>
                    ) : (
                      <span className="text-body font-mono text-text-primary">
                        {a.objective_score}
                      </span>
                    )}
                  </div>
                  <div>
                    <p className="text-caption text-text-secondary">Theory</p>
                    {!a ? (
                      <span className="text-caption text-text-disabled">—</span>
                    ) : a.pending_theory > 0 ? (
                      <Badge variant="warning">Pending</Badge>
                    ) : a.subjective_score === null ? (
                      <span className="text-caption text-text-disabled">—</span>
                    ) : (
                      <span className="text-body font-mono text-text-primary">
                        {a.subjective_score}
                      </span>
                    )}
                  </div>
                  <div>
                    <p className="text-caption text-text-secondary">Total</p>
                    {!a || a.total_score === null ? (
                      <span className="text-caption text-text-disabled">—</span>
                    ) : a.pending_theory > 0 ? (
                      <span className="text-caption text-text-disabled">awaiting marking</span>
                    ) : (
                      <span className="text-body font-mono text-text-primary">
                        {a.total_score}/{a.max_score}
                      </span>
                    )}
                  </div>
                </div>

                {s.attempted ? (
                  <div className="space-y-2">
                    <p className="text-caption text-text-secondary">Attempts — tap to open</p>
                    {s.attempts.map((att) => (
                      <button
                        key={att.id}
                        type="button"
                        onClick={() => void openAttempt(s, att)}
                        className={`flex w-full min-h-[44px] items-center justify-center gap-1 rounded-lg border px-3 py-2 text-small transition-colors active:bg-clay ${
                          att.is_official
                            ? "border-success bg-success-bg text-success"
                            : "border-border bg-surface text-text-secondary"
                        }`}
                      >
                        Take {att.attempt_number}
                        {att.total_score !== null ? ` · ${att.total_score}` : ""}
                        {att.is_official ? " ★" : ""}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-caption text-text-disabled">did not sit</p>
                )}
              </div>
            );
          }}
        />
      </Card>

      <Card variant="default" className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-h2 font-semibold text-text-primary">Marks</h2>
            <p className="text-caption text-text-secondary mt-1">
              Publishes each ready result into this assessment&apos;s component (Marks). A reviewed
              result can also be published on its own row above. Preview first — nothing is written
              until you publish.
            </p>
          </div>
          <div className="flex flex-col gap-2 tablet:flex-row">
            <Button
              variant="secondary"
              className="w-full tablet:w-auto"
              onClick={() => void runPreview()}
            >
              Preview
            </Button>
            <Button
              variant="primary"
              loading={pushing}
              className="w-full tablet:w-auto"
              onClick={() => void push()}
              disabled={!preview || preview.would_write === 0}
            >
              Publish all ready
            </Button>
          </div>
        </div>

        {preview && (
          <div className="rounded-lg border border-border bg-clay px-4 py-3 space-y-2">
            <p className="text-body text-text-primary">
              {preview.official_results} official result(s) ready.{" "}
              {preview.would_write === 0
                ? "Nothing would be written."
                : `${preview.would_write} score(s) would be written.`}
            </p>
            {preview.conflicts.length > 0 && (
              <ul className="list-disc pl-5 text-caption text-error">
                {preview.conflicts.map((c, i) => (
                  <li key={i}>
                    {worklist.students.find((x) => x.student_id === c.studentId)?.name ?? c.studentId}:{" "}
                    {c.reason}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Card>

      <Modal
        isOpen={openStudent !== null}
        onClose={closePanel}
        title={
          openStudent
            ? `${openStudent.name}${detail ? ` — Take ${detail.attempt.attempt_number}` : ""}`
            : ""
        }
        size="lg"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={closePanel}>
              Close
            </Button>
          </div>
        }
      >
        {detailLoading && <p className="text-body text-text-secondary">Loading the paper…</p>}

        {!detailLoading && detail && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 tablet:grid-cols-2 gap-3">
              <div>
                <label className="text-caption font-semibold text-text-secondary">
                  Note for this marking
                </label>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="First marking pass"
                  className="w-full mt-1 px-3 py-2 border border-border rounded-lg text-body bg-surface focus:outline-none focus:border-primary transition-colors"
                />
                <p className="text-caption text-text-secondary mt-1">
                  Recorded against every mark you save.
                </p>
              </div>
              <div className="flex items-end">
                {attemptId && detail.attempt.status === "marked" && (
                  <Button
                    variant="secondary"
                    loading={overriding === attemptId}
                    onClick={() => {
                      const student = openStudent;
                      const attempt = student?.attempts.find((a) => a.id === attemptId);
                      if (student && attempt) void makeOfficial(student, attempt);
                    }}
                  >
                    Make this attempt count
                  </Button>
                )}
              </div>
            </div>

            {theoryQuestions.length === 0 ? (
              <p className="text-body text-text-secondary">
                This paper has no written questions, so nothing here needs a person — the objective
                answers were marked when it was submitted.
              </p>
            ) : (
              <div className="space-y-4">
                {theoryQuestions.map((q) => {
                  const a = answerFor(q.id);
                  return (
                    <div key={q.id} className="rounded-lg border border-border px-3 py-3 space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-body text-text-primary whitespace-pre-wrap">
                          {q.question_text}
                        </p>
                        <Badge variant="default">{q.marks} mark(s)</Badge>
                      </div>

                      <div className="rounded-md bg-clay px-3 py-2">
                        <p className="text-caption text-text-secondary">Student answer</p>
                        <p className="text-body text-text-primary whitespace-pre-wrap mt-1">
                          {a?.answer_text?.trim() ? a.answer_text : "(left blank)"}
                        </p>
                      </div>

                      {q.marking_rubric && (
                        <p className="text-caption text-text-secondary">
                          Rubric: {q.marking_rubric}
                        </p>
                      )}
                      {q.model_answer && (
                        <p className="text-caption text-text-secondary">
                          Model answer: {q.model_answer}
                        </p>
                      )}

                      <div className="flex flex-col gap-2 tablet:flex-row tablet:items-end">
                        <div className="w-full tablet:w-28">
                          <label className="text-caption font-semibold text-text-secondary">
                            Award
                          </label>
                          <input
                            type="number"
                            min={0}
                            max={q.marks}
                            step={0.5}
                            value={awards[q.id] ?? ""}
                            onChange={(e) =>
                              setAwards((prev) => ({ ...prev, [q.id]: e.target.value }))
                            }
                            className="w-full mt-1 px-3 py-2 border border-border rounded-lg text-body bg-surface focus:outline-none focus:border-primary transition-colors"
                          />
                        </div>
                        <Button
                          variant="secondary"
                          className="w-full tablet:w-auto"
                          loading={savingId === q.id}
                          onClick={() => void award(q.id)}
                        >
                          Save mark
                        </Button>
                        {a?.awarded_marks !== null && a?.awarded_marks !== undefined && (
                          <span className="text-caption text-text-secondary tablet:pb-2">
                            recorded: {a.awarded_marks}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Publishing one reviewed result — the act this whole screen exists for. */}
      <ConfirmDialog
        open={confirmPublishStudent !== null}
        title={
          confirmPublishStudent?.published ? "Republish this result?" : "Publish this result?"
        }
        message={
          confirmPublishStudent
            ? (() => {
                const a = standingAttempt(confirmPublishStudent);
                const score =
                  a && a.total_score !== null ? `${a.total_score}/${a.max_score}` : "the reviewed result";
                return (
                  `${confirmPublishStudent.name}: ${score} will become the official mark for this ` +
                  "subject's component, and will appear in Marks. " +
                  (confirmPublishStudent.published
                    ? `This replaces the published score of ${confirmPublishStudent.published.score}, and the change is logged.`
                    : "Nothing is written until you confirm.")
                );
              })()
            : ""
        }
        confirmLabel={confirmPublishStudent?.published ? "Republish" : "Publish"}
        cancelLabel="Cancel"
        variant="warning"
        loading={publishingId !== null}
        onConfirm={() => {
          if (confirmPublishStudent) void publishStudent(confirmPublishStudent);
        }}
        onCancel={() => setConfirmPublishStudent(null)}
      />
    </div>
  );
}
