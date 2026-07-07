"use client";
import { useEffect, useState } from "react";
import { Button, Input, Card } from "@/components/ui";

export default function SchoolProfile() {
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => { fetch("/api/school-admin/school").then(r => r.json()).then(d => setForm(d)); }, []);

  const save = async (e: React.FormEvent) => { e.preventDefault(); setSaving(true);
    const res = await fetch("/api/school-admin/school", { method: "PUT", headers: {"Content-Type":"application/json"}, body: JSON.stringify(form) });
    setMsg(res.ok ? "Saved!" : "Failed"); setSaving(false);
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-h1 font-bold">School Profile</h1>
      <Card variant="bordered" className="shadow-sm">
        <form onSubmit={save} className="space-y-4">
          <Input label="School Name" value={form.name||""} onChange={e => setForm({...form, name:e.target.value})} />
          <Input label="Motto" value={form.motto||""} onChange={e => setForm({...form, motto:e.target.value})} />
          <Input label="Address" value={form.address||""} onChange={e => setForm({...form, address:e.target.value})} />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Phone" value={form.phone||""} onChange={e => setForm({...form, phone:e.target.value})} />
            <Input label="Email" value={form.email||""} onChange={e => setForm({...form, email:e.target.value})} />
          </div>
          <Input label="Website" value={form.website||""} onChange={e => setForm({...form, website:e.target.value})} />
          {msg && <p className="text-small text-success">{msg}</p>}
          <Button type="submit" loading={saving}>Save Changes</Button>
        </form>
      </Card>
    </div>
  );
}
