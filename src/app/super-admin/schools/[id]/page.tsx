"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, Badge, Input } from "@/components/ui";

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
};

export default function SchoolDetailPage() {
  const router = useRouter();
  const params = useParams();
  const supabase = createClient();
  const [school, setSchool] = useState<SchoolDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [impersonating, setImpersonating] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const schoolId = params.id as string;

  useEffect(() => {
    loadSchool();
  }, [schoolId]);

  const loadSchool = async () => {
    const { data } = await supabase
      .from("schools")
      .select("*")
      .eq("id", schoolId)
      .single();

    if (data) setSchool(data);
    setLoading(false);
  };

  const updateSubscription = async (status: string) => {
    setSaving(true);
    setMessage(null);

    const { error } = await supabase
      .from("schools")
      .update({
        subscription_status: status,
        ...(status === "active" ? { is_active: true } : {}),
        ...(status === "suspended" ? { is_active: false } : {}),
      })
      .eq("id", schoolId);

    if (error) {
      setMessage({ type: "error", text: error.message });
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
        body: JSON.stringify({ school_id: schoolId }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      // Open impersonation session in new tab
      const impersonationUrl = `/super-admin/impersonate?token=${data.token}`;
      window.open(impersonationUrl, "_blank");

      setMessage({
        type: "success",
        text: `Impersonation session started for ${data.school_name}. Expires at ${new Date(data.expires_at).toLocaleTimeString()}.`,
      });
    } catch (err: any) {
      setMessage({ type: "error", text: err.message });
    }
    setImpersonating(false);
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
          <p className="text-small text-text-muted mt-1">
            /{school.slug} · Created{" "}
            {new Date(school.created_at).toLocaleDateString()}
          </p>
        </div>
        <div className="flex gap-3">
          <Button
            variant="accent"
            onClick={handleImpersonate}
            loading={impersonating}
          >
            Access School
          </Button>
        </div>
      </div>

      {message && (
        <Card
          variant={message.type === "success" ? "bordered" : "bordered"}
          className={`px-4 py-3 ${message.type === "success" ? "bg-success-bg border-success" : "bg-error-bg border-error"}`}
        >
          <p
            className={`text-small ${message.type === "success" ? "text-success" : "text-error"}`}
          >
            {message.text}
          </p>
        </Card>
      )}

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

      {/* Danger Zone */}
      <Card variant="bordered" className="border-error">
        <h2 className="text-h3 font-bold text-error mb-2">Danger Zone</h2>
        <p className="text-small text-text-secondary mb-4">
          Suspending a school blocks all non-Super-Admin logins immediately.
        </p>
        <Button variant="danger" size="sm">
          Delete School
        </Button>
      </Card>
    </div>
  );
}
