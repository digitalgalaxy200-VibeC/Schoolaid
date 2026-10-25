"use client";

import { type ReactNode } from "react";
import { Badge, Button, Modal } from "@/components/ui";

/**
 * Read-only student dialogs used by the row Actions menu.
 *
 * They take the row that is ALREADY on screen — the students API returns the
 * whole student record plus its profile and class — so opening "View Details"
 * or "View Account Status" costs no extra request and cannot show a different
 * student than the row it was opened from.
 *
 * The same component is used by the School Administration and Class Teacher
 * tables; each page simply passes its own row shape.
 */

export type StudentRecordView = {
  id?: string;
  student_id?: string | null;
  class_id?: string | null;
  date_of_birth?: string | null;
  gender?: string | null;
  parent_phone?: string | null;
  nationality?: string | null;
  religion?: string | null;
  blood_group?: string | null;
  parent_occupation?: string | null;
  parent_location?: string | null;
  emergency_contact?: string | null;
  allergies?: string | null;
  health_notes?: string | null;
  status?: string | null;
  enrollment_date?: string | null;
  created_at?: string | null;
  must_change_password?: boolean | null;
  profiles?: {
    full_name?: string | null;
    email?: string | null;
    phone?: string | null;
    recovery_email?: string | null;
    avatar_url?: string | null;
    is_active?: boolean | null;
  } | null;
  classes?: { name?: string | null } | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  student: StudentRecordView | null;
  className?: string | null;
};

function text(value: unknown): string {
  if (value === null || value === undefined) return "—";
  const trimmed = String(value).trim();
  return trimmed === "" ? "—" : trimmed;
}

function date(value: unknown): string {
  if (!value) return "—";
  return String(value).slice(0, 10);
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-caption text-text-muted">{label}</dt>
      <dd className="text-small text-text-primary break-words">{value}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-surface p-3.5">
      <h3 className="mb-2.5 text-caption font-bold uppercase tracking-wide text-text-muted">
        {title}
      </h3>
      <dl className="grid grid-cols-1 tablet:grid-cols-2 gap-x-4 gap-y-2.5">{children}</dl>
    </section>
  );
}

function AccountBadge({ isActive }: { isActive: boolean | null | undefined }) {
  if (isActive === false) return <Badge variant="warning">Archived</Badge>;
  if (isActive === true) return <Badge variant="success">Active</Badge>;
  return <Badge variant="default">Unknown</Badge>;
}

export function StudentDetailsModal({ open, onClose, student, className }: Props) {
  if (!student) return null;

  const profile = student.profiles ?? null;
  const classLabel = className || student.classes?.name || "Not assigned";

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title="Student Details"
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
        <div className="flex items-center gap-3 rounded-lg border border-border bg-clay p-3.5">
          {profile?.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profile.avatar_url}
              alt=""
              className="h-14 w-14 shrink-0 rounded-full border border-border object-cover"
              onError={(event) => {
                (event.target as HTMLImageElement).style.display = "none";
              }}
            />
          ) : (
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary/10 text-lg font-bold text-primary">
              {(profile?.full_name || "?").charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-h3 font-bold break-words">{text(profile?.full_name)}</p>
              <AccountBadge isActive={profile?.is_active} />
            </div>
            <p className="text-caption text-text-muted font-mono break-all">
              {text(profile?.email)}
            </p>
            <p className="text-caption text-text-secondary">
              {classLabel}
              {student.student_id ? ` · ${student.student_id}` : ""}
            </p>
          </div>
        </div>

        <Section title="Personal Information">
          <Field label="Admission number" value={text(student.student_id)} />
          <Field label="Class" value={classLabel} />
          <Field label="Date of birth" value={date(student.date_of_birth)} />
          <Field label="Gender" value={text(student.gender)} />
          <Field label="Nationality" value={text(student.nationality)} />
          <Field label="Religion" value={text(student.religion)} />
          <Field label="Blood group" value={text(student.blood_group)} />
          <Field label="Enrollment date" value={date(student.enrollment_date)} />
        </Section>

        <Section title="Parent / Guardian">
          <Field label="WhatsApp number" value={text(student.parent_phone)} />
          <Field label="Occupation" value={text(student.parent_occupation)} />
          <Field label="Location" value={text(student.parent_location)} />
          <Field label="Emergency contact" value={text(student.emergency_contact)} />
          <Field label="Recovery email" value={text(profile?.recovery_email)} />
          <Field label="Profile phone" value={text(profile?.phone)} />
        </Section>

        <Section title="Health Notes">
          <Field label="Allergies" value={text(student.allergies)} />
          <Field label="Other health notes" value={text(student.health_notes)} />
        </Section>
      </div>
    </Modal>
  );
}

export function StudentAccountStatusModal({ open, onClose, student, className }: Props) {
  if (!student) return null;

  const profile = student.profiles ?? null;
  const isActive = profile?.is_active ?? null;

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title="Account Status"
      size="sm"
      footer={
        <div className="flex justify-end">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-clay p-3.5">
          <div className="min-w-0">
            <p className="text-small font-semibold break-words">{text(profile?.full_name)}</p>
            <p className="text-caption text-text-muted font-mono break-all">
              {text(profile?.email)}
            </p>
          </div>
          <AccountBadge isActive={isActive} />
        </div>

        <dl className="grid grid-cols-1 gap-2.5">
          <Field
            label="Account state"
            value={
              isActive === false
                ? "Archived — the student cannot be selected in active class lists. Historical records remain available."
                : isActive === true
                  ? "Active — the student appears in class lists and can sign in."
                  : "Not reported by this view."
            }
          />
          <Field label="Role" value="Student" />
          <Field label="Admission number" value={text(student.student_id)} />
          <Field label="Class" value={className || student.classes?.name || "Not assigned"} />
          <Field
            label="Password"
            value={
              student.must_change_password
                ? "Temporary password still pending — the student must change it at next sign-in."
                : "No temporary password pending."
            }
          />
        </dl>

        {isActive === false && (
          <p className="text-caption text-text-secondary">
            Restore the student to make the account active again. Restoring keeps the
            same student identifier and all academic and payment history.
          </p>
        )}
      </div>
    </Modal>
  );
}
