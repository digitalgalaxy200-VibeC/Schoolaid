"use client";

import { useEffect, useState } from "react";
import { Badge, Button, Modal } from "@/components/ui";
import type { AcademicTermRecord } from "@/lib/students/academic-records";

/**
 * Read-only academic history for one student.
 *
 * The data is the stored `term_results` snapshot the report-card workflow
 * already writes, so it works for archived students too and never recomputes
 * anything. The caller supplies the authorised endpoint for its role; this
 * component only renders what that endpoint returns.
 */

type Props = {
  open: boolean;
  onClose: () => void;
  studentId: string | null;
  studentName?: string | null;
  endpoint: string | null;
};

type LoadState =
  | { status: "idle" | "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; terms: AcademicTermRecord[] };

export function AcademicRecordsModal({ open, onClose, studentId, studentName, endpoint }: Props) {
  const [state, setState] = useState<LoadState>({ status: "idle" });
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    if (!open || !studentId || !endpoint) return;

    let cancelled = false;
    fetch(endpoint)
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        return { res, body };
      })
      .then(({ res, body }) => {
        if (cancelled) return;
        if (!res.ok) {
          setState({
            status: "error",
            message: body.error || `Could not load academic records (HTTP ${res.status}).`,
          });
          return;
        }
        setState({ status: "ready", terms: Array.isArray(body.terms) ? body.terms : [] });
      })
      .catch(() => {
        if (cancelled) return;
        setState({ status: "error", message: "Could not reach the server." });
      });

    return () => {
      cancelled = true;
    };
  }, [open, studentId, endpoint, retryToken]);

  const retry = () => {
    setState({ status: "loading" });
    setRetryToken((token) => token + 1);
  };

  const isLoading = state.status === "idle" || state.status === "loading";

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title={studentName ? `${studentName} — Academic Records` : "Academic Records"}
      size="lg"
      footer={
        <div className="flex justify-end">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        {isLoading && (
          <div className="flex justify-center py-10">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          </div>
        )}

        {state.status === "error" && (
          <div className="space-y-3">
            <div className="rounded-lg border border-error bg-error-bg px-4 py-3 text-body text-error">
              {state.message}
            </div>
            <Button variant="secondary" size="sm" onClick={retry}>
              Try again
            </Button>
          </div>
        )}

        {state.status === "ready" && state.terms.length === 0 && (
          <div className="rounded-lg border border-border bg-clay px-4 py-8 text-center">
            <p className="text-small text-text-muted">
              No academic records have been recorded for this student yet.
            </p>
          </div>
        )}

        {state.status === "ready" &&
          state.terms.map((term) => (
            <section
              key={term.term_id}
              className="overflow-hidden rounded-lg border border-border bg-surface"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-clay px-3.5 py-2.5">
                <div className="min-w-0">
                  <p className="text-small font-semibold text-text-primary">
                    {term.term_name}
                  </p>
                  <p className="text-caption text-text-muted">{term.session_name}</p>
                </div>
                <Badge variant={term.published ? "success" : "draft"}>
                  {term.published ? "Published" : "Draft"}
                </Badge>
              </div>

              <div className="divide-y divide-border">
                {term.subjects.length === 0 ? (
                  <p className="px-3.5 py-3 text-small text-text-muted">No subjects recorded.</p>
                ) : (
                  term.subjects.map((subject) => (
                    <div
                      key={`${term.term_id}-${subject.subject_id ?? subject.subject_name}`}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3.5 py-2.5 text-small"
                    >
                      <span className="min-w-0 flex-1 font-medium break-words">
                        {subject.subject_name}
                        {subject.subject_code ? (
                          <span className="ml-1 text-caption text-text-muted">
                            ({subject.subject_code})
                          </span>
                        ) : null}
                      </span>
                      <span className="font-mono text-text-primary">
                        {subject.total_score}
                      </span>
                      <span className="w-10 text-center font-bold text-primary">
                        {subject.grade}
                      </span>
                      <span className="w-full text-caption text-text-muted tablet:w-auto tablet:flex-1 tablet:text-right">
                        {subject.remark || "—"}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </section>
          ))}

        <p className="text-caption text-text-muted">
          These are the results stored when each term was recorded. Archiving a student
          never removes or changes them.
        </p>
      </div>
    </Modal>
  );
}
