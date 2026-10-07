"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { Button, Card, Badge } from "@/components/ui";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { formatDate, formatDateTime } from "@/lib/dates";

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

/**
 * One feature switch. Extracted so the Platform Features card and the Website
 * Sections card cannot drift apart visually, and so adding a platform feature is
 * one row of data rather than a copied block of markup.
 */
function FeatureSwitch({
  label,
  description,
  enabled,
  toggling,
  onToggle,
}: {
  label: string;
  description: string;
  enabled: boolean;
  toggling: boolean;
  onToggle: (next: boolean) => void;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-lg border p-3.5 transition-colors ${
        enabled ? "border-success/30 bg-success-bg/20" : "border-border bg-bg"
      }`}
    >
      <div className="min-w-0">
        <p className="text-small font-semibold truncate">{label}</p>
        <p className="text-caption text-text-muted truncate">{description}</p>
      </div>
      <button
        type="button"
        disabled={toggling}
        onClick={() => onToggle(!enabled)}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-50 ${
          enabled ? "bg-success" : "bg-gray-300"
        }`}
        role="switch"
        aria-checked={enabled}
        aria-label={`Toggle ${label}`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
            enabled ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </button>
    </div>
  );
}

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
  const [confirmResetAdmin, setConfirmResetAdmin] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [resetResult, setResetResult] = useState<{
    adminName: string;
    password: string;
    email: string;
  } | null>(null);
  const [showAddAdmin, setShowAddAdmin] = useState(false);
  const [newAdmin, setNewAdmin] = useState({ first_name: "", last_name: "", email: "" });
  const [addingAdmin, setAddingAdmin] = useState(false);
  const [features, setFeatures] = useState<Record<string, boolean>>({});
  const [featureTogglingKey, setFeatureTogglingKey] = useState<string | null>(null);
  const [customDomain, setCustomDomain] = useState("");
  const [savingDomain, setSavingDomain] = useState(false);
  const [expandedSection, setExpandedSection] = useState<string | null>("profile");

  const toggleSection = (key: string) =>
    setExpandedSection((prev) => (prev === key ? null : key));

  const schoolId = params.id as string;

  useEffect(() => {
    loadSchool();
  }, [schoolId]);

  const loadSchool = async () => {
    const res = await fetch(`/api/super-admin/schools/${schoolId}`);
    if (res.ok) {
      const data = await res.json();
      setSchool(data);
      setCustomDomain(data.custom_domain ?? "");
    }

    // Load stats
    const statsRes = await fetch(`/api/super-admin/schools/${schoolId}/stats`);
    if (statsRes.ok) {
      const statsData = await statsRes.json();
      setStats(statsData);
    }

    // Load website feature toggles
    const featuresRes = await fetch(`/api/super-admin/features?school_id=${schoolId}`);
    if (featuresRes.ok) {
      const featuresData: { feature_key: string; is_enabled: boolean }[] = await featuresRes.json();
      const map: Record<string, boolean> = {};
      featuresData.forEach((f) => { map[f.feature_key] = f.is_enabled; });
      setFeatures(map);
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

  const handleFeatureToggle = async (featureKey: string, label: string, enabled: boolean) => {
    setFeatureTogglingKey(featureKey);
    try {
      const res = await fetch("/api/super-admin/features", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ school_id: schoolId, feature_key: featureKey, is_enabled: enabled }),
      });
      if (res.ok) {
        setFeatures((prev) => ({ ...prev, [featureKey]: enabled }));
        setMessage({ type: "success", text: `${label} ${enabled ? "enabled" : "disabled"}` });
      } else {
        const d = await res.json();
        setMessage({ type: "error", text: d.error || "Failed to update feature" });
      }
    } catch {
      setMessage({ type: "error", text: "Failed to update feature" });
    } finally {
      setFeatureTogglingKey(null);
    }
  };

  const saveDomain = async () => {
    setSavingDomain(true);
    try {
      const res = await fetch(`/api/super-admin/schools/${schoolId}/domain`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ custom_domain: customDomain || null }),
      });
      const d = await res.json();
      if (res.ok) {
        setMessage({ type: "success", text: customDomain ? `Domain set to ${customDomain}` : "Domain cleared." });
      } else {
        setMessage({ type: "error", text: d.error || "Failed to update domain." });
      }
    } catch {
      setMessage({ type: "error", text: "Network error — could not save domain." });
    } finally {
      setSavingDomain(false);
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
      <div className="flex flex-wrap gap-3 items-start justify-between">
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
            {formatDate(school.created_at)}
          </p>
        </div>
        <div className="flex gap-3">
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
          variant="default"
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
        <Card variant="default" className="bg-warning-bg border-warning shadow-sm">
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
      <Card variant="default" className="shadow-sm overflow-hidden">
        <div
          className="flex items-center justify-between cursor-pointer"
          onClick={() => toggleSection("profile")}
        >
          <h2 className="text-h3 font-bold flex items-center gap-2">
            <svg className={`w-4 h-4 transition-transform ${expandedSection === "profile" ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            School Profile
          </h2>
          <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
            {school.logo_url && (
              <img src={school.logo_url} alt={school.name} className="w-10 h-10 rounded-lg object-cover border border-border" />
            )}
            <label className="cursor-pointer">
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const formData = new FormData();
                  formData.append("file", file);
                  const res = await fetch(`/api/super-admin/schools/${schoolId}/logo`, { method: "POST", body: formData });
                  if (res.ok) {
                    setMessage({ type: "success", text: "Logo uploaded successfully" });
                    loadSchool();
                  } else {
                    const d = await res.json();
                    setMessage({ type: "error", text: d.error || "Upload failed" });
                  }
                }}
              />
              <span className="text-caption font-medium text-accent hover:underline">
                {school.logo_url ? "Change Logo" : "+ Upload Logo"}
              </span>
            </label>
          </div>
        </div>
        {expandedSection === "profile" && (
          <div className="grid grid-cols-1 tablet:grid-cols-2 gap-4 mt-4 animate-in fade-in slide-in-from-top-2">
            <div>
              <p className="text-caption text-text-muted uppercase tracking-wider font-mono">Name</p>
              <p className="text-body">{school.name}</p>
            </div>
            <div>
              <p className="text-caption text-text-muted uppercase tracking-wider font-mono">Slug</p>
              <p className="text-body font-mono">/{school.slug}</p>
            </div>
            {school.motto && (
              <div>
                <p className="text-caption text-text-muted uppercase tracking-wider font-mono">Motto</p>
                <p className="text-body italic">{school.motto}</p>
              </div>
            )}
            <div>
              <p className="text-caption text-text-muted uppercase tracking-wider font-mono">Email</p>
              <p className="text-body">{school.email}</p>
            </div>
            {school.phone && (
              <div>
                <p className="text-caption text-text-muted uppercase tracking-wider font-mono">Phone</p>
                <p className="text-body">{school.phone}</p>
              </div>
            )}
            {school.website && (
              <div>
                <p className="text-caption text-text-muted uppercase tracking-wider font-mono">Website</p>
                <p className="text-body">{school.website}</p>
              </div>
            )}
            {school.address && (
              <div className="tablet:col-span-2">
                <p className="text-caption text-text-muted uppercase tracking-wider font-mono">Address</p>
                <p className="text-body">{school.address}</p>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* School Admins */}
      <Card variant="default" className="shadow-sm">
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
                      setConfirmResetAdmin({
                        id: admin.id,
                        name: admin.full_name || admin.email,
                      })
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
      <Card variant="default" className="shadow-sm">
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
                {formatDate(school.subscription_expiry)}
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
        <Card variant="default" className="shadow-sm">
          <h2 className="text-h3 font-bold mb-4">Support Activity Log</h2>
          <div className="space-y-2">
            {school.support_logs.slice(0, 10).map((log) => (
              <div
                key={log.id}
                className="flex items-center justify-between py-2 px-3 rounded-sm bg-bg"
              >
                <p className="text-small">{log.action}</p>
                <p className="text-caption text-text-muted">
                  {formatDateTime(log.created_at)}
                </p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Platform Features — what this school can use at all. */}
      <Card variant="default" className="shadow-sm">
        <div className="mb-5">
          <h2 className="text-h3 font-bold">Platform Features</h2>
          <p className="text-small text-text-muted mt-1">
            Modules this school can use. CBT is OFF until you switch it on here — enabling it shows
            the CBT menus on the teacher and student portals and opens its screens to this school
            only.
          </p>
        </div>
        <div className="grid grid-cols-1 tablet:grid-cols-2 gap-3">
          <FeatureSwitch
            label="🎯 CBT — Computer-Based Testing"
            description="Question bank, CBT assessments, marking and report-card scores. Off = no CBT anywhere for this school."
            enabled={features["cbt"] === true} // default OFF: nobody gets CBT by accident
            toggling={featureTogglingKey === "cbt"}
            onToggle={(next) => handleFeatureToggle("cbt", "CBT", next)}
          />
        </div>
      </Card>

      {/* Custom Domain Management — Super Admin only */}
      <Card variant="default" className="shadow-sm overflow-hidden">
        <div
          className="flex items-center justify-between cursor-pointer"
          onClick={() => toggleSection("domain")}
        >
          <h2 className="text-h3 font-bold flex items-center gap-2">
            <svg className={`w-4 h-4 transition-transform ${expandedSection === "domain" ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            Custom Domain
          </h2>
          {customDomain && (
            <span className="rounded-full bg-success-bg px-2.5 py-0.5 text-caption font-bold text-success uppercase">Active</span>
          )}
        </div>
        {expandedSection === "domain" && (
          <div className="mt-4 space-y-4 animate-in fade-in slide-in-from-top-2">
            <p className="text-small text-text-muted">
              Set a custom domain for this school&apos;s website (e.g. <code>greensprings.edu.ng</code>). Only you can configure this. The school admin cannot see or edit this.
            </p>
            <div>
              <label className="text-small font-medium text-text-primary" htmlFor="super-custom-domain">
                Domain Name
              </label>
              <div className="mt-1 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <input
                  id="super-custom-domain"
                  type="text"
                  value={customDomain}
                  placeholder="e.g. schoolname.edu.ng"
                  onChange={(e) => setCustomDomain(e.target.value)}
                  className="block w-full rounded-lg border border-border px-3 h-[44px] text-small font-mono focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
                <Button variant="primary" loading={savingDomain} onClick={saveDomain} className="shrink-0">
                  Save Domain
                </Button>
              </div>
            </div>
            <div className="rounded-lg bg-gray-50 p-4 border border-gray-200 text-xs text-gray-700 space-y-2">
              <p className="font-bold text-gray-900">🌐 DNS Setup Instructions</p>
              <p>At the school&apos;s domain registrar (GoDaddy, Namecheap, Cloudflare, etc.), configure:</p>
              <ul className="list-disc pl-5 space-y-1 font-mono text-[11px] text-gray-800">
                <li><strong>CNAME Record:</strong> Host: <code>@</code> or <code>www</code> → Target: <code>cname.schoolaid.app</code></li>
                <li><strong>Or A Record:</strong> Point apex domain to the platform server IP.</li>
              </ul>
            </div>
          </div>
        )}
      </Card>

      {/* Website Sections — Super Admin toggles */}
      <Card variant="default" className="shadow-sm overflow-hidden">
        <div
          className="flex items-center justify-between cursor-pointer"
          onClick={() => toggleSection("website")}
        >
          <h2 className="text-h3 font-bold flex items-center gap-2">
            <svg className={`w-4 h-4 transition-transform ${expandedSection === "website" ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            Website Sections
          </h2>
        </div>
        {expandedSection === "website" && (
        <div className="mt-4 animate-in fade-in slide-in-from-top-2">
          <p className="text-small text-text-muted mb-4">
            Control which sections appear on this school&apos;s public website. The school admin can only edit sections you have enabled here.
          </p>
        <div className="grid grid-cols-1 tablet:grid-cols-2 gap-3">
          {[
            { key: "website.section.notice", label: "📢 Announcement Bar", description: "Emergency alerts and important notices" },
            { key: "website.section.hero", label: "🏫 Hero Section", description: "Main headline, CTA buttons and campus image" },
            { key: "website.section.values", label: "💎 Mission & Values", description: "Mission, vision and core values cards" },
            { key: "website.section.about", label: "📖 About School", description: "School profile and history" },
            { key: "website.section.programs", label: "🎓 Academic Programmes", description: "Curriculum levels with descriptions" },
            { key: "website.section.facilities", label: "🏗️ Facilities", description: "Campus infrastructure photo cards" },
            { key: "website.section.principal_message", label: "🖊️ Principal's Message", description: "Principal portrait and welcome address" },
            { key: "website.section.highlights", label: "⭐ Why Choose Us", description: "School distinctions and differentiators" },
            { key: "website.section.testimonials", label: "💬 Testimonials", description: "Parent and student reviews" },
            { key: "website.section.admissions_steps", label: "📋 Admissions Steps", description: "Enrollment roadmap and prospectus download" },
            { key: "website.section.events", label: "📅 School Events", description: "Calendar and upcoming events" },
            { key: "website.section.faq", label: "❓ FAQ", description: "Common parent questions (accordion)" },
            { key: "website.section.gallery", label: "🖼️ Photo Gallery", description: "Campus life photo grid with lightbox" },
            { key: "website.section.blog", label: "📰 School Blog", description: "School news and announcements" },
            { key: "website.section.contact", label: "📞 Contact & Location", description: "Phone, email, address and social links" },
          ].map((feature) => (
            <FeatureSwitch
              key={feature.key}
              label={feature.label}
              description={feature.description}
              enabled={features[feature.key] ?? true} // default ON
              toggling={featureTogglingKey === feature.key}
              onToggle={(next) => handleFeatureToggle(feature.key, feature.label, next)}
            />
          ))}
        </div>
        </div>
        )}
      </Card>

      {/* Archive */}
      <Card variant="default" className="border-warning">
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

      <ConfirmDialog
        open={!!confirmResetAdmin}
        title="Reset Admin Password"
        message={`Reset the password for ${confirmResetAdmin?.name}? This signs them out and they must use the new temporary password shown next.`}
        confirmLabel="Reset Password"
        variant="warning"
        loading={resettingId === confirmResetAdmin?.id}
        onConfirm={() => {
          if (!confirmResetAdmin) return;
          handleResetPassword(confirmResetAdmin.id, confirmResetAdmin.name).finally(() =>
            setConfirmResetAdmin(null),
          );
        }}
        onCancel={() => setConfirmResetAdmin(null)}
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
                  className="w-full px-3 h-[44px] border border-border rounded-lg focus:outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="block text-small font-medium text-text-secondary mb-1">Last Name</label>
                <input
                  type="text"
                  required
                  value={newAdmin.last_name}
                  onChange={(e) => setNewAdmin({ ...newAdmin, last_name: e.target.value })}
                  className="w-full px-3 h-[44px] border border-border rounded-lg focus:outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="block text-small font-medium text-text-secondary mb-1">Email</label>
                <input
                  type="email"
                  required
                  value={newAdmin.email}
                  onChange={(e) => setNewAdmin({ ...newAdmin, email: e.target.value })}
                  className="w-full px-3 h-[44px] border border-border rounded-lg focus:outline-none focus:border-primary"
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
