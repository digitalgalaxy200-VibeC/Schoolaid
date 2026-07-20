export const dynamic = "force-dynamic";

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button, Input, Card } from "@/components/ui";

export default function NewSchoolPage() {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    adminEmail: string;
    adminPassword: string;
    schoolName: string;
    schoolPhone: string;
  } | null>(null);
  const [form, setForm] = useState({
    name: "",
    slug: "",
    motto: "",
    address: "",
    phone: "",
    email: "",
    website: "",
  });

  const handleChange = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (field === "name") {
      setForm((prev) => ({
        ...prev,
        name: value,
        slug: value
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, ""),
      }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/super-admin/schools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, adminPhone: form.phone }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setResult(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (result) {
    const { adminEmail, adminPassword, schoolName, schoolPhone } = result;
    const whatsappUrl = schoolPhone
      ? `https://wa.me/${schoolPhone.replace(/\D/g, "")}?text=${encodeURIComponent(`Hello! Your SchoolAid admin account is ready:\n\nSchool: ${schoolName}\nEmail: ${adminEmail}\nPassword: ${adminPassword}\n\nLogin at: https://schoolaid-b1fa.vercel.app/auth/login\n\nPlease change your password after first login.`)}`
      : null;

    return (
      <div className="max-w-lg mx-auto mt-10">
        <Card variant="bordered" className="shadow-md text-center p-8">
          <div className="text-success text-4xl mb-4">✓</div>
          <h2 className="text-h2 font-bold mb-2">School Created!</h2>
          <p className="text-small text-text-secondary mb-6">
            <strong>{schoolName}</strong> is ready.
          </p>

          <div className="bg-warning-bg border border-warning rounded-sm p-4 mb-6">
            <p className="text-caption text-warning font-semibold uppercase tracking-wider mb-2">
              ⚠️ Temporary Password — Show Once
            </p>
            <p className="text-h3 font-mono font-bold text-warning break-all">
              {adminPassword}
            </p>
          </div>

          <div className="bg-bg rounded-sm p-4 mb-6 text-left space-y-2">
            <div className="flex justify-between">
              <span className="text-caption text-text-muted">Admin Email</span>
              <span className="text-small font-mono">{adminEmail}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-caption text-text-muted">Phone</span>
              <span className="text-small font-mono">{schoolPhone || "—"}</span>
            </div>
          </div>

          <div className="flex gap-3 justify-center flex-wrap">
            <Button
              variant="primary"
              onClick={() => router.push("/super-admin/schools")}
            >
              Back to Schools
            </Button>
            {whatsappUrl ? (
              <Button
                variant="accent"
                onClick={() => window.open(whatsappUrl, "_blank")}
              >
                📱 Send via WhatsApp
              </Button>
            ) : (
              <Button variant="secondary" onClick={() => window.print()}>
                Print Credentials
              </Button>
            )}
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-h1 font-bold">Create School</h1>
        <p className="text-small text-text-muted mt-1">
          Create a new school and generate its first admin account
        </p>
      </div>
      <Card variant="bordered" className="shadow-sm">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-1 tablet:grid-cols-2 gap-5">
            <Input
              label="School Name"
              value={form.name}
              onChange={(e) => handleChange("name", e.target.value)}
              placeholder="e.g. Riverside Secondary School"
              required
            />
            <Input
              label="Slug (Auto-generated)"
              value={form.slug}
              readOnly
              className="bg-bg text-text-muted cursor-not-allowed"
              placeholder="riverside-secondary"
            />
          </div>
          <Input
            label="Motto"
            value={form.motto}
            onChange={(e) => handleChange("motto", e.target.value)}
            placeholder="e.g. Knowledge is Power"
          />
          <Input
            label="Address"
            value={form.address}
            onChange={(e) => handleChange("address", e.target.value)}
            placeholder="Full school address"
          />
          <div className="grid grid-cols-1 tablet:grid-cols-2 gap-5">
            <Input
              label="Phone (for WhatsApp)"
              type="tel"
              value={form.phone}
              onChange={(e) => handleChange("phone", e.target.value)}
              placeholder="+234 800 000 0000"
            />
            <Input
              label="School Email"
              type="email"
              value={form.email}
              onChange={(e) => handleChange("email", e.target.value)}
              placeholder="admin@school.edu"
              required
            />
          </div>
          <Input
            label="Website"
            type="text"
            value={form.website}
            onChange={(e) => handleChange("website", e.target.value)}
            onBlur={() => {
              if (form.website && !/^https?:\/\//i.test(form.website)) {
                handleChange("website", `https://${form.website}`);
              }
            }}
            placeholder="school.edu or https://school.edu"
          />
          {error && (
            <div className="bg-error-bg border border-error rounded-sm px-4 py-3">
              <p className="text-small text-error font-medium">{error}</p>
            </div>
          )}
          <div className="flex gap-3 justify-end">
            <Button
              variant="ghost"
              type="button"
              onClick={() => router.push("/super-admin/schools")}
            >
              Cancel
            </Button>
            <Button type="submit" loading={loading}>
              Create School &amp; Admin
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
