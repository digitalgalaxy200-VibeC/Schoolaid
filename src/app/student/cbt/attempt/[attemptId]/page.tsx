"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, Button, Badge, toast } from "@/components/ui";

/**
 * Student CBT taking screen (Phase 18 UI).
 *
 * THE CLOCK IS THE SERVER'S. `expires_at` and `server_now` come from the API on
 * load; this page computes an offset once and renders the countdown from that.
 * It never uses the browser's raw clock, so a device set to the wrong time cannot
 * grant extra minutes — and the server independently refuses writes after expiry,
 * so even a tampered page cannot answer late.
 *
 * ONE QUESTION PER SCREEN, with a grid to jump. Answers are saved as they are
 * made, not at the end: a dropped connection twenty minutes into a paper must not
 * cost the student the first nineteen.
 *
 * A FAILED SAVE IS SHOWN, not swallowed. A silent autosave failure is the worst
 * possible bug here — the student would keep working believing their answers were
 * recorded.
 *
 * The questions arrive already stripped of the answer key (the API's student
 * projection), so nothing on this page could reveal one even by accident.
 */

type QuestionType = "mcq" | "true_false" | "theory";

type AttemptQuestion = {
  id: string;
  question_id: string;
  display_order: number;
  question_type: QuestionType;
  question_text: string;
  options_snapshot: { option_id: string; label: string | null; option_text: string }[];
  marks: number;
};

type Answer = {
  attempt_question_id: string;
  selected_option_id: string | null;
  answer_text: string | null;
};

type AttemptPayload = {
  attempt: {
    id: string;
    attempt_number: number;
    status: "in_progress" | "submitted" | "marked" | "invalidated";
    started_at: string;
    expires_at: string | null;
    submitted_at: string | null;
    server_now: string;
  };
  questions: AttemptQuestion[];
  answers: Answer[];
};

function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function TakeAttemptPage() {
  const params = useParams<{ attemptId: string }>();
  const router = useRouter();
  const attemptId = params?.attemptId;

  const [data, setData] = useState<AttemptPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<{ pending_human_marking: number } | null>(null);
  const [remainingMs, setRemainingMs] = useState<number | null>(null);

  // Server clock offset, captured once. Everything time-related is rendered from
  // this rather than from Date.now() alone.
  const offsetRef = useRef(0);
  const expiresRef = useRef<number | null>(null);
  const autoSubmittedRef = useRef(false);

  const load = useCallback(async () => {
    if (!attemptId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/cbt/attempts/${attemptId}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error || `Could not load the attempt (HTTP ${res.status})`);
        return;
      }

      const payload = body as AttemptPayload;
      payload.questions = [...(payload.questions ?? [])].sort(
        (a, b) => a.display_order - b.display_order,
      );

      offsetRef.current = Date.parse(payload.attempt.server_now) - Date.now();
      expiresRef.current = payload.attempt.expires_at
        ? Date.parse(payload.attempt.expires_at)
        : null;

      setData(payload);
      const byQuestion: Record<string, Answer> = {};
      for (const a of payload.answers ?? []) byQuestion[a.attempt_question_id] = a;
      setAnswers(byQuestion);

      if (payload.attempt.status !== "in_progress") {
        setSubmitted({ pending_human_marking: payload.attempt.status === "submitted" ? 1 : 0 });
      }
    } catch {
      setError("Could not reach the server.");
    } finally {
      setLoading(false);
    }
  }, [attemptId]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  // Countdown, driven by the server's clock.
  useEffect(() => {
    if (!data || expiresRef.current === null) return;

    const tick = () => {
      const now = Date.now() + offsetRef.current;
      setRemainingMs(expiresRef.current! - now);
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [data]);

  const save = useCallback(
    async (attemptQuestionId: string, selectedOptionId: string | null, answerText: string | null) => {
      if (!attemptId) return;
      setSaveState("saving");
      try {
        const res = await fetch(`/api/cbt/attempts/${attemptId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            attempt_question_id: attemptQuestionId,
            selected_option_id: selectedOptionId,
            answer_text: answerText,
          }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setSaveState("failed");
          // Loud, because a student who does not know their answer was not saved
          // will keep going and lose it.
          toast.error(body.error || "Your answer could not be saved");
          return;
        }
        setSaveState("saved");
      } catch {
        setSaveState("failed");
        toast.error("Your answer could not be saved — check your connection");
      }
    },
    [attemptId],
  );

  const answer = useCallback(
    async (question: AttemptQuestion, selectedOptionId: string | null, answerText: string | null) => {
      setAnswers((current) => ({
        ...current,
        [question.id]: {
          attempt_question_id: question.id,
          selected_option_id: selectedOptionId,
          answer_text: answerText,
        },
      }));
      await save(question.id, selectedOptionId, answerText);
    },
    [save],
  );

  const submit = useCallback(
    async (auto = false) => {
      if (!attemptId || submitting) return;
      setSubmitting(true);
      try {
        const res = await fetch(`/api/cbt/attempts/${attemptId}/submit`, { method: "POST" });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast.error(body.error || "Could not submit");
          return;
        }
        setSubmitted({ pending_human_marking: body.pending_human_marking ?? 0 });
        toast.success(auto ? "Time is up — your paper was submitted" : "Test submitted");
      } catch {
        toast.error("Could not reach the server. Your answers are saved — try again.");
      } finally {
        setSubmitting(false);
      }
    },
    [attemptId, submitting],
  );

  // Auto-submit when the server's clock says time is up.
  useEffect(() => {
    if (remainingMs === null || remainingMs > 0) return;
    if (!data || data.attempt.status !== "in_progress") return;
    if (autoSubmittedRef.current) return;
    autoSubmittedRef.current = true;
    void submit(true);
  }, [remainingMs, data, submit]);

  const questions = data?.questions ?? [];
  const current = questions[index];

  const answeredCount = useMemo(
    () =>
      questions.filter((q) => {
        const a = answers[q.id];
        return Boolean(a && (a.selected_option_id || (a.answer_text ?? "").trim() !== ""));
      }).length,
    [questions, answers],
  );

  if (loading) {
    return (
      <div className="p-5 tablet:p-8">
        <p className="text-body text-text-secondary">Loading your paper…</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-5 tablet:p-8 space-y-4">
        <div className="rounded-lg border border-error bg-error-bg px-4 py-3 text-body text-error">
          {error ?? "Attempt not found."}
        </div>
        <Button variant="secondary" onClick={() => router.push("/student/cbt")}>
          Back to tests
        </Button>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="p-5 tablet:p-8 space-y-5">
        <Card variant="default" className="space-y-3">
          <h1 className="text-h2 font-semibold text-text-primary">Test submitted</h1>
          <p className="text-body text-text-secondary">
            Your answers have been recorded. You can close this page.
          </p>
          {submitted.pending_human_marking > 0 && (
            <p className="text-caption text-text-secondary">
              Some written answers still need to be marked by a teacher before your final score is
              available.
            </p>
          )}
          <Button variant="secondary" onClick={() => router.push("/student/cbt")}>
            Back to tests
          </Button>
        </Card>
      </div>
    );
  }

  const expired = remainingMs !== null && remainingMs <= 0;
  const low = remainingMs !== null && remainingMs <= 60_000;

  return (
    <div className="p-5 tablet:p-8 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <button
            type="button"
            onClick={() => router.push("/student/cbt")}
            className="text-caption text-text-secondary hover:text-primary transition-colors"
          >
            ← All tests
          </button>
          <p className="text-caption text-text-secondary mt-1">
            Take {data.attempt.attempt_number} · {answeredCount} of {questions.length} answered
          </p>
        </div>

        <div className="flex items-center gap-3">
          {saveState !== "idle" && (
            <span
              className={`text-caption ${
                saveState === "failed" ? "text-error" : "text-text-secondary"
              }`}
            >
              {saveState === "saving"
                ? "Saving…"
                : saveState === "saved"
                  ? "Saved"
                  : "Not saved"}
            </span>
          )}
          {remainingMs !== null && (
            <span
              className={`text-h2 font-mono font-bold ${
                expired ? "text-error" : low ? "text-warning" : "text-text-primary"
              }`}
            >
              {expired ? "00:00" : formatClock(remainingMs)}
            </span>
          )}
          <Button variant="primary" loading={submitting} onClick={() => void submit(false)}>
            Submit
          </Button>
        </div>
      </div>

      {expired && (
        <div className="rounded-lg border border-error bg-error-bg px-4 py-3 text-body text-error">
          Time is up. Your saved answers are being submitted; answers made after the deadline are
          not accepted.
        </div>
      )}

      {current ? (
        <Card variant="default" className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <p className="text-caption text-text-secondary">
              Question {index + 1} of {questions.length}
            </p>
            <Badge variant="default">{current.marks} mark(s)</Badge>
          </div>

          <p className="text-body-lg text-text-primary whitespace-pre-wrap">
            {current.question_text}
          </p>

          {current.question_type === "theory" ? (
            <>
              <textarea
                rows={8}
                value={answers[current.id]?.answer_text ?? ""}
                disabled={expired}
                onChange={(e) => {
                  const value = e.target.value;
                  setAnswers((prev) => ({
                    ...prev,
                    [current.id]: {
                      attempt_question_id: current.id,
                      selected_option_id: null,
                      answer_text: value,
                    },
                  }));
                }}
                // Saved on blur rather than on every keystroke: a request per
                // character would be noise, and blur is a natural pause.
                onBlur={() =>
                  void save(current.id, null, answers[current.id]?.answer_text ?? "")
                }
                placeholder="Write your answer here."
                className="w-full px-3 py-2.5 border border-border rounded-lg text-body bg-surface resize-y focus:outline-none focus:border-primary transition-colors disabled:opacity-60"
              />
              <p className="text-caption text-text-secondary">
                Your answer is saved when you leave the box.
              </p>
            </>
          ) : (
            <div className="space-y-2">
              {current.options_snapshot.map((o) => {
                const chosen = answers[current.id]?.selected_option_id === o.option_id;
                return (
                  <button
                    key={o.option_id}
                    type="button"
                    disabled={expired}
                    onClick={() => void answer(current, o.option_id, null)}
                    className={`w-full text-left flex items-center gap-3 rounded-lg border px-3 py-3 transition-colors disabled:opacity-60 ${
                      chosen
                        ? "border-primary bg-primary-light"
                        : "border-border bg-surface hover:bg-clay"
                    }`}
                  >
                    <span
                      className={`w-6 h-6 shrink-0 rounded-full border flex items-center justify-center text-caption font-semibold ${
                        chosen ? "border-primary bg-primary text-text-inverse" : "border-border-strong text-text-secondary"
                      }`}
                    >
                      {o.label ?? "•"}
                    </span>
                    <span className="text-body text-text-primary">{o.option_text}</span>
                  </button>
                );
              })}
            </div>
          )}
        </Card>
      ) : (
        <Card variant="default">
          <p className="text-body text-text-secondary">This paper has no questions.</p>
        </Card>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <Button
            variant="secondary"
            disabled={index === 0}
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
          >
            Previous
          </Button>
          <Button
            variant="secondary"
            disabled={index >= questions.length - 1}
            onClick={() => setIndex((i) => Math.min(questions.length - 1, i + 1))}
          >
            Next
          </Button>
        </div>

        <div className="flex flex-wrap gap-1">
          {questions.map((q, i) => {
            const a = answers[q.id];
            const done = Boolean(a && (a.selected_option_id || (a.answer_text ?? "").trim() !== ""));
            return (
              <button
                key={q.id}
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Go to question ${i + 1}`}
                className={`w-8 h-8 rounded-md text-caption font-semibold border transition-colors ${
                  i === index
                    ? "border-primary bg-primary text-text-inverse"
                    : done
                      ? "border-success bg-success-bg text-success"
                      : "border-border bg-surface text-text-secondary hover:bg-clay"
                }`}
              >
                {i + 1}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
