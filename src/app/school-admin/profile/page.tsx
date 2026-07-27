"use client";
import { useEffect, useRef, useState } from "react";
import { Button, Input, Card } from "@/components/ui";

export default function SchoolProfile() {
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{type:"success"|"error",text:string}|null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { fetch("/api/school-admin/school").then(r => r.json()).then(d => setForm(d)); }, []);

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

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-h1 font-bold">School Profile</h1>
      
      {msg && <div className={`px-4 py-2 rounded-sm text-small font-medium ${msg.type==="success"?"bg-success-bg text-success":"bg-error-bg text-error"}`}>{msg.text}</div>}

      {/* Logo Upload */}
      <Card variant="bordered" className="shadow-sm">
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

      <Card variant="bordered" className="shadow-sm">
        <form onSubmit={save} className="space-y-4">
          <Input label="School Name" value={form.name||""} onChange={e => setForm({...form, name:e.target.value})} />
          <Input label="Motto" value={form.motto||""} onChange={e => setForm({...form, motto:e.target.value})} />
          <Input label="Address" value={form.address||""} onChange={e => setForm({...form, address:e.target.value})} />
          <div className="grid grid-cols-1 tablet:grid-cols-2 gap-4">
            <Input label="Phone" value={form.phone||""} onChange={e => setForm({...form, phone:e.target.value})} />
            <Input label="Email" value={form.email||""} onChange={e => setForm({...form, email:e.target.value})} />
          </div>
          <Input label="Website" value={form.website||""} onChange={e => setForm({...form, website:e.target.value})} />
          <Button type="submit" loading={saving}>Save Changes</Button>
        </form>
      </Card>
    </div>
  );
}
