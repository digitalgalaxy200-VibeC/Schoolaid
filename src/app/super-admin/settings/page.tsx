"use client";

import { useEffect, useState } from "react";
import { Card, Button } from "@/components/ui";

export default function SuperAdminSettingsPage() {
  const [user, setUser] = useState<{ email?: string; full_name?: string; role?: string }>({});
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setUser(d); })
      .catch(() => {});
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-h2 font-bold">Settings</h1>
        <p className="text-small text-text-muted mt-1">Platform configuration and account settings</p>
      </div>

      {msg && (
        <div className={`px-4 py-3 rounded-sm ${msg.type === "success" ? "bg-success-bg border border-success" : "bg-error-bg border border-error"}`}>
          <p className="text-small font-medium">{msg.text}</p>
        </div>
      )}

      <Card variant="bordered" className="shadow-sm">
        <h2 className="text-h3 font-bold mb-4">Admin Account</h2>
        <div className="grid grid-cols-1 tablet:grid-cols-2 gap-4">
          <div>
            <p className="text-caption text-text-muted uppercase tracking-wider font-mono">Name</p>
            <p className="text-body font-semibold">{user.full_name || "—"}</p>
          </div>
          <div>
            <p className="text-caption text-text-muted uppercase tracking-wider font-mono">Email</p>
            <p className="text-body font-mono">{user.email || "—"}</p>
          </div>
          <div>
            <p className="text-caption text-text-muted uppercase tracking-wider font-mono">Role</p>
            <p className="text-body">{user.role || "—"}</p>
          </div>
        </div>
      </Card>

      <Card variant="bordered" className="shadow-sm">
        <h2 className="text-h3 font-bold mb-4">Platform Information</h2>
        <div className="grid grid-cols-1 tablet:grid-cols-2 gap-4">
          <div>
            <p className="text-caption text-text-muted uppercase tracking-wider font-mono">Platform</p>
            <p className="text-body">SchoolAid v2.0</p>
          </div>
          <div>
            <p className="text-caption text-text-muted uppercase tracking-wider font-mono">Environment</p>
            <p className="text-body">Staging</p>
          </div>
        </div>
      </Card>
    </div>
  );
}
