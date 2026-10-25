"use client";
import { useEffect, useRef, useState } from "react";
import { Button, Input, Card } from "@/components/ui";
import { CURRENCY_OPTIONS } from "@/lib/finance/currency";

export default function SchoolProfile() {
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{type:"success"|"error",text:string}|null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // The admin's own SIGN-IN email. This is deliberately separate from
  // `form.email`, which is the school's public contact address.
  const [accountEmail, setAccountEmail] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [accountSaving, setAccountSaving] = useState(false);
  const [accountMsg, setAccountMsg] = useState<{type:"success"|"error",text:string}|null>(null);

  useEffect(() => {
    fetch("/api/school-admin/school").then(r => r.json()).then(d => setForm(d));
    // `/api/auth/me` reads the email from the session, so after a change the
    // header and this field agree without a reload.
    fetch("/api/auth/me")
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d?.email) setAccountEmail(d.email); })
      .catch(() => {});
  }, []);

  const save = async (e: React.FormEvent) => { e.preventDefault(); setSaving(true);
    const res = await fetch("/api/school-admin/school", { method: "PUT", headers: {"Content-Type":"application/json"}, body: JSON.stringify(form) });
    setMsg({type:res.ok?"success":"error",text:res.ok?"Saved!":"Failed"});
    setTimeout(()=>setMsg(null),2000); setSaving(false);
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { setMsg({type:"error",text:"File too large. Max 2MB."}); return; }
    
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/school-admin/upload-avatar", { method: "POST", body: fd });
    if (res.ok) {
      const { url } = await res.json();
      setForm((prev: any) => ({ ...prev, logo_url: url }));
      // Auto-save the logo URL
      await fetch("/api/school-admin/school", { method: "PUT", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ ...form, logo_url: url }) });
      setMsg({type:"success",text:"Logo uploaded!"});
    } else {
      setMsg({type:"error",text:"Upload failed"});
    }
    setTimeout(()=>setMsg(null),3000);
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
          data.warning || "Email changed. Use the new address the next time you sign in.",
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
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-h1 font-bold">School Profile</h1>
      
      {msg && <div className={`px-4 py-2 rounded-sm text-small font-medium ${msg.type==="success"?"bg-success-bg text-success":"bg-error-bg text-error"}`}>{msg.text}</div>}

      {/* Logo Upload */}
      <Card variant="default" className="shadow-sm">
        <h2 className="text-h3 font-bold mb-4">School Logo</h2>
        <div className="flex items-center gap-4">
          <div className="w-24 h-24 rounded-xl border-2 border-border overflow-hidden bg-bg flex items-center justify-center flex-shrink-0">
            {form.logo_url ? (
              <img src={form.logo_url} alt="Logo" className="w-full h-full object-contain" />
            ) : (
              <span className="text-text-muted text-3xl font-bold">{form.name?.charAt(0) || "S"}</span>
            )}
          </div>
          <div className="space-y-2">
            <p className="text-small text-text-muted">Upload a square image (PNG or JPG, max 2MB)</p>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={handleLogoUpload} className="hidden" />
            <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()} loading={uploading}>
              {form.logo_url ? "Change Logo" : "Upload Logo"}
            </Button>
            {form.logo_url && (
              <Button variant="ghost" size="sm" onClick={() => { setForm({...form, logo_url: null}); fetch("/api/school-admin/school", { method: "PUT", headers: {"Content-Type":"application/json"}, body: JSON.stringify({...form, logo_url: null}) }); }}>
                Remove
              </Button>
            )}
          </div>
        </div>
      </Card>

      <Card variant="default" className="shadow-sm">
        <form onSubmit={save} className="space-y-4">
          <Input label="School Name" value={form.name||""} onChange={e => setForm({...form, name:e.target.value})} />
          <Input label="Motto" value={form.motto||""} onChange={e => setForm({...form, motto:e.target.value})} />
          <Input label="Address" value={form.address||""} onChange={e => setForm({...form, address:e.target.value})} />
          <div className="grid grid-cols-1 tablet:grid-cols-2 gap-4">
            <Input label="Phone" value={form.phone||""} onChange={e => setForm({...form, phone:e.target.value})} />
            <Input label="Second phone (optional)" value={form.phone_secondary||""} onChange={e => setForm({...form, phone_secondary:e.target.value})} />
          </div>
          <p className="text-caption text-text-muted -mt-2">
            The first number is the one parents call and message on WhatsApp. The second is shown
            alongside it on your website, for a line you would rather not publish as the main one.
          </p>
          <Input label="Email" value={form.email||""} onChange={e => setForm({...form, email:e.target.value})} />
          <Input label="Website" value={form.website||""} onChange={e => setForm({...form, website:e.target.value})} />

          {/* Finance currency — stored as a CODE; symbols are derived everywhere */}
          <div>
            <label className="block text-caption font-medium text-text-secondary mb-1.5">Finance currency</label>
            <select
              value={form.currency || "NGN"}
              onChange={e => setForm({...form, currency: e.target.value})}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-body text-text-primary focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {CURRENCY_OPTIONS.map(c => (
                <option key={c.code} value={c.code}>{c.name} ({c.code})</option>
              ))}
            </select>
            <p className="text-caption text-text-muted mt-1">Used across Finance — fees, billing, payments, receipts and reports. Change it anytime; past records keep their amounts.</p>
          </div>

          <Button type="submit" loading={saving}>Save Changes</Button>
        </form>
      </Card>

      {/* The admin's own sign-in identity — NOT the school's contact email above. */}
      <Card variant="default" className="shadow-sm">
        <h2 className="text-h3 font-bold mb-1">Your account</h2>
        <p className="text-small text-text-muted mb-4">
          The email you sign in with. Changing it here changes your login only — the school&apos;s
          public contact email above is separate and stays as it is.
        </p>

        {accountMsg && (
          <div
            className={`mb-4 px-4 py-2 rounded-sm text-small font-medium ${
              accountMsg.type === "success" ? "bg-success-bg text-success" : "bg-error-bg text-error"
            }`}
          >
            {accountMsg.text}
          </div>
        )}

        <form onSubmit={saveAccountEmail} className="space-y-4">
          <Input label="Current email" value={accountEmail} disabled onChange={() => {}} />
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
          <Button type="submit" loading={accountSaving}>Change email</Button>
        </form>
      </Card>
    </div>
  );
}
