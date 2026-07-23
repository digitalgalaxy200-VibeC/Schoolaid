"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Badge, Button } from "@/components/ui";

type School = {
  id: string;
  name: string;
  slug: string;
  email: string;
  phone: string | null;
  subscription_status: string;
  is_archived: boolean;
  created_at: string;
};

export default function SchoolsPage() {
  const router = useRouter();
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"active" | "archived">("active");
  const [provisioning, setProvisioning] = useState(false);
  const [provisionResult, setProvisionResult] = useState<{schoolName: string; email: string; password: string}[] | null>(null);
  const [message, setMessage] = useState<{type: "success" | "error"; text: string} | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/super-admin/schools?archived=${tab === "archived"}`)
      .then((r) => r.json())
      .then((data) => {
        setSchools(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [tab]);

  const handleRestore = async (schoolId: string) => {
    await fetch(`/api/super-admin/schools/${schoolId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        is_archived: false,
        subscription_status: "inactive",
      }),
    });
    setSchools((prev) => prev.filter((s) => s.id !== schoolId));
  };

  const handleBulkProvision = async () => {
    setProvisioning(true);
    setMessage(null);
    try {
      const res = await fetch("/api/super-admin/bulk-provision-admins", {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to provision admins");

      if (data.provisionedCount > 0) {
        setProvisionResult(data.provisioned);
        setMessage({ type: "success", text: `Successfully provisioned ${data.provisionedCount} admin(s)` });
      } else {
        setMessage({ type: "success", text: "All active schools already have an admin." });
      }
    } catch (err: any) {
      setMessage({ type: "error", text: err.message });
    } finally {
      setProvisioning(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-h1 font-bold">Schools</h1>
          <p className="text-small text-text-muted mt-1">Manage all schools</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="secondary" onClick={handleBulkProvision} loading={provisioning}>
            Provision Missing Admins
          </Button>
          <Button onClick={() => router.push("/super-admin/schools/new")}>
            Create School
          </Button>
        </div>
      </div>

      {message && (
        <Card
          variant="bordered"
          className={`px-4 py-3 ${message.type === "success" ? "bg-success-bg border-success" : "bg-error-bg border-error"}`}
        >
          <p
            className={`text-small ${message.type === "success" ? "text-success" : "text-error"}`}
          >
            {message.text}
          </p>
        </Card>
      )}

      <div className="flex gap-2">
        <button
          onClick={() => setTab("active")}
          className={`px-4 py-2 rounded-sm text-small font-semibold ${tab === "active" ? "bg-primary text-text-inverse" : "bg-surface text-text-secondary border border-border"}`}
        >
          Active
        </button>
        <button
          onClick={() => setTab("archived")}
          className={`px-4 py-2 rounded-sm text-small font-semibold ${tab === "archived" ? "bg-warning text-text-inverse" : "bg-surface text-text-secondary border border-border"}`}
        >
          Archived
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      ) : (
        <Card variant="bordered" className="shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-small">
              <thead>
                <tr className="bg-bg border-b border-border">
                  <th className="text-left px-4 py-3 font-mono text-caption uppercase text-text-muted">
                    School
                  </th>
                  <th className="text-left px-4 py-3 font-mono text-caption uppercase text-text-muted">
                    Email
                  </th>
                  <th className="text-left px-4 py-3 font-mono text-caption uppercase text-text-muted">
                    Status
                  </th>
                  <th className="text-right px-4 py-3 font-mono text-caption uppercase text-text-muted">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {schools.map((s) => (
                  <tr
                    key={s.id}
                    onClick={() => router.push(`/super-admin/schools/${s.slug}`)}
                    className="border-b border-border hover:bg-bg cursor-pointer"
                  >
                    <td className="px-4 py-3">
                      <p className="font-semibold">{s.name}</p>
                      <p className="text-caption text-text-muted">/{s.slug}</p>
                    </td>
                    <td className="px-4 py-3 text-text-secondary">{s.email}</td>
                    <td className="px-4 py-3">
                      <Badge
                        variant={
                          s.subscription_status === "active"
                            ? "success"
                            : s.subscription_status === "suspended"
                              ? "error"
                              : s.subscription_status === "archived"
                                ? "warning"
                                : "default"
                        }
                      >
                        {s.subscription_status}
                      </Badge>
                    </td>
                    <td
                      className="px-4 py-3 text-right"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {tab === "archived" ? (
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => handleRestore(s.id)}
                        >
                          Restore
                        </Button>
                      ) : (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => router.push(`/super-admin/schools/${s.slug}`)}
                        >
                          Manage
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
                {schools.length === 0 && (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-4 py-8 text-center text-text-muted"
                    >
                      No schools
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Credentials Modal */}
      {provisionResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full p-6 space-y-5 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between shrink-0">
              <h3 className="text-h3 font-bold">Newly Provisioned Admins</h3>
              <button onClick={() => setProvisionResult(null)} className="text-text-muted hover:text-text">
                ✕
              </button>
            </div>
            
            <p className="text-small text-warning font-medium shrink-0">
              ⚠️ Save these credentials. These admins will be forced to change their password on first login.
            </p>

            <div className="space-y-4 overflow-y-auto">
              {provisionResult.map((admin, idx) => (
                <div key={idx} className="bg-bg rounded-lg border border-border p-4">
                  <h4 className="font-bold mb-2">{admin.schoolName}</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-caption text-text-muted">Email</p>
                      <div className="flex items-center justify-between bg-white p-1.5 rounded border">
                        <p className="text-small font-mono break-all">{admin.email}</p>
                        <button onClick={() => navigator.clipboard.writeText(admin.email)} className="text-xs text-accent hover:underline">Copy</button>
                      </div>
                    </div>
                    <div>
                      <p className="text-caption text-text-muted">Password</p>
                      <div className="flex items-center justify-between bg-white p-1.5 rounded border">
                        <p className="text-small font-mono text-warning font-bold break-all">{admin.password}</p>
                        <button onClick={() => navigator.clipboard.writeText(admin.password)} className="text-xs text-accent hover:underline">Copy</button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="shrink-0 pt-2 border-t border-border mt-auto">
              <Button className="w-full" variant="primary" onClick={() => setProvisionResult(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
