"use client";

import { useState } from "react";
import { Button, Card, Modal } from "@/components/ui";

interface CredentialEntry {
  name: string;
  email: string;
  password: string;
}

interface CredentialModalProps {
  isOpen: boolean;
  onClose: () => void;
  credentials: CredentialEntry[];
  /** e.g. "Student" or "Teacher" */
  entityLabel?: string;
  loginUrl?: string;
}

export function CredentialModal({
  isOpen,
  onClose,
  credentials,
  entityLabel = "User",
  loginUrl,
}: CredentialModalProps) {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  if (!isOpen || credentials.length === 0) return null;

  const copyAll = async () => {
    const text = credentials
      .map((c) => `${c.name}\nUsername: ${c.email}\nPassword: ${c.password}`)
      .join("\n\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(-1);
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch {
      // fallback silently
    }
  };

  const copySingle = async (index: number, entry: CredentialEntry) => {
    const text = `${entry.name}\nUsername: ${entry.email}\nPassword: ${entry.password}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch {}
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="sm" title={`${entityLabel} Created Successfully`}>
      <div className="space-y-4">
        <div className="bg-success-bg border border-success rounded-sm px-4 py-3">
          <p className="text-small font-semibold text-success">
            ✓ {credentials.length} {entityLabel.toLowerCase()}{credentials.length > 1 ? "s" : ""} created
          </p>
          <p className="text-caption text-text-secondary mt-1">
            Save these credentials now — they will not be shown again.
          </p>
        </div>

        <div className="space-y-3">
          {credentials.map((cred, i) => (
            <div
              key={i}
              className="bg-surface border border-border rounded-sm p-4 space-y-2"
            >
              <p className="text-small font-semibold text-text-primary">
                👤 {cred.name}
              </p>
              <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-small">
                <span className="text-text-muted">Username:</span>
                <span className="font-mono text-text-primary break-all">{cred.email}</span>
                <span className="text-text-muted">Password:</span>
                <span className="font-mono font-bold text-warning">{cred.password}</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => copySingle(i, cred)}
              >
                {copiedIndex === i ? "✓ Copied" : "📋 Copy"}
              </Button>
            </div>
          ))}
        </div>

        {loginUrl && (
          <p className="text-caption text-text-muted">
            Login at:{" "}
            <a href={loginUrl} className="underline text-primary" target="_blank" rel="noopener">
              {loginUrl}
            </a>
          </p>
        )}

        <div className="flex gap-3 justify-end pt-2 border-t border-border">
          <Button variant="ghost" size="sm" onClick={copyAll}>
            {copiedIndex === -1 ? "✓ All Copied" : "📋 Copy All"}
          </Button>
          <Button variant="primary" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
}
