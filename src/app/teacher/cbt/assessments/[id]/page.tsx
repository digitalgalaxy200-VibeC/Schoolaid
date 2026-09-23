"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, Button, Badge, toast } from "@/components/ui";

/**
 * CBT assessment builder (Phase 17 UI) — the paper, and publishing it.
 *
 * This is the screen that makes the question bank worth having: choose the
 * questions, see what the paper is worth against the component's ceiling, and
 * publish.
 *
 * PUBLISHING IS DECIDED SERVER-SIDE, and this page does not try to replicate the
 * rule. It calls the endpoint and renders the `problems` array the server
 * returns. A client-side copy of "every question must be approved" would drift
 * from the server's version, and would eventually either refuse something valid
 * or wave through something the server then rejects.
 *
 * The local hints below (the total against the component maximum) are ADVISORY.
 * They exist so a problem is visible before pressing Publish, not to decide it.
 */

type QuestionStatus = "draft" | "review" | "approved" | "archived";
type AssessmentStatus = "draft" | "review" | "published" | "archived";

type SelectedQuestion = {
  question_id: string;
  marks_override: number | null;
  question_text: string;
  question_type: string;
  marks: number;
  status: string;
};

type AssessmentDetail = {
  id: string;
  title: string;
  status: AssessmentStatus;
  class_id: string;
  subject_id: string | null;
  component_id: string | null;
  max_attempts: number;
  time_limit_minutes: number | null;
  official_attempt_rule: string;
  instructions: string | null;
  questions: SelectedQuestion[];
  attempt_count: number;
};

type BankQuestion = {
  id: string;
  question_text: string;
  question_type: string;
  marks: number;
  status: QuestionStatus;
};

const TYPE_LABEL: Record<string, string> = {
  mcq: "MCQ",
  true_false: "T/F",
  theory: "Theory",
};

const STATUS_VARIANT: Record<AssessmentStatus, "draft" | "info" | "success" | "default"> = {
  draft: "draft",
  review: "info",
  published: "success",
  archived: "default",
};

export default function AssessmentBuilderPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const assessmentId = params?.id;

  const [assessment, setAssessment] = useState<AssessmentDetail | null>(null);
  const [bank, setBank] = useState<BankQuestion[]>([]);
  const [selected, setSelected] = useState<{ question_id: string; marks_override: number | null }[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const [componentMax, setComponentMax] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!assessmentId) return;
    setLoading(true);
    setError(null);
    try {
      const [detailRes, bankRes] = await Promise.all([
        fetch(`/api/cbt/assessments/${assessmentId}`),
        fetch("/api/cbt/questions?status=approved"),
      ]);

      const detail = await detailRes.json().catch(() => ({}));
      if (!detailRes.ok) {
        setError(detail.error || `Could not load the assessment (HTTP ${detailRes.status})`);
        return;
      }

      setAssessment(detail.assessment);
      setSelected(
        (detail.assessment.questions ?? []).map((q: SelectedQuestion) => ({
          question_id: q.question_id,
          marks_override: q.marks_override,
        })),
      );

      const bankBody = await bankRes.json().catch(() => ({}));
      setBank(bankRes.ok ? (bankBody.questions ?? []) : []);

      // The component's ceiling, so the running total is shown against something
      // real rather than in the abstract.
      if (detail.assessment.class_id) {
        const optRes = await fetch(
          `/api/cbt/assessments/options?class_id=${detail.assessment.class_id}`,
        );
        const opts = await optRes.json().catch(() => ({}));
        const match = (opts.components ?? []).find(
          (c: { id: string }) => c.id === detail.assessment.component_id,
        );
        setComponentMax(match?.maximum_score ?? null);
      }
    } catch {
      setError("Could not reach the server.");
    } finally {
      setLoading(false);
    }
  }, [assessmentId]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const bankById = new Map(bank.map((q) => [q.id, q]));

  // A saved override wins, then the bank's own value, then whatever the
  // assessment last stored — for a question that is no longer approved.
  const marksFor = (id: string, override: number | null): number => {
    if (override !== null) return override;
    const fromBank = bankById.get(id)?.marks;
    if (fromBank !== undefined) return fromBank;
    const fromAssessment = assessment?.questions.find((q) => q.question_id === id)?.marks;
    return fromAssessment ?? 0;
  };

  const totalMarks = selected.reduce((sum, s) => sum + marksFor(s.question_id, s.marks_override), 0);
  const overAllocated = componentMax !== null && totalMarks > componentMax;

  const isSelected = (id: string) => selected.some((s) => s.question_id === id);

  const toggle = (id: string) => {
    setProblems([]);
    setSelected((current) =>
      isSelected(id)
        ? current.filter((s) => s.question_id !== id)
        : [...current, { question_id: id, marks_override: null }],
    );
  };

  const move = (index: number, delta: number) => {
    setSelected((current) => {
      const next = [...current];
      const target = index + delta;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const save = async () => {
    if (!assessmentId || selected.length === 0) {
      toast.error("Select at least one question");
      return;
    }
    setSaving(true);
    setProblems([]);
    try {
      const res = await fetch(`/api/cbt/assessments/${assessmentId}/questions`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ questions: selected }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error || "Could not save the questions");
        return;
      }
      toast.success("Questions saved");
      await load();
    } catch {
      toast.error("Could not reach the server.");
    } finally {
      setSaving(false);
    }
  };

  const publish = async () => {
    if (!assessmentId) return;
    setPublishing(true);
    setProblems([]);
    try {
      const res = await fetch(`/api/cbt/assessments/${assessmentId}/publish`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        // The server's own list of what is wrong, rendered as returned.
        setProblems(body.problems ?? [body.error ?? "Could not publish"]);
        return;
      }
      toast.success("Assessment published");
      await load();
    } catch {
      toast.error("Could not reach the server.");
    } finally {
      setPublishing(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 tablet:p-8">
        <p className="text-body text-text-secondary">Loading…</p>
      </div>
    );
  }

  if (error || !assessment) {
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

  const frozen = assessment.attempt_count > 0;
  const published = assessment.status === "published";
  const editable = !frozen && !published;

  return (
    <div className="p-6 tablet:p-8 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <button
            type="button"
            onClick={() => router.push("/teacher/cbt/assessments")}
            className="text-caption text-text-secondary hover:text-primary transition-colors"
          >
            ← All assessments
          </button>
          <h1 className="text-h1 font-bold text-text-primary mt-1">{assessment.title}</h1>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <Badge variant={STATUS_VARIANT[assessment.status]}>{assessment.status}</Badge>
            <span className="text-caption text-text-secondary">
              {assessment.max_attempts} attempt(s)
              {assessment.time_limit_minutes
                ? ` · ${assessment.time_limit_minutes} min`
                : " · untimed"}
              {` · official: ${assessment.official_attempt_rule}`}
            </span>
          </div>
        </div>
        {!published && (
          <div className="flex gap-2">
            <Button
              variant="secondary"
              loading={saving}
              disabled={!editable}
              onClick={() => void save()}
            >
              Save questions
            </Button>
            <Button variant="primary" loading={publishing} onClick={() => void publish()}>
              Publish
            </Button>
          </div>
        )}
      </div>

      {published && (
        <div className="rounded-lg border border-success bg-success-bg px-4 py-3 text-body text-success">
          This assessment is published. Students in the class can attempt it while it stays
          published.
        </div>
      )}

      {frozen && !published && (
        <div className="rounded-lg border border-warning bg-warning-bg px-4 py-3 text-body text-warning">
          {assessment.attempt_count} attempt(s) already exist, so this assessment&apos;s class,
          term, component and questions can no longer be changed.
        </div>
      )}

      {problems.length > 0 && (
        <div className="rounded-lg border border-error bg-error-bg px-4 py-3 space-y-1">
          <p className="text-body font-semibold text-error">
            This assessment is not ready to publish:
          </p>
          <ul className="list-disc pl-5 text-body text-error">
            {problems.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </div>
      )}

      <Card variant="default" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-h2 font-semibold text-text-primary">
            Paper — {selected.length} question(s)
          </h2>
          <span
            className={`text-body font-mono ${overAllocated ? "text-error" : "text-text-secondary"}`}
          >
            {totalMarks} mark(s)
            {componentMax !== null ? ` of ${componentMax} available` : ""}
          </span>
        </div>

        {overAllocated && (
          <p className="text-caption text-error">
            The questions are worth more than the component can hold, so publishing will be
            refused.
          </p>
        )}

        {selected.length === 0 ? (
          <p className="text-body text-text-secondary">
            No questions yet. Pick from the approved questions below.
          </p>
        ) : (
          <ol className="space-y-2">
            {selected.map((s, i) => {
              const q = bankById.get(s.question_id);
              return (
                <li
                  key={s.question_id}
                  className="flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2"
                >
                  <span className="text-caption text-text-disabled font-mono w-6">{i + 1}</span>
                  <span className="flex-1 text-body text-text-primary line-clamp-2">
                    {q?.question_text ?? "(question no longer approved)"}
                  </span>
                  <span className="text-caption text-text-secondary">
                    {TYPE_LABEL[q?.question_type ?? ""] ?? "—"}
                  </span>
                  <span className="text-caption font-mono text-text-secondary">
                    {marksFor(s.question_id, s.marks_override)}
                  </span>
                  {editable && (
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => move(i, -1)}>
                        ↑
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => move(i, 1)}>
                        ↓
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => toggle(s.question_id)}>
                        Remove
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </Card>

      <Card variant="default" className="space-y-4">
        <h2 className="text-h2 font-semibold text-text-primary">Approved questions</h2>
        {bank.length === 0 ? (
          <p className="text-body text-text-secondary">
            No approved questions yet. Approve some in the question bank first.
          </p>
        ) : (
          <div className="space-y-2">
            {bank.map((q) => (
              <label
                key={q.id}
                className={`flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2 transition-colors ${
                  editable ? "cursor-pointer hover:bg-clay" : "opacity-70"
                }`}
              >
                <input
                  type="checkbox"
                  checked={isSelected(q.id)}
                  disabled={!editable}
                  onChange={() => toggle(q.id)}
                />
                <span className="flex-1 text-body text-text-primary line-clamp-2">
                  {q.question_text}
                </span>
                <span className="text-caption text-text-secondary">
                  {TYPE_LABEL[q.question_type]}
                </span>
                <span className="text-caption font-mono text-text-secondary">{q.marks}</span>
              </label>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
