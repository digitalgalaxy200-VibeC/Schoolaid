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
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null);
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
    // Auto-generate slug from name
    if (field === "name") {
      setForm((prev) => ({
        ...prev,
        name: value,
        slug: value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
      }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setGeneratedPassword(null);

    // Generate a random password for the school admin
    const tempPassword = Math.random().toString(36).slice(-10) +
      Math.random().toString(36).toUpperCase().slice(-2) + "!1";

    try {
      // 1. Create the school
      const res = await fetch("/api/super-admin/schools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create school");
      }

      const school = await res.json();

      // 2. Create the school admin auth user via Supabase Auth admin API
      const adminEmail = `admin@${form.slug}.edu`;
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: adminEmail,
        password: tempPassword,
        email_confirm: true,
        user_metadata: {
          full_name: `${form.name} Admin`,
          role: "school_admin",
          school_id: school.id,
        },
      });

      if (authError) throw new Error(authError.message);

      // 3. Create the school admin profile record
      await supabase.from("profiles").upsert({
        id: authData.user.id,
        school_id: school.id,
        full_name: `${form.name} Admin`,
        email: adminEmail,
        role: "school_admin",
      });

      // 4. Create school_admins record
      await supabase.from("school_admins").insert({
        school_id: school.id,
        profile_id: authData.user.id,
        first_name: form.name.split(" ")[0] || "School",
        last_name: "Admin",
        generated_password: tempPassword,
        must_change_password: true,
      });

      // Show password once
      setGeneratedPassword(tempPassword);

      // Clear the generated password from DB after showing
      setTimeout(async () => {
        await supabase
          .from("school_admins")
          .update({ generated_password: null })
          .eq("school_id", school.id);
      }, 5000);

    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (generatedPassword) {
    return (
      <div className="max-w-lg mx-auto mt-10">
        <Card variant="bordered" className="shadow-md text-center p-8">
          <div className="text-success text-4xl mb-4">✓</div>
          <h2 className="text-h2 font-bold mb-2">School Created!</h2>
          <p className="text-small text-text-secondary mb-6">
            School <strong>{form.name}</strong> is ready. Hand these credentials to the school admin.
          </p>

          <div className="bg-warning-bg border border-warning rounded-sm p-4 mb-6">
            <p className="text-caption text-warning font-semibold uppercase tracking-wider mb-2">
              ⚠️ Temporary Password — Show Once
            </p>
            <p className="text-h3 font-mono font-bold text-warning break-all">
              {generatedPassword}
            </p>
          </div>

          <div className="bg-bg rounded-sm p-4 mb-6 text-left space-y-2">
            <div className="flex justify-between">
              <span className="text-caption text-text-muted">Admin Email</span>
              <span className="text-small font-mono">admin@{form.slug}.edu</span>
            </div>
            <div className="flex justify-between">
              <span className="text-caption text-text-muted">School ID</span>
              <span className="text-small font-mono">{/* Will need to display from response */}</span>
            </div>
          </div>

          <div className="flex gap-3 justify-center">
            <Button variant="primary" onClick={() => router.push("/super-admin/schools")}>
              Back to Schools
            </Button>
            <Button variant="secondary" onClick={() => window.print()}>
              Print Credentials
            </Button>
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
              label="Slug"
              value={form.slug}
              onChange={(e) => handleChange("slug", e.target.value)}
              placeholder="riverside-secondary"
              hint="Used in URLs and identifiers"
              required
            />
          </div>

          <Input
            label="Motto / Tagline"
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
              label="Phone"
              type="tel"
              value={form.phone}
              onChange={(e) => handleChange("phone", e.target.value)}
              placeholder="+234 800 000 0000"
            />
            <Input
              label="Email"
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
            placeholder="school.edu (optional)"
          />

          {error && (
            <p className="text-small text-error" role="alert">
              {error}
            </p>
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
