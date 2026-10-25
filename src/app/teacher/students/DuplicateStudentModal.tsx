"use client";

import { Badge, Button, Modal } from "@/components/ui";
import type { DuplicateMatch } from "@/lib/students/duplicates";

/**
 * The "this child may already exist" dialog.
 *
 * A name on its own is never treated as proof — the list shows the identifiers
 * the match was based on (class, date of birth, parent phone) so the teacher can
 * decide. Restoring keeps the original student id and every historical record;
 * registering anyway creates a second, genuinely different student.
 */

type Props = {
  open: boolean;
  matches: DuplicateMatch[];
  destinationClass?: string;
  onCancel: () => void;
  onRegisterAnyway: () => void;
  onRestore: (match: DuplicateMatch) => void;
  saving: boolean;
  restoringId: string | null;
};

function signalLabel(match: DuplicateMatch): string {
  if (match.confidence === "high") return "Strong match";
  if (match.confidence === "medium") return "Possible match";
  return "Same name only";
}

const SIGNAL_LABELS: Record<string, string> = {
  same_name: "same name",
  same_class: "same class",
  same_dob: "same date of birth",
  same_phone: "same parent number",
  same_admission_number: "same admission number",
};

export function DuplicateStudentModal({
  open,
  matches,
  destinationClass,
  onCancel,
  onRegisterAnyway,
  onRestore,
  saving,
  restoringId,
}: Props) {
  return (
    <Modal
      isOpen={open}
      onClose={onCancel}
      title="A student with these details already exists"
      size="lg"
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
          <Button variant="secondary" onClick={onRegisterAnyway} loading={saving}>
            Register as a new student
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="rounded-lg border border-warning bg-warning-bg px-4 py-3">
          <p className="text-body text-text-primary">
            This student may have been archived previously. You can restore the
            existing record instead of creating another one — their results,
            report cards, attendance and payment history stay attached.
          </p>
        </div>

        <div className="space-y-3">
          {matches.map((match) => (
            <div key={match.id} className="rounded-lg border border-border bg-surface p-4 space-y-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-small font-semibold text-text-primary break-words">
                    {match.full_name}
                  </p>
                  <p className="text-caption text-text-muted font-mono">
                    {match.student_id ? `Admission: ${match.student_id}` : "No admission number"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant={match.archived ? "warning" : "success"}>
                    {match.archived ? "Archived" : "Active"}
                  </Badge>
                  <Badge variant={match.confidence === "high" ? "error" : "info"}>
                    {signalLabel(match)}
                  </Badge>
                </div>
              </div>

              <div className="grid grid-cols-1 tablet:grid-cols-2 gap-x-4 gap-y-1 text-caption text-text-secondary">
                <p>
                  Class:{" "}
                  <span className="text-text-primary">
                    {match.class_name || "Not assigned"}
                  </span>
                </p>
                <p>
                  Date of birth:{" "}
                  <span className="text-text-primary">
                    {match.date_of_birth ? String(match.date_of_birth).slice(0, 10) : "—"}
                  </span>
                </p>
                <p>
                  Gender: <span className="text-text-primary">{match.gender || "—"}</span>
                </p>
                <p>
                  Parent number:{" "}
                  <span className="text-text-primary">{match.parent_phone || "—"}</span>
                </p>
                <p className="break-all tablet:col-span-2">
                  Username: <span className="text-text-primary font-mono">{match.email || "—"}</span>
                </p>
              </div>

              <p className="text-caption text-text-muted">
                Matched on {match.signals.map((s) => SIGNAL_LABELS[s] || s).join(", ")}.
              </p>

              {match.archived && match.can_restore && (
                <Button
                  size="sm"
                  variant="primary"
                  loading={restoringId === match.id}
                  onClick={() => onRestore(match)}
                >
                  Restore this student
                </Button>
              )}

              {match.archived && !match.can_restore && (
                <p className="text-caption text-text-secondary">
                  This record belongs to another class. Ask the school admin to
                  restore it, or register this child as a new student if they are
                  a different person.
                </p>
              )}
            </div>
          ))}
        </div>

        <p className="text-caption text-text-secondary">
          Restoring puts the student back into{" "}
          <span className="text-text-primary font-medium">{destinationClass || "this class"}</span>.
          Choose &ldquo;Register as a new student&rdquo; only when these are genuinely
          different children who happen to share a name.
        </p>
      </div>
    </Modal>
  );
}
