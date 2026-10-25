"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Input, Card } from "@/components/ui";
import { CURRENCY_OPTIONS } from "@/lib/finance/currency";
import { ProfileDetailsForm } from "@/components/profile/ProfileDetailsForm";

type MeResponse = {
  email?: string;
  profile_full_name?: string;
  phone?: string;
  contact_email?: string;
  profile_percent?: number;
  profile_complete?: boolean;
};

type SchoolForm = {
  name?: string;
  motto?: string;
  address?: string;
  phone?: string;
  phone_secondary?: string;
  email?: string;
  website?: string;
  currency?: string;
  logo_url?: string | null;
};

function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="border-l-4 border-primary pl-4">
      <p className="text-caption font-bold uppercase tracking-wider text-primary">{eyebrow}</p>
      <h2 className="mt-1 text-h2 font-bold text-text-primary">{title}</h2>
      <p className="mt-1 max-w-2xl text-small text-text-secondary">{description}</p>
    </div>
  );
}

/**
 * Two records live on this screen and they must not be confused:
 *
 *   THE SCHOOL      — a public institution: name, logo, address, phone, the
 *                     contact address parents see on the website and receipts.
 *   THE REPRESENTATIVE — the person who signs in and manages it: their own
 *                     name, their own phone, and the email they SIGN IN with.
 *
 * The previous layout interleaved them, so "phone" and "email" each appeared
 * three times with different meanings. They are now separate sections, and the
 * representative's email is the real sign-in identity — changed through its own
 * password-checked flow, not stored as a decorative second address.
 */
export default function SchoolProfile() {
  // ── The school ────────────────────────────────────────────
  const [form, setForm] = useState<SchoolForm>({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // ── The representative ────────────────────────────────────
  const [me, setMe] = useState<MeResponse | null>(null);
  const [accountEmail, setAccountEmail] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [accountSaving, setAccountSaving] = useState(false);
  const [accountMsg, setAccountMsg] = useState<{ type: "success" | "error"; text: string } | null>(
    null,
  );

  useEffect(() => {
    fetch("/api/school-admin/school").then((r) => r.json()).then((d) => setForm(d));
    // `/api/auth/me` reads the email from the session, so after a change the
    // header and this section agree without a reload.
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: MeResponse | null) => {
        if (d) setMe(d);
        if (d?.email) setAccountEmail(d.email);
      })
      .catch(() => {});
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const res = await fetch("/api/school-admin/school", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setMsg({ type: res.ok ? "success" : "error", text: res.ok ? "Saved!" : "Failed" });
    setTimeout(() => setMsg(null), 2000);
    setSaving(false);
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setMsg({ type: "error", text: "File too large. Max 2MB." });
      return;
    }

    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/school-admin/upload-avatar", { method: "POST", body: fd });
    if (res.ok) {
      const { url } = await res.json();
      setForm((prev) => ({ ...prev, logo_url: url }));
      // Auto-save the logo URL
      await fetch("/api/school-admin/school", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, logo_url: url }),
      });
      setMsg({ type: "success", text: "Logo uploaded!" });
    } else {
      setMsg({ type: "error", text: "Upload failed" });
    }
    setTimeout(() => setMsg(null), 3000);
    setUploading(false);
  };

  const saveAccountEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setAccountMsg(null);

    if (!newEmail.trim() || !currentPassword) {
      setAccountMsg({ type: "error", text: "Enter the new email and your current password." });
      return;
    }

    setAccountSaving(true);
    try {
      const res = await fetch("/api/school-admin/account/email", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: newEmail, currentPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not change the email.");

      setAccountEmail(data.email);
      setNewEmail("");
      setCurrentPassword("");
      setAccountMsg({
        type: "success",
        text:
          data.warning ||
          `Email changed. Use the new address the next time you sign in.${
            data.school_email_updated
              ? " The school's public contact email was updated too, because it still used your old address."
              : ""
          }`,
      });
    } catch (err) {
      setAccountMsg({
        type: "error",
        text: err instanceof Error ? err.message : "Could not change the email.",
      });
    } finally {
      setAccountSaving(false);
    }
  };

  return (
    <div className="max-w-3xl space-y-10 pb-12">
      <div>
        <h1 className="text-h1 font-bold">School Profile</h1>
        <p className="mt-1 text-small text-text-secondary">
          Two separate records: the school&apos;s public details, and your own account as its
          representative.
        </p>
      </div>

      {/* ─────────────────────────────────────────────────────
          THE SCHOOL — public, seen by parents and printed on cards
          ───────────────────────────────────────────────────── */}
      <section className="space-y-4">
        <SectionHeading
          eyebrow="The school"
          title="Public details"
          description="These appear on your website, report cards and receipts. They describe the institution, not the person managing it."
        />

        <Card variant="default" className="shadow-sm">
          <div className="p-5">
            <h3 className="text-body font-bold text-text-primary">Logo</h3>
            <p className="mt-1 text-caption text-text-muted">
              Used on your website, report cards and the sign-in page.
            </p>
            <div className="mt-4 flex items-center gap-4">
              <div className="w-24 h-24 rounded-xl border-2 border-border overflow-hidden bg-bg flex items-center justify-center shrink-0">
                {form.logo_url ? (
                  <img src={form.logo_url} alt="Logo" className="w-full h-full object-contain" />
                ) : (
                  <span className="text-text-muted text-3xl font-bold">
                    {form.name?.charAt(0) || "S"}
                  </span>
                )}
              </div>
              <div className="space-y-2">
                <p className="text-caption text-text-muted">Square image (PNG or JPG, max 2MB)</p>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={handleLogoUpload}
                  className="hidden"
                />
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => fileRef.current?.click()}
                  loading={uploading}
                >
                  {form.logo_url ? "Change logo" : "Upload logo"}
                </Button>
                {form.logo_url ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setForm({ ...form, logo_url: null });
                      fetch("/api/school-admin/school", {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ ...form, logo_url: null }),
                      });
                    }}
                  >
                    Remove
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        </Card>

        <Card variant="default" className="shadow-sm">
          <form onSubmit={save} className="p-5 space-y-4">
            {msg ? (
              <div
                className={`rounded-sm px-4 py-2 text-small font-medium ${
                  msg.type === "success" ? "bg-success-bg text-success" : "bg-error-bg text-error"
                }`}
              >
                {msg.text}
              </div>
            ) : null}

            <Input
              label="School name"
              value={form.name || ""}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <Input
              label="Motto"
              value={form.motto || ""}
              onChange={(e) => setForm({ ...form, motto: e.target.value })}
            />

            <div className="grid grid-cols-1 gap-4 tablet:grid-cols-2">
              <Input
                label="School phone"
                type="tel"
                value={form.phone || ""}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                hint="The number parents call. Shown on the website and contact cards."
              />
              <Input
                label="Second phone (optional)"
                type="tel"
                value={form.phone_secondary || ""}
                onChange={(e) => setForm({ ...form, phone_secondary: e.target.value })}
                hint="A second line shown beside the first on the website."
              />
            </div>

            <Input
              label="Address"
              value={form.address || ""}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />

            <Input
              label="Public contact email"
              type="email"
              value={form.email || ""}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              hint="Where parents write to the school. Shown on the website and receipts — not your sign-in address."
            />

            <Input
              label="Website (optional)"
              value={form.website || ""}
              onChange={(e) => setForm({ ...form, website: e.target.value })}
            />

            {/* Finance currency — stored as a CODE; symbols are derived everywhere */}
            <div>
              <label className="block text-caption font-medium text-text-secondary mb-1.5">
                Finance currency
              </label>
              <select
                value={form.currency || "NGN"}
                onChange={(e) => setForm({ ...form, currency: e.target.value })}
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-body text-text-primary focus:outline-none focus:ring-2 focus:ring-primary"
              >
                {CURRENCY_OPTIONS.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name} ({c.code})
                  </option>
                ))}
              </select>
              <p className="mt-1 text-caption text-text-muted">
                Used across Finance — fees, billing, payments, receipts and reports. Past records
                keep their amounts.
              </p>
            </div>

            <Button type="submit" loading={saving}>
              Save school details
            </Button>
          </form>
        </Card>
      </section>

      {/* ─────────────────────────────────────────────────────
          THE REPRESENTATIVE — the person who signs in
          ───────────────────────────────────────────────────── */}
      <section className="space-y-4">
        <SectionHeading
          eyebrow="You"
          title="Your account as the school's representative"
          description="Your name, your phone and the email you sign in with. These belong to you, not to the school — changing them does not change the school's public details above."
        />

        {me ? (
          <ProfileDetailsForm
            role="school_admin"
            initial={{
              full_name: me.profile_full_name ?? "",
              phone: me.phone ?? "",
              contact_email: me.contact_email ?? "",
              percent: me.profile_percent ?? 0,
              complete: me.profile_complete === true,
            }}
            showHeading={false}
            contactEmailEditable={false}
            description="Your own details, used by SchoolAid to reach you. No gender is recorded — this account represents the school."
          />
        ) : null}

        <Card variant="default" className="shadow-sm">
          <div className="p-5">
            <h3 className="text-body font-bold text-text-primary">Sign-in email</h3>
            <p className="mt-1 text-small text-text-secondary">
              This is the address that signs you in, and the one SchoolAid reaches you on. It is
              separate from the school&apos;s public contact email above. Changing it replaces the
              old address immediately — that address stops working.
            </p>

            {accountMsg ? (
              <div
                className={`mt-4 rounded-sm px-4 py-2 text-small font-medium ${
                  accountMsg.type === "success"
                    ? "bg-success-bg text-success"
                    : "bg-error-bg text-error"
                }`}
              >
                {accountMsg.text}
              </div>
            ) : null}

            <form onSubmit={saveAccountEmail} className="mt-4 space-y-4">
              <Input
                label="Current email"
                value={accountEmail}
                disabled
                onChange={() => {}}
              />
              <Input
                label="New email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
              />
              <Input
                label="Current password"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                hint="Confirms it is you — a signed-in browser alone should not be able to change a credential."
              />
              <Button type="submit" loading={accountSaving}>
                Change email
              </Button>
            </form>
          </div>
        </Card>
      </section>
    </div>
  );
}
