"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Button, Badge, toast } from "@/components/ui";

/**
 * Student CBT list (Phase 18 UI) — what I can sit, and where I am.
 *
 * Attempt history is shown in full, Take 1 / Take 2 / Take 3, because a later
 * attempt never overwrites an earlier one and a student who cannot see that would
 * reasonably assume their first attempt was erased. It is also the only way the
 * official-attempt rule is legible: "latest counts" means nothing unless the
 * student can see which one counted.
 *
 * "Resume" and "Start" are separate actions on purpose. Starting a second attempt
 * while one is live would let a student work two papers in parallel; the server
 * refuses it, and the screen offers the resume instead of a dead end.
 */

type Attempt = {
  id: string;
  attempt_number: number;
  status: string;
  submitted_at: string | null;
  total_score: number | null;
  percentage: number | null;
  is_official: boolean;
};

type StudentAssessment = {
  id: string;
  title: string;
  instructions: string | null;
  max_attempts: number;
  time_limit_minutes: number | null;
  official_attempt_rule: string;
  attempts_used: number;
  can_start: boolean;
  resume_attempt_id: string | null;
  attempts: Attempt[];
  official: { total_score: number; max_score: number; percentage: number | null } | null;
};

const STATUS_VARIANT: Record<string, "default" | "info" | "success" | "warning"> = {
  in_progress: "info",
  submitted: "warning",
  marked: "success",
  invalidated: "default",
};

export default function StudentCbtPage() {
  const router = useRouter();
  const [assessments, setAssessments] = useState<StudentAssessment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/cbt/student/assessments");
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error || `Could not load your assessments (HTTP ${res.status})`);
        setAssessments([]);
        return;
      }
      setAssessments(body.assessments ?? []);
    } catch {
      setError("Could not reach the server.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const start = async (assessmentId: string) => {
    setStarting(assessmentId);
    try {
      const res = await fetch(`/api/cbt/assessments/${assessmentId}/attempts`, { method: "POST" });
      const body = await res.json().catch(() => ({}));

      // 409 with a resume id means an attempt is already open — go to it rather
      // than showing the student an error they cannot act on.
      if (res.status === 409 && body.resume_attempt_id) {
        router.push(`/student/cbt/attempt/${body.resume_attempt_id}`);
        return;
      }
      if (!res.ok) {
        toast.error(body.error || "Could not start the assessment");
        await load();
        return;
      }
      router.push(`/student/cbt/attempt/${body.attempt_id}`);
    } catch {
      toast.error("Could not reach the server.");
    } finally {
      setStarting(null);
    }
  };

  if (loading) {
    return (
      <div className="p-5 tablet:p-8">
        <p className="text-body text-text-secondary">Loading…</p>
      </div>
    );
  }

  return (
    <div className="p-5 tablet:p-8 space-y-5">
      <div>
        <h1 className="text-h1 font-bold text-text-primary">Tests</h1>
        <p className="text-body text-text-secondary mt-1">
          Your computer-based tests. Read the instructions before you start.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-error bg-error-bg px-4 py-3 text-body text-error">
          {error}
        </div>
      )}

      {assessments.length === 0 && !error && (
        <Card variant="default">
          <p className="text-body text-text-secondary">
            No tests are available for you right now. They appear here when a teacher publishes one
            for your class.
          </p>
        </Card>
      )}

      <div className="space-y-4">
        {assessments.map((a) => (
          <Card key={a.id} variant="default" className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-h2 font-semibold text-text-primary">{a.title}</h2>
                <p className="text-caption text-text-secondary mt-1">
                  {a.attempts_used} of {a.max_attempts} attempt(s) used
                  {a.time_limit_minutes ? ` · ${a.time_limit_minutes} minutes` : " · no time limit"}
                </p>
              </div>

              {a.official && (
                <div className="text-right">
                  <p className="text-h2 font-bold text-primary">
                    {a.official.percentage !== null ? `${a.official.percentage}%` : "—"}
                  </p>
                  <p className="text-caption text-text-secondary">
                    {a.official.total_score} / {a.official.max_score} · official
                  </p>
                </div>
              )}
            </div>

            {a.instructions && (
              <div className="rounded-lg border border-border bg-clay px-3 py-2">
                <p className="text-caption text-text-secondary whitespace-pre-wrap">
                  {a.instructions}
                </p>
              </div>
            )}

            {a.attempts.length > 0 && (
              <div className="space-y-1">
                {a.attempts.map((t) => (
                  <div
                    key={t.id}
                    className="flex flex-wrap items-center gap-2 text-caption text-text-secondary"
                  >
                    <span className="font-mono w-16">Take {t.attempt_number}</span>
                    <Badge variant={STATUS_VARIANT[t.status] ?? "default"}>{t.status}</Badge>
                    {t.total_score !== null ? (
                      <span className="font-mono">
                        {t.total_score}
                        {t.percentage !== null ? ` (${t.percentage}%)` : ""}
                      </span>
                    ) : (
                      <span>not marked yet</span>
                    )}
                    {t.is_official && <Badge variant="success">counts</Badge>}
                    {t.status === "in_progress" && (
                      <button
                        type="button"
                        className="text-primary hover:underline"
                        onClick={() => router.push(`/student/cbt/attempt/${t.id}`)}
                      >
                        Continue
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {a.resume_attempt_id ? (
                <Button
                  variant="primary"
                  onClick={() => router.push(`/student/cbt/attempt/${a.resume_attempt_id}`)}
                >
                  Resume attempt
                </Button>
              ) : a.can_start ? (
                <Button
                  variant="primary"
                  loading={starting === a.id}
                  onClick={() => void start(a.id)}
                >
                  {a.attempts_used === 0 ? "Start test" : "Start another attempt"}
                </Button>
              ) : (
                <p className="text-caption text-text-secondary">
                  You have used all {a.max_attempts} attempt(s) for this test.
                </p>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
