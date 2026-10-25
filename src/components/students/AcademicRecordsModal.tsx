"use client";

import { useEffect, useState } from "react";
import { Badge, Button, Modal, toast } from "@/components/ui";
import type { AcademicTermRecord } from "@/lib/students/academic-records";
import { openReportCardPdf } from "./openReportCardPdf";

/**
 * "View Academic Records" for one student.
 *
 * The dialog lists the terms that have FINAL results — the frozen snapshots
 * written when a class report card is approved. Selecting a term does not list
 * subjects here: it renders that term's report card and opens it as a PDF in a
 * new window, using the same `ReportCardUI` the student and review screens use.
 *
 * The caller supplies the authorised endpoint for its role (school admin or
 * class teacher); this component only renders what those endpoints return.
 */

type Props = {
  open: boolean;
  onClose: () => void;
  studentId: string | null;
  studentName?: string | null;
  /** Terms with final results, e.g. /api/.../students/{id}/academic-records */
  endpoint: string | null;
  /** Base for one term's card, e.g. /api/.../students/{id}/report-card */
  reportCardEndpointBase: string | null;
};

type LoadState =
  | { status: "idle" | "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; terms: AcademicTermRecord[] };

export function AcademicRecordsModal({
  open,
  onClose,
  studentId,
  studentName,
  endpoint,
  reportCardEndpointBase,
}: Props) {
  const [state, setState] = useState<LoadState>({ status: "idle" });
  const [retryToken, setRetryToken] = useState(0);
  const [openingTermId, setOpeningTermId] = useState<string | null>(null);

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

  const openTerm = async (term: AcademicTermRecord) => {
    if (!reportCardEndpointBase) return;
    setOpeningTermId(term.term_id);
    try {
      await openReportCardPdf({
        endpoint: `${reportCardEndpointBase}/${term.term_id}`,
      });
    } catch (error) {
      toast.error(
        "Could not open the report card",
        error instanceof Error ? error.message : "Please try again.",
      );
    } finally {
      setOpeningTermId(null);
    }
  };

  const isLoading = state.status === "idle" || state.status === "loading";

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title={studentName ? `${studentName} — Academic Records` : "Academic Records"}
      size="md"
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
              No final results have been approved for this student yet. A term
              appears here once its report card has been prepared and approved.
            </p>
          </div>
        )}

        {state.status === "ready" &&
          state.terms.map((term) => {
            const opening = openingTermId === term.term_id;
            return (
              <button
                key={term.term_id}
                type="button"
                onClick={() => void openTerm(term)}
                disabled={openingTermId !== null}
                className="flex w-full items-center justify-between gap-3 rounded-lg border border-border bg-surface px-3.5 py-3 text-left transition-colors hover:border-primary hover:bg-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-70"
              >
                <div className="min-w-0">
                  <p className="text-small font-semibold text-text-primary">
                    {term.term_name}
                  </p>
                  <p className="text-caption text-text-muted">{term.session_name}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2.5">
                  <Badge variant={term.published ? "success" : "draft"}>
                    {term.published ? "Published" : "Draft"}
                  </Badge>
                  <span className="text-caption font-semibold text-primary">
                    {opening ? "Preparing…" : "Open PDF"}
                  </span>
                </div>
              </button>
            );
          })}

        <p className="text-caption text-text-muted">
          Select a term to open its report card as a PDF in a new window. These
          are the final records stored when the term was approved; archiving a
          student never removes them.
        </p>
      </div>
    </Modal>
  );
}
