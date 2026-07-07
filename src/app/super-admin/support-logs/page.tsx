"use client";

import { useEffect, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import { Card, Badge } from "@/components/ui";

type SupportLog = {
  id: string;
  school_id: string;
  super_admin_id: string;
  action: string;
  token_expires_at: string | null;
  created_at: string;
  schools?: { name: string };
};

export default function SupportLogsPage() {
  const supabase = createClient();
  const [logs, setLogs] = useState<SupportLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadLogs();
  }, []);

  const loadLogs = async () => {
    const { data } = await supabase
      .from("support_logs")
      .select("*, schools!inner(name)")
      .order("created_at", { ascending: false });

    if (data) setLogs(data);
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-h1 font-bold">Support Logs</h1>
        <p className="text-small text-text-muted mt-1">
          Audit trail of all impersonation sessions — every access is logged
          before data is shown
        </p>
      </div>

      <Card variant="bordered" className="shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-small">
            <thead>
              <tr className="bg-bg border-b border-border">
                <th className="text-left px-4 py-3 font-mono text-caption uppercase tracking-wider text-text-muted">
                  School
                </th>
                <th className="text-left px-4 py-3 font-mono text-caption uppercase tracking-wider text-text-muted">
                  Action
                </th>
                <th className="text-left px-4 py-3 font-mono text-caption uppercase tracking-wider text-text-muted">
                  Expires
                </th>
                <th className="text-right px-4 py-3 font-mono text-caption uppercase tracking-wider text-text-muted">
                  Timestamp
                </th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr
                  key={log.id}
                  className="border-b border-border last:border-b-0 hover:bg-bg transition-colors"
                >
                  <td className="px-4 py-3">
                    <p className="font-semibold">
                      {(log as any).schools?.name ||
                        log.school_id.slice(0, 8) + "..."}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-text-secondary">
                    {log.action}
                  </td>
                  <td className="px-4 py-3">
                    {log.token_expires_at ? (
                      <Badge
                        variant={
                          new Date(log.token_expires_at) > new Date()
                            ? "success"
                            : "default"
                        }
                      >
                        {new Date(log.token_expires_at) > new Date()
                          ? "Active"
                          : "Expired"}
                      </Badge>
                    ) : (
                      <Badge variant="default">N/A</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-text-muted font-mono text-caption">
                    {new Date(log.created_at).toLocaleString()}
                  </td>
                </tr>
              ))}

              {logs.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-8 text-center text-text-muted"
                  >
                    No support sessions recorded yet. Impersonation sessions
                    will appear here.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
