"use client";

// FIN-002 — deliberate optional-fee selection & removal (in-app, no browser
// dialogs). Opening the add modal adds NOTHING; the officer must check items
// and explicitly confirm "Add selected".

import { useState } from "react";
import { Modal, Button, Input } from "@/components/ui";
import { money } from "@/components/finance/helpers";

export type OptionalFeeItem = { id: string; name: string; amount: number };

// Mounted only while open (parents render `{open && <AddOptionalFeesModal …/>}`)
// so the selection always starts fresh — no state survives a close.
export function AddOptionalFeesModal({
  fees,
  busy,
  onClose,
  onAdd,
}: {
  fees: OptionalFeeItem[];
  busy: boolean;
  onClose: () => void;
  onAdd: (ids: string[]) => void | Promise<void>;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const ids = Array.from(selected);

  return (
    <Modal isOpen onClose={onClose} title="Add additional fees" size="sm">
      <p className="text-caption text-text-secondary mb-3">
        Optional items are added to <b className="text-text-primary">this student only</b> — other students and the school fee
        setup are never changed.
      </p>
      <div className="space-y-2">
        {fees.map((f) => (
          <label
            key={f.id}
            className="flex items-center justify-between gap-3 rounded-lg bg-clay px-3 py-2.5 cursor-pointer select-none"
          >
            <span className="flex items-center gap-2.5 min-w-0">
              <input
                type="checkbox"
                className="accent-primary h-4 w-4 shrink-0"
                checked={selected.has(f.id)}
                onChange={() => toggle(f.id)}
                disabled={busy}
              />
              <span className="text-caption font-medium text-text-primary truncate">{f.name}</span>
            </span>
            <span className="text-caption text-text-secondary shrink-0">{money(f.amount)}</span>
          </label>
        ))}
        {fees.length === 0 && (
          <p className="text-caption text-text-secondary text-center py-4">
            No optional fees are configured for this class/term yet — set them in Fee Setup first.
          </p>
        )}
      </div>
      <div className="flex justify-end gap-2 mt-4">
        <Button variant="secondary" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button onClick={() => onAdd(ids)} loading={busy} disabled={ids.length === 0}>
          Add selected ({ids.length})
        </Button>
      </div>
    </Modal>
  );
}

// Mounted only while a target exists, so the reason field always starts fresh.
export function RemoveOptionalFeeModal({
  target,
  busy,
  onClose,
  onConfirm,
}: {
  target: { fee_head_id: string; fee_name: string; amount: number };
  busy: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void | Promise<void>;
}) {
  const [reason, setReason] = useState("");

  return (
    <Modal isOpen onClose={onClose} title="Remove optional fee" size="sm">
      <div className="space-y-4">
        <p className="text-caption text-text-secondary">
          <b className="text-text-primary">{target.fee_name}</b> ({money(target.amount)}) will be removed from
          this student&apos;s bill. If it was already paid, the paid amount becomes <b>credit on the student&apos;s account</b> —
          the original payment and receipt never change, and the removal is recorded in the student&apos;s history.
        </p>
        <div>
          <label className="text-caption text-text-secondary block mb-1">Reason (optional)</label>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Parent no longer wants it" />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="danger" onClick={() => onConfirm(reason.trim())} loading={busy}>
            Remove fee
          </Button>
        </div>
      </div>
    </Modal>
  );
}
