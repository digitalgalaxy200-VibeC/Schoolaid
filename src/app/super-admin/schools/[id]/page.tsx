"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { Button, Card, Badge } from "@/components/ui";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

type SchoolDetail = {
  id: string;
  name: string;
  slug: string;
  motto: string | null;
  address: string | null;
  phone: string | null;
  email: string;
  website: string | null;
  logo_url: string | null;
  subscription_status: string;
  subscription_plan: string | null;
  subscription_expiry: string | null;
  is_active: boolean;
  created_at: string;
  school_admins?: { id: string; email: string; full_name: string }[];
  support_logs?: { id: string; action: string; created_at: string }[];
};

type SchoolStats = {
  teachers: number;
  students: number;
  classes: number;
  subjects: number;
};

export default function SchoolDetailPage() {
  const router = useRouter();
  const params = useParams();
  const [school, setSchool] = useState<SchoolDetail | null>(null);
  const [stats, setStats] = useState<SchoolStats>({
    teachers: 0,
    students: 0,
    classes: 0,
    subjects: 0,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [impersonating, setImpersonating] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [resetResult, setResetResult] = useState<{
    adminName: string;
    password: string;
    email: string;
  } | null>(null);
  const [bulkResetting, setBulkResetting] = useState(false);
  const [showAddAdmin, setShowAddAdmin] = useState(false);
  const [newAdmin, setNewAdmin] = useState({ first_name: "", last_name: "", email: "" });
  const [addingAdmin, setAddingAdmin] = useState(false);

  const schoolId = params.id as string;

  useEffect(() => {
    loadSchool();
  }, [schoolId]);

  const loadSchool = async () => {
    const res = await fetch(`/api/super-admin/schools/${schoolId}`);
    if (res.ok) {
      const data = await res.json();
      setSchool(data);
    }

    // Load stats
    const statsRes = await fetch(`/api/super-admin/schools/${schoolId}/stats`);
    if (statsRes.ok) {
      const statsData = await statsRes.json();
      setStats(statsData);
    }

    setLoading(false);
  };

  const updateSubscription = async (status: string) => {
    setSaving(true);
    setMessage(null);

    const res = await fetch(`/api/super-admin/schools/${schoolId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subscription_status: status,
        ...(status === "active" ? { is_active: true } : {}),
        ...(status === "suspended" ? { is_active: false } : {}),
      }),
    });

    if (!res.ok) {
      const data = await res.json();
      setMessage({ type: "error", text: data.error || "Failed to update" });
    } else {
      setMessage({ type: "success", text: `Subscription set to ${status}` });
      loadSchool();
    }
    setSaving(false);
  };

  const handleImpersonate = async () => {
    setImpersonating(true);
    setMessage(null);

    try {
      const res = await fetch("/api/super-admin/impersonate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ school_id: school?.id || schoolId }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      // The API sets a school_admin session cookie — redirect to school dashboard
      if (data.redirect) {
        router.push(data.redirect);
      }
    } catch (err: any) {
      setMessage({ type: "error", text: err.message });
      setImpersonating(false);
    }
  };

  const handleArchive = async () => {
    setSaving(true);
    const res = await fetch(`/api/super-admin/schools/${schoolId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        is_archived: true,
        subscription_status: "archived",
      }),
    });
    if (res.ok) {
      setMessage({ type: "success", text: "School archived. Data preserved." });
      router.push("/super-admin/schools");
    } else {
      const data = await res.json();
      setMessage({ type: "error", text: data.error || "Failed" });
    }
    setSaving(false);
  };

  const handleResetPassword = async (adminId: string, adminName: string) => {
    setResettingId(adminId);
    setMessage(null);
    setResetResult(null);

    try {
      const res = await fetch(
        `/api/super-admin/schools/${schoolId}/reset-password`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ admin_id: adminId }),
        },
      );

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Reset failed");

      setResetResult({
        adminName,
        password: data.password,
        email: data.email,
      });
      setMessage({ type: "success", text: "Password reset successfully" });
    } catch (err: any) {
      setMessage({ type: "error", text: err.message });
    } finally {
      setResettingId(null);
    }
  };

  const handleBulkReset = async () => {
    setBulkResetting(true);
    setMessage(null);
    try {
      const res = await fetch("/api/super-admin/bulk-reset-passwords", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ school_id: school?.id || schoolId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setMessage({ type: "success", text: `Reset ${data.teachers} teachers and ${data.students} students. Password: ${data.password_format}` });
    } catch (err: any) {
      setMessage({ type: "error", text: err.message });
    } finally {
      setBulkResetting(false);
    }
  };

  const handleAddAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddingAdmin(true);
    setMessage(null);

    try {
      const res = await fetch(`/api/super-admin/schools/${schoolId}/add-admin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newAdmin),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to add admin");

      setResetResult({
        adminName: data.adminName,
        password: data.password,
        email: data.email,
      });
      setShowAddAdmin(false);
      setNewAdmin({ first_name: "", last_name: "", email: "" });
      setMessage({ type: "success", text: "Administrator added successfully" });
      loadSchool();
    } catch (err: any) {
      setMessage({ type: "error", text: err.message });
    } finally {
      setAddingAdmin(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!school) {
    return (
      <div className="text-center py-20">
        <p className="text-text-muted">School not found</p>
        <Button
          variant="ghost"
          onClick={() => router.push("/super-admin/schools")}
          className="mt-4"
        >
          Back to Schools
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push("/super-admin/schools")}
            >
              ← Back
            </Button>
            <h1 className="text-h1 font-bold">{school.name}</h1>
            <Badge
              variant={
                school.subscription_status === "active"
                  ? "success"
                  : school.subscription_status === "suspended"
                    ? "error"
                    : "default"
              }
            >
              {school.subscription_status}
            </Badge>
          </div>
          <p className="text-small text-text-muted mt-1 ml-16">
            /{school.slug} · Created{" "}
            {new Date(school.created_at).toLocaleDateString()}
          </p>
        </div>
        <div className="flex gap-3">
          {school.school_admins && school.school_admins.length > 0 && (
            <>
              <Button
                variant="warning"
                onClick={() => handleBulkReset()}
                loading={bulkResetting}
              >
                Reset All Passwords
              </Button>
              <Button
                variant="warning"
              onClick={() =>
                handleResetPassword(
                  school.school_admins![0].id,
                  school.school_admins![0].full_name || school.school_admins![0].email,
                )
              }
              loading={resettingId === school.school_admins[0].id}
            >
              Reset Admin Password
            </Button>
            </>
          )}
          <Button
            variant="accent"
            onClick={handleImpersonate}
            loading={impersonating}
          >
            🔑 Access School
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

      {resetResult && (
        <Card variant="bordered" className="bg-warning-bg border-warning shadow-sm">
          <p className="text-small font-bold text-warning mb-2">
            🔑 Password Reset — Save These Credentials
          </p>
          <p className="text-small">
            <strong>Admin:</strong> {resetResult.adminName}
          </p>
          <p className="text-small">
            <strong>Email:</strong> {resetResult.email}
          </p>
          <p className="text-small font-mono text-warning font-bold mt-1">
            Password: {resetResult.password}
          </p>
        </Card>
      )}

      {/* Quick Stats */}
      <div className="grid grid-cols-2 tablet:grid-cols-4 gap-4">
        <Card variant="default" className="shadow-sm text-center">
          <p className="text-caption text-text-muted uppercase font-mono">
            Teachers
          </p>
          <p className="text-display font-extrabold text-primary">
            {stats.teachers}
          </p>
        </Card>
        <Card variant="default" className="shadow-sm text-center">
          <p className="text-caption text-text-muted uppercase font-mono">
            Students
          </p>
          <p className="text-display font-extrabold text-success">
            {stats.students}
          </p>
        </Card>
        <Card variant="default" className="shadow-sm text-center">
          <p className="text-caption text-text-muted uppercase font-mono">
            Classes
          </p>
          <p className="text-display font-extrabold text-accent">
            {stats.classes}
          </p>
        </Card>
        <Card variant="default" className="shadow-sm text-center">
          <p className="text-caption text-text-muted uppercase font-mono">
            Subjects
          </p>
          <p className="text-display font-extrabold text-warning">
            {stats.subjects}
          </p>
        </Card>
      </div>

      {/* School Profile */}
      <Card variant="bordered" className="shadow-sm">
        <h2 className="text-h3 font-bold mb-4">School Profile</h2>
        <div className="grid grid-cols-1 tablet:grid-cols-2 gap-4">
          <div>
            <p className="text-caption text-text-muted uppercase tracking-wider font-mono">
              Name
            </p>
            <p className="text-body">{school.name}</p>
          </div>
          <div>
            <p className="text-caption text-text-muted uppercase tracking-wider font-mono">
              Slug
            </p>
            <p className="text-body font-mono">/{school.slug}</p>
          </div>
          {school.motto && (
            <div>
              <p className="text-caption text-text-muted uppercase tracking-wider font-mono">
                Motto
              </p>
              <p className="text-body italic">{school.motto}</p>
            </div>
          )}
          <div>
            <p className="text-caption text-text-muted uppercase tracking-wider font-mono">
              Email
            </p>
            <p className="text-body">{school.email}</p>
          </div>
          {school.phone && (
            <div>
              <p className="text-caption text-text-muted uppercase tracking-wider font-mono">
                Phone
              </p>
              <p className="text-body">{school.phone}</p>
            </div>
          )}
          {school.website && (
            <div>
              <p className="text-caption text-text-muted uppercase tracking-wider font-mono">
                Website
              </p>
              <p className="text-body">{school.website}</p>
            </div>
          )}
          {school.address && (
            <div className="tablet:col-span-2">
              <p className="text-caption text-text-muted uppercase tracking-wider font-mono">
                Address
              </p>
              <p className="text-body">{school.address}</p>
            </div>
          )}
        </div>
      </Card>

      {/* School Admins */}
      <Card variant="bordered" className="shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-h3 font-bold">School Administrators</h2>
          {(!school.school_admins || school.school_admins.length === 0) && (
            <Button variant="primary" size="sm" onClick={() => setShowAddAdmin(true)}>
              + Add Administrator
            </Button>
          )}
        </div>
        
        {school.school_admins && school.school_admins.length > 0 ? (
          <div className="space-y-3">
            {school.school_admins.map((admin) => (
              <div
                key={admin.id}
                className="flex items-center justify-between py-2 px-3 rounded-sm bg-bg"
              >
                <div>
                  <p className="text-body font-semibold">
                    {admin.full_name || "—"}
                  </p>
                  <p className="text-caption text-text-muted">{admin.email}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="warning"
                    size="sm"
                    loading={resettingId === admin.id}
                    onClick={() =>
                      handleResetPassword(
                        admin.id,
                        admin.full_name || admin.email,
                      )
                    }
                  >
                    Reset Password
                  </Button>
                  <Badge variant="success">Admin</Badge>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-6 bg-bg rounded-lg">
            <p className="text-text-muted">No administrators assigned yet.</p>
          </div>
        )}
      </Card>

      {/* Subscription Management */}
      <Card variant="bordered" className="shadow-sm">
        <h2 className="text-h3 font-bold mb-4">Subscription &amp; Billing</h2>
        <div className="grid grid-cols-1 tablet:grid-cols-3 gap-4 mb-4">
          <div>
            <p className="text-caption text-text-muted uppercase tracking-wider font-mono">
              Plan
            </p>
            <p className="text-body font-semibold">
              {school.subscription_plan || "Free"}
            </p>
          </div>
          <div>
            <p className="text-caption text-text-muted uppercase tracking-wider font-mono">
              Status
            </p>
            <Badge
              variant={
                school.subscription_status === "active"
                  ? "success"
                  : school.subscription_status === "suspended"
                    ? "error"
                    : "default"
              }
            >
              {school.subscription_status}
            </Badge>
          </div>
          {school.subscription_expiry && (
            <div>
              <p className="text-caption text-text-muted uppercase tracking-wider font-mono">
                Expires
              </p>
              <p className="text-body">
                {new Date(school.subscription_expiry).toLocaleDateString()}
              </p>
            </div>
          )}
        </div>

        <div className="flex gap-3 flex-wrap">
          <Button
            variant="primary"
            size="sm"
            onClick={() => updateSubscription("active")}
            loading={saving}
            disabled={school.subscription_status === "active"}
          >
            Activate
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => updateSubscription("inactive")}
            loading={saving}
            disabled={school.subscription_status === "inactive"}
          >
            Pause
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={() => updateSubscription("suspended")}
            loading={saving}
            disabled={school.subscription_status === "suspended"}
          >
            Suspend
          </Button>
        </div>
      </Card>

      {/* Support Logs */}
      {school.support_logs && school.support_logs.length > 0 && (
        <Card variant="bordered" className="shadow-sm">
          <h2 className="text-h3 font-bold mb-4">Support Activity Log</h2>
          <div className="space-y-2">
            {school.support_logs.slice(0, 10).map((log) => (
              <div
                key={log.id}
                className="flex items-center justify-between py-2 px-3 rounded-sm bg-bg"
              >
                <p className="text-small">{log.action}</p>
                <p className="text-caption text-text-muted">
                  {new Date(log.created_at).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Archive */}
      <Card variant="bordered" className="border-warning">
        <h2 className="text-h3 font-bold text-warning mb-2">Archive School</h2>
        <p className="text-small text-text-secondary mb-4">
          Archiving hides this school from the active list. Data is preserved
          and can be restored.
        </p>
        <Button
          variant="danger"
          size="sm"
          onClick={() => setShowArchiveConfirm(true)}
        >
          Archive School
        </Button>
      </Card>

      <ConfirmDialog
        open={showArchiveConfirm}
        title="Archive School"
        message={`Archive ${school?.name}? Data is preserved and can be restored.`}
        confirmLabel="Archive"
        variant="warning"
        loading={saving}
        onConfirm={handleArchive}
        onCancel={() => setShowArchiveConfirm(false)}
      />

      {/* Credentials Modal */}
      {resetResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-5">
            {/* Header */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-success-bg flex items-center justify-center">
                <svg className="w-5 h-5 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <h3 className="text-h3 font-bold">Password Reset Successful</h3>
                <p className="text-caption text-text-muted">
                  Share these credentials with {resetResult.adminName}
                </p>
              </div>
            </div>

            {/* Email */}
            <div className="bg-bg rounded-lg p-4 space-y-2">
              <p className="text-caption font-semibold text-text-secondary uppercase tracking-wider">Email</p>
              <div className="flex items-center justify-between gap-2">
                <p className="text-body font-mono text-sm break-all">{resetResult.email}</p>
                <button
                  onClick={() => { navigator.clipboard.writeText(resetResult.email); }}
                  className="shrink-0 px-3 py-1.5 text-caption font-medium text-accent hover:text-accent-hover border border-accent/30 rounded-md hover:bg-accent/5 transition-colors"
                >
                  Copy
                </button>
              </div>
            </div>

            {/* Password */}
            <div className="bg-warning-bg/10 border border-warning/20 rounded-lg p-4 space-y-2">
              <p className="text-caption font-semibold text-text-secondary uppercase tracking-wider">Temporary Password</p>
              <div className="flex items-center justify-between gap-2">
                <p className="text-body font-mono text-sm font-bold text-warning break-all">{resetResult.password}</p>
                <button
                  onClick={() => { navigator.clipboard.writeText(resetResult.password); }}
                  className="shrink-0 px-3 py-1.5 text-caption font-medium text-accent hover:text-accent-hover border border-accent/30 rounded-md hover:bg-accent/5 transition-colors"
                >
                  Copy
                </button>
              </div>
            </div>

            {/* Warning */}
            <div className="bg-warning-bg/10 border border-warning/20 rounded-lg p-3">
              <p className="text-small text-warning font-medium flex items-center gap-2">
                <span>⚠️</span>
                <span>This password will be shown only once. The admin will be required to change it on first login.</span>
              </p>
            </div>

            {/* Close */}
            <button
              onClick={() => setResetResult(null)}
              className="w-full py-2.5 text-body font-semibold text-white bg-accent hover:bg-accent-hover rounded-lg transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Add Admin Modal */}
      {showAddAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-h3 font-bold">Add Administrator</h3>
              <button onClick={() => setShowAddAdmin(false)} className="text-text-muted hover:text-text">
                ✕
              </button>
            </div>
            
            <form onSubmit={handleAddAdmin} className="space-y-4">
              <div>
                <label className="block text-small font-medium text-text-secondary mb-1">First Name</label>
                <input
                  type="text"
                  required
                  value={newAdmin.first_name}
                  onChange={(e) => setNewAdmin({ ...newAdmin, first_name: e.target.value })}
                  className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="block text-small font-medium text-text-secondary mb-1">Last Name</label>
                <input
                  type="text"
                  required
                  value={newAdmin.last_name}
                  onChange={(e) => setNewAdmin({ ...newAdmin, last_name: e.target.value })}
                  className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="block text-small font-medium text-text-secondary mb-1">Email</label>
                <input
                  type="email"
                  required
                  value={newAdmin.email}
                  onChange={(e) => setNewAdmin({ ...newAdmin, email: e.target.value })}
                  className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:border-primary"
                />
              </div>
              
              <div className="flex justify-end gap-3 pt-2">
                <Button variant="ghost" onClick={() => setShowAddAdmin(false)} type="button">
                  Cancel
                </Button>
                <Button variant="primary" type="submit" loading={addingAdmin}>
                  Add Administrator
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
