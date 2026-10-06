"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, Button, Badge, toast } from "@/components/ui";
import { QuestionCard } from "@/components/cbt/QuestionCard";

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
  /** The section this question sat in, frozen with the attempt. */
  section: string | null;
  /** The question's image, signed per read; null when the question has none. */
  media: { url: string | null; content_type: string | null } | null;
};

/** The paper's sections (heading + instruction), frozen with the attempt. */
type AttemptSection = { label: string; instruction: string | null };

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
    /** Set when a republished paper replaced this attempt's questions. */
    paper_changed_at?: string | null;
    server_now: string;
  };
  sections: AttemptSection[];
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
  const [submitted, setSubmitted] = useState<{
    /** Written answers a teacher must still mark before the score is complete. */
    pending_human_marking: number;
    /** This attempt's marks; only shown when nothing is awaiting a teacher. */
    total_score: number | null;
    /** False when the page was reopened after submission — no greeting replay. */
    fresh: boolean;
  } | null>(null);
  /** The review step: every question at a glance, before the paper is sent. */
  const [reviewing, setReviewing] = useState(false);
  /** Which review row is opened for answering, if any. */
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [studentName, setStudentName] = useState("");
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
        setSubmitted({
          pending_human_marking: payload.attempt.status === "submitted" ? 1 : 0,
          total_score: null,
          fresh: false,
        });
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

  // The student's own name, for the closing screen. Best-effort: the greeting
  // falls back to "Student" if the session read fails.
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setStudentName(typeof d?.full_name === "string" ? d.full_name : ""))
      .catch(() => {});
  }, []);

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
        setSubmitted({
          pending_human_marking: body.pending_human_marking ?? 0,
          total_score:
            typeof body.score?.totalScore === "number" ? body.score.totalScore : null,
          fresh: true,
        });
        toast.success(auto ? "Time is up — your paper was submitted" : "CBT submitted");
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

  // Section context for the question on screen. The attempt froze its own copy
  // of the sections at start, so this reflects what THIS student's paper was,
  // even if the assessment was edited since.
  const sectionByLabel = new Map(
    (data?.sections ?? [])
      .filter((s) => s && typeof s.label === "string")
      .map((s) => [s.label.trim().toLowerCase(), s]),
  );
  const currentSection = sectionFor(current?.section ?? null);

  /** The frozen section (label + instruction) for a question, or null. */
  function sectionFor(label: string | null | undefined) {
    const trimmed = (label ?? "").trim();
    if (!trimmed) return null;
    return {
      label: trimmed,
      instruction: sectionByLabel.get(trimmed.toLowerCase())?.instruction ?? null,
    };
  }

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
      <div className="p-4 tablet:p-8">
        <p className="text-body text-text-secondary">Loading your paper…</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-4 tablet:p-8 space-y-4">
        <div className="rounded-lg border border-error bg-error-bg px-4 py-3 text-body text-error">
          {error ?? "Attempt not found."}
        </div>
        <Button variant="secondary" className="w-full tablet:w-auto" onClick={() => router.push("/student/cbt")}>
          Back to CBT
        </Button>
      </div>
    );
  }

  if (submitted) {
    const firstName = studentName.trim().split(/\s+/)[0] || "Student";
    // A number is shown only when it is the whole truth: written answers are
    // marked later, and an objective-only figure would read as the final score.
    const showScore =
      submitted.fresh && submitted.pending_human_marking === 0 && submitted.total_score !== null;

    return (
      <div className="p-4 tablet:p-8 space-y-5">
        <Card variant="default" className="space-y-3">
          <h1 className="text-h1 tablet:text-h2 font-bold tablet:font-semibold text-text-primary">
            {submitted.fresh ? `Congratulations, ${firstName}!` : "CBT submitted"}
          </h1>

          {showScore ? (
            <p className="text-body text-text-secondary">
              You got{" "}
              <span className="text-h2 font-bold font-mono text-primary">
                {submitted.total_score}
              </span>
              .
            </p>
          ) : (
            <p className="text-body text-text-secondary">
              {submitted.fresh
                ? "Your answers have been recorded."
                : "Your answers were already recorded for this CBT."}
            </p>
          )}

          {submitted.pending_human_marking > 0 && (
            <p className="text-body text-text-secondary">
              Your written answers will be marked by your teacher.
            </p>
          )}

          <p className="text-body text-text-secondary">
            Your teacher will publish your final score.
          </p>

          <Button variant="secondary" className="w-full tablet:w-auto" onClick={() => router.push("/student/cbt")}>
            Back to CBT
          </Button>
        </Card>
      </div>
    );
  }

  const expired = remainingMs !== null && remainingMs <= 0;
  const low = remainingMs !== null && remainingMs <= 60_000;

  return (
    /* A phone-sized exam screen, not a document: the paper scrolls, the header and the
       actions do not. `top-12` and `bottom-14` are exactly the bands the student shell
       reserves for its mobile bars (`mt-12` / `mb-14`), so this fills the space between
       them and nothing hides behind either one. From `tablet:` up it is an ordinary page
       again — the same markup, in the same order as before. */
    <div className="fixed inset-x-0 top-12 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-30 flex flex-col bg-bg tablet:static tablet:inset-auto tablet:bottom-auto tablet:z-auto tablet:block tablet:space-y-4 tablet:bg-transparent tablet:p-8">
      {/* Header — progress and the clock, always on screen while the paper scrolls. */}
      <div className="shrink-0 border-b border-border bg-surface px-4 py-2 tablet:border-0 tablet:bg-transparent tablet:px-0 tablet:py-0">
      <div className="flex flex-wrap items-center justify-between gap-2 tablet:gap-3">
        <div>
          <button
            type="button"
            onClick={() => router.push("/student/cbt")}
            className="text-caption text-text-secondary hover:text-primary transition-colors"
          >
            ← CBT
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
          <Button
            variant="primary"
            loading={submitting && reviewing}
            onClick={() => setReviewing((v) => !v)}
            className="hidden tablet:inline-flex"
          >
            {reviewing ? "Back to questions" : "Review & submit"}
          </Button>
        </div>
      </div>
      </div>

      {/* The paper. The only thing on this screen that scrolls on a phone. */}
      <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 space-y-4 tablet:flex-none tablet:overflow-visible tablet:px-0 tablet:py-0">

      {data.attempt.paper_changed_at && (
        <div className="rounded-lg border border-warning bg-warning-bg px-4 py-3 text-body text-warning">
          Your teacher has updated this test. Go through your questions and answers again before
          you submit.
        </div>
      )}

      {expired && (
        <div className="rounded-lg border border-error bg-error-bg px-4 py-3 text-body text-error">
          Time is up. Your saved answers are being submitted; answers made after the deadline are
          not accepted.
        </div>
      )}

      {reviewing ? (
        <Card variant="default" className="space-y-4">
          <div>
            <h2 className="text-h2 font-semibold text-text-primary">Review your answers</h2>
            <p className="text-caption text-text-secondary mt-1">
              {answeredCount} of {questions.length} answered
              {answeredCount < questions.length
                ? ` — ${questions.length - answeredCount} still to answer.`
                : "."}{" "}
              Tap a question to open it and change your answer.
            </p>
          </div>

          <div className="space-y-2">
            {questions.map((q, i) => {
              const a = answers[q.id];
              const theoryText = (a?.answer_text ?? "").trim();
              const chosen = a?.selected_option_id
                ? (q.options_snapshot.find((o) => o.option_id === a.selected_option_id) ?? null)
                : null;
              const done = Boolean(a && (a.selected_option_id || theoryText !== ""));
              const expanded = expandedId === q.id;

              return (
                <div
                  key={q.id}
                  className={`rounded-lg border bg-surface transition-colors ${
                    expanded ? "border-primary" : "border-border"
                  }`}
                >
                  {/* Collapsed: the question and WHAT SHE ANSWERED, nothing else.
                      The full question with its options opens on tap so the
                      answer can be changed without leaving the review. */}
                  <button
                    type="button"
                    aria-expanded={expanded}
                    onClick={() => setExpandedId(expanded ? null : q.id)}
                    className="w-full text-left rounded-lg px-3 py-3 space-y-1 transition-colors hover:bg-clay"
                  >
                    <div className="flex items-start gap-3">
                      <span className="w-8 h-8 shrink-0 rounded-md border border-border flex items-center justify-center text-caption font-semibold text-text-secondary">
                        {i + 1}
                      </span>
                      <span className="flex-1 min-w-0 text-body text-text-primary">
                        {q.question_text}
                      </span>
                      {!done && <Badge variant="warning">Not answered</Badge>}
                    </div>
                    <p className="pl-11 text-caption line-clamp-2">
                      {done ? (
                        <span className="text-text-secondary">
                          Your answer:{" "}
                          <span className="text-text-primary font-medium">
                            {q.question_type === "theory"
                              ? theoryText
                              : chosen
                                ? `${(chosen.label ?? "").trim() ? `${chosen.label} — ` : ""}${chosen.option_text}`
                                : "—"}
                          </span>
                        </span>
                      ) : (
                        <span className="text-warning">No answer yet — tap to answer.</span>
                      )}
                    </p>
                  </button>

                  {expanded && (
                    <div className="px-3 pb-3 space-y-3">
                      <QuestionCard
                        questionText={q.question_text}
                        questionType={q.question_type}
                        marks={q.marks}
                        section={sectionFor(q.section)}
                        mediaUrl={q.media?.url ?? null}
                        options={q.options_snapshot.map((o) => ({
                          id: o.option_id,
                          label: o.label,
                          text: o.option_text,
                        }))}
                        selectedOptionId={answers[q.id]?.selected_option_id ?? null}
                        answerText={answers[q.id]?.answer_text ?? ""}
                        disabled={expired}
                        onSelectOption={(optionId) => void answer(q, optionId, null)}
                        onAnswerTextChange={(value) =>
                          setAnswers((prev) => ({
                            ...prev,
                            [q.id]: {
                              attempt_question_id: q.id,
                              selected_option_id: null,
                              answer_text: value,
                            },
                          }))
                        }
                        onAnswerTextBlur={() =>
                          void save(q.id, null, answers[q.id]?.answer_text ?? "")
                        }
                        position={`Question ${i + 1} of ${questions.length}`}
                      />
                      <div className="flex justify-end">
                        <Button variant="secondary" onClick={() => setExpandedId(null)}>
                          Done
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="hidden tablet:flex flex-wrap items-center justify-between gap-3">
            <Button variant="secondary" onClick={() => setReviewing(false)}>
              Back to questions
            </Button>
            <Button variant="primary" loading={submitting} onClick={() => void submit(false)}>
              Submit to teacher
            </Button>
          </div>
        </Card>
      ) : (
        <>
          {current ? (
            <QuestionCard
              questionText={current.question_text}
              questionType={current.question_type}
              marks={current.marks}
              section={
                currentSection
                  ? { label: currentSection.label, instruction: currentSection.instruction }
                  : null
              }
              mediaUrl={current.media?.url ?? null}
              options={current.options_snapshot.map((o) => ({
                id: o.option_id,
                label: o.label,
                text: o.option_text,
              }))}
              selectedOptionId={answers[current.id]?.selected_option_id ?? null}
              answerText={answers[current.id]?.answer_text ?? ""}
              disabled={expired}
              onSelectOption={(optionId) => void answer(current, optionId, null)}
              onAnswerTextChange={(value) =>
                setAnswers((prev) => ({
                  ...prev,
                  [current.id]: {
                    attempt_question_id: current.id,
                    selected_option_id: null,
                    answer_text: value,
                  },
                }))
              }
              onAnswerTextBlur={() => void save(current.id, null, answers[current.id]?.answer_text ?? "")}
              position={`Question ${index + 1} of ${questions.length}`}
            />
          ) : (
            <Card variant="default">
              <p className="text-body text-text-secondary">This paper has no questions.</p>
            </Card>
          )}

          <div className="hidden tablet:flex flex-wrap items-center justify-between gap-3">
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
                onClick={() =>
                  index >= questions.length - 1 ? setReviewing(true) : setIndex((i) => i + 1)
                }
              >
                {index >= questions.length - 1 ? "Review" : "Next"}
              </Button>
            </div>

            <div className="flex flex-wrap gap-1">
              {questions.map((q, i) => {
                const a = answers[q.id];
                const done = Boolean(
                  a && (a.selected_option_id || (a.answer_text ?? "").trim() !== ""),
                );
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
        </>
      )}
      </div>

      {/* Thumb bar — mobile only. One implementation of each action; from `tablet:`
          up the same buttons are inline above, exactly as they were. */}
      <div className="tablet:hidden shrink-0 border-t border-border bg-surface px-4 py-2.5">
        {reviewing ? (
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="lg" className="flex-1" onClick={() => setReviewing(false)}>
              Back
            </Button>
            <Button
              variant="primary"
              size="lg"
              className="flex-1"
              loading={submitting}
              onClick={() => void submit(false)}
            >
              Submit
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="lg"
              className="flex-1"
              disabled={index === 0}
              onClick={() => setIndex((i) => Math.max(0, i - 1))}
            >
              Previous
            </Button>
            <Button
              variant="primary"
              size="lg"
              className="flex-1"
              onClick={() =>
                index >= questions.length - 1 ? setReviewing(true) : setIndex((i) => i + 1)
              }
            >
              {index >= questions.length - 1 ? "Review" : "Next"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
