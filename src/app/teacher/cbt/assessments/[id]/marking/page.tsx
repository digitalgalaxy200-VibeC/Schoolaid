"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, Button, Badge, Table, Modal, toast } from "@/components/ui";

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
 * 2. PUSHING TO THE REPORT CARD CANNOT BE DONE BLINDLY. The push is previewed
 *    first — the same request the server runs, with `dryRun` — and only then
 *    applied. A score on a child's report card is not something to discover
 *    afterwards, and the preview is also where a clash with a manually entered
 *    score shows up, before anything is written.
 *
 * The counts on this page (who still needs marking, who has an official result)
 * come from the server, not from counting rows here.
 */

type WorklistAttempt = {
  id: string;
  attempt_number: number;
  status: string;
  submitted_at: string | null;
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
      toast.success(
        body.fully_marked
          ? `Saved — this attempt is now fully marked (${body.total_score} marks)`
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
        toast.error(body.error || "Could not write the scores");
        return;
      }
      toast.success(`${body.written} score(s) written to the report card`);
      setPreview(null);
      await load();
    } catch {
      toast.error("Could not reach the server.");
    } finally {
      setPushing(false);
    }
  };

  const theoryQuestions = (detail?.questions ?? []).filter((q) => q.question_type === "theory");
  const answerFor = (id: string) => detail?.answers.find((a) => a.attempt_question_id === id);

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
      key: "status",
      header: "Latest",
      className: "w-40",
      render: (s: WorklistStudent) => {
        const last = s.attempts[s.attempts.length - 1];
        if (!last) return <span className="text-caption text-text-disabled">—</span>;
        return (
          <div className="flex items-center gap-2">
            <Badge variant={STATUS_VARIANT[last.status] ?? "default"}>{last.status}</Badge>
            {last.percentage !== null && (
              <span className="text-caption font-mono text-text-secondary">{last.percentage}%</span>
            )}
          </div>
        );
      },
    },
    {
      key: "pending",
      header: "To mark",
      className: "w-24",
      render: (s: WorklistStudent) =>
        s.pending_theory > 0 ? (
          <Badge variant="warning">{s.pending_theory}</Badge>
        ) : s.attempted ? (
          <span className="text-caption text-success">done</span>
        ) : (
          <span className="text-caption text-text-disabled">—</span>
        ),
    },
  ];

  if (loading) {
    return (
      <div className="p-6 tablet:p-8">
        <p className="text-body text-text-secondary">Loading…</p>
      </div>
    );
  }

  if (error || !worklist) {
    return (
      <div className="p-6 tablet:p-8 space-y-4">
        <div className="rounded-lg border border-error bg-error-bg px-4 py-3 text-body text-error">
          {error ?? "Assessment not found."}
        </div>
        <Button variant="secondary" onClick={() => router.push("/teacher/cbt/assessments")}>
          Back to assessments
        </Button>
      </div>
    );
  }

  const s = worklist.summary;

  return (
    <div className="p-6 tablet:p-8 space-y-6">
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
        />
      </Card>

      <Card variant="default" className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-h2 font-semibold text-text-primary">Report card</h2>
            <p className="text-caption text-text-secondary mt-1">
              Writes each student&apos;s official score into this assessment&apos;s component. Preview
              it first — nothing is written until you apply.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => void runPreview()}>
              Preview
            </Button>
            <Button
              variant="primary"
              loading={pushing}
              onClick={() => void push()}
              disabled={!preview || preview.would_write === 0}
            >
              Write scores
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

                      <div className="flex items-end gap-2">
                        <div className="w-28">
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
                          loading={savingId === q.id}
                          onClick={() => void award(q.id)}
                        >
                          Save mark
                        </Button>
                        {a?.awarded_marks !== null && a?.awarded_marks !== undefined && (
                          <span className="text-caption text-text-secondary pb-2">
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
    </div>
  );
}
