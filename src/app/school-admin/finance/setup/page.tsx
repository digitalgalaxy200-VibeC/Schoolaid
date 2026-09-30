"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card, Button, Badge, showToast } from "@/components/ui";
import { fetchObject } from "@/components/finance/helpers";
import { SETUP_STEPS, TOTAL_SETUP_STEPS } from "@/lib/finance/setup";

// Finance → Setup Guide — a guided, resumable wizard.
// Each step explains WHAT to do and WHY it matters, then jumps into the real
// screen. Progress (N/11) is tracked per school: auto-detected steps complete
// themselves from real finance records; a few steps are confirmed manually.

type StepStatus = {
  key: string;
  title: string;
  status: "done" | "todo";
  auto_detected: boolean;
  manual_eligible: boolean;
};

type SetupPayload = {
  total: number;
  done_count: number;
  dismissed: boolean;
  steps: StepStatus[];
};

const statusOf = (statuses: StepStatus[], key: string) => statuses.find((s) => s.key === key);

export default function FinanceSetupPage() {
  const [data, setData] = useState<SetupPayload | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const load = () => {
    fetchObject<SetupPayload>("/api/school-admin/finance/setup").then((d) => {
      setData(d);
      if (d && !open) {
        const firstTodo = d.steps.find((s) => s.status === "todo");
        setOpen(firstTodo?.key || d.steps[0]?.key || null);
      }
    });
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const mark = async (step: string, done: boolean) => {
    setBusy(step);
    const res = await fetch("/api/school-admin/finance/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ step, done }),
    });
    const d = await res.json().catch(() => ({}));
    setBusy(null);
    if (res.ok) {
      setData(d);
      showToast({ type: "success", title: done ? "Step completed — nice!" : "Step reopened" });
    } else {
      showToast({ type: "error", title: d?.error || "Could not update the guide" });
    }
  };

  const dismiss = async () => {
    const res = await fetch("/api/school-admin/finance/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dismissed: true }),
    });
    const d = await res.json().catch(() => ({}));
    if (res.ok) {
      setData(d);
      showToast({ type: "success", title: "Guide hidden — reopen it any time from the Setup tab" });
    }
  };

  const doneCount = data?.done_count ?? 0;
  const allDone = data !== null && doneCount >= TOTAL_SETUP_STEPS;
  const pct = Math.round((doneCount / TOTAL_SETUP_STEPS) * 100);

  const firstTodoKey = useMemo(() => data?.steps.find((s) => s.status === "todo")?.key || null, [data]);

  return (
    <div className="space-y-5">
      {/* Header + progress */}
      <Card padding="md">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="text-h3 font-bold text-text-primary">Finance setup guide</p>
            <p className="text-caption text-text-secondary">
              {allDone
                ? "Everything is in place. This guide stays here if you ever need a refresher."
                : `${doneCount} of ${TOTAL_SETUP_STEPS} steps done — follow the guide in order; each step jumps into the real screen.`}
            </p>
          </div>
          <div className="text-right">
            <p className="text-h2 font-extrabold text-primary">
              {doneCount}
              <span className="text-caption text-text-secondary font-semibold">/{TOTAL_SETUP_STEPS}</span>
            </p>
            <p className="text-caption text-text-secondary">steps done</p>
          </div>
        </div>
        <div className="h-3 mt-3 rounded-full bg-clay overflow-hidden">
          <div className="h-full bg-success rounded-full transition-all" style={{ width: `${pct}%` }} />
        </div>
        {!allDone && (
          <button onClick={dismiss} className="mt-3 text-caption font-semibold text-text-secondary underline">
            Hide this guide from the Finance header (you can reopen it here)
          </button>
        )}
      </Card>

      {/* Completion banner */}
      {allDone && (
        <Card variant="clay" padding="md" className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-caption text-text-primary">🎉 Finance is set up — you&apos;re ready to collect. Record your first real payment whenever you are.</p>
          <div className="flex gap-2">
            <Link href="/school-admin/finance/payments">
              <Button size="sm">Go to Payments</Button>
            </Link>
            <Button size="sm" variant="secondary" onClick={dismiss}>
              Hide banner
            </Button>
          </div>
        </Card>
      )}

      {/* Steps */}
      <div className="space-y-2">
        {SETUP_STEPS.map((def, i) => {
          const st = data ? statusOf(data.steps, def.key) : undefined;
          const done = st?.status === "done";
          const current = !done && firstTodoKey === def.key;
          const expanded = open === def.key;
          return (
            <Card
              key={def.key}
              padding="md"
              className={`transition-colors ${done ? "opacity-80" : ""} ${current ? "border-primary" : ""}`}
            >
              <button
                onClick={() => setOpen(expanded ? null : def.key)}
                className="w-full flex items-center justify-between gap-3 text-left"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className={`w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-caption font-bold ${
                      done ? "bg-success text-white" : current ? "bg-primary text-text-inverse" : "bg-clay text-text-secondary"
                    }`}
                  >
                    {done ? "✓" : i + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="font-semibold text-text-primary">{def.title}</p>
                    <p className="text-caption text-text-secondary truncate">{def.summary}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {done ? (
                    <Badge variant="success">Done</Badge>
                  ) : current ? (
                    <Badge variant="info">Next</Badge>
                  ) : (
                    <Badge variant="default">Todo</Badge>
                  )}
                </div>
              </button>

              {expanded && (
                <div className="mt-4 pt-4 border-t border-border space-y-3">
                  <div className="rounded-lg bg-clay px-3 py-2.5">
                    <p className="text-caption font-semibold text-text-secondary uppercase tracking-wider mb-1">Why this matters</p>
                    <p className="text-caption text-text-primary leading-relaxed">{def.why}</p>
                  </div>
                  <div className="flex flex-wrap gap-2 items-center">
                    <Link href={def.href}>
                      <Button size="sm">{def.actionLabel} →</Button>
                    </Link>
                    {st?.manual_eligible && (
                      <Button size="sm" variant="secondary" onClick={() => mark(def.key, !done)} loading={busy === def.key}>
                        {done ? "Reopen step" : "Mark as done"}
                      </Button>
                    )}
                    {done && st?.auto_detected && (
                      <span className="text-caption text-text-disabled">Detected automatically from your records.</span>
                    )}
                    {!done && !st?.manual_eligible && (
                      <span className="text-caption text-text-disabled">This step completes automatically once you do it.</span>
                    )}
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
