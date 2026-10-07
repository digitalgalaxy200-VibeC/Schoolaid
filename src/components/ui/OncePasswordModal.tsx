"use client";

import { Button, Modal } from "@/components/ui";

interface OncePasswordModalProps {
  open: boolean;
  onClose: () => void;
  /** Display name of the account the password belongs to. */
  name: string;
  /** Login name (email) shown beside the password. */
  username: string;
  password: string;
}

/**
 * A freshly generated temporary password, shown exactly once.
 *
 * The wording is deliberate: it says what happened, what to do with the
 * password, and that closing the window wipes it from the screen — because the
 * stored copy is cleared on first sign-in and cannot be displayed again here.
 * Used by every reset flow (school admin students, school admin teachers, class
 * teacher students) so the promise is the same wherever a password is issued.
 */
export function OncePasswordModal({ open, onClose, name, username, password }: OncePasswordModalProps) {
  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title="New temporary password"
      size="md"
      footer={
        <div className="flex justify-end">
          <Button variant="primary" onClick={onClose}>
            Done — I have saved it
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <p className="text-body">
          The password for <span className="font-medium">{name || "this account"}</span> has been
          reset. Give it to them now — this is the only time it will be shown.
        </p>

        <div className="rounded-lg border border-border bg-clay px-4 py-3 space-y-1">
          <p className="text-caption text-text-secondary">
            Username: <span className="font-mono text-text-primary">{username || "—"}</span>
          </p>
          <p className="text-caption text-text-secondary">New password</p>
          <p className="font-mono text-h2 font-bold tracking-wide text-text-primary select-all">
            {password}
          </p>
        </div>

        <div className="rounded-lg border border-warning bg-warning-bg px-4 py-3 space-y-1">
          <p className="text-small font-bold text-warning">
            Shown once — wiped when you close this window
          </p>
          <p className="text-small text-text-primary">
            Copy it or write it down before closing. Once this window is closed, the password is
            wiped from the screen and cannot be shown here again.
          </p>
          <p className="text-small text-text-primary">
            The old password stops working immediately. They will be asked to choose their own
            password the next time they sign in.
          </p>
        </div>
      </div>
    </Modal>
  );
}
