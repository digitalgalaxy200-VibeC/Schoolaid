"use client";
import { useEffect, useState } from "react";
import { Button, Input, Card, Badge } from "@/components/ui";

export default function SessionsPage() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [terms, setTerms] = useState<any[]>([]);
  const [selSession, setSelSession] = useState<string>("");
  const [showNew, setShowNew] = useState(false);
  const [sName, setSName] = useState("");
  const [sStart, setSStart] = useState("");
  const [sEnd, setSEnd] = useState("");

  const load = () => fetch("/api/school-admin/sessions").then(r => r.json()).then(d => setSessions(Array.isArray(d)?d:[]));
  useEffect(() => { load(); }, []);

  const loadTerms = (sid: string) => { setSelSession(sid); fetch(`/api/school-admin/terms?session_id=${sid}`).then(r => r.json()).then(d => setTerms(Array.isArray(d)?d:[])); };

  const createSession = async (e: React.FormEvent) => { e.preventDefault();
    await fetch("/api/school-admin/sessions", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({name:sName, start_date:sStart, end_date:sEnd}) });
    setShowNew(false); load();
  };

  const toggleActive = async (termId: string) => {
    await fetch("/api/school-admin/terms", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({id:termId, is_active:true}) });
    loadTerms(selSession);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-h1 font-bold">Sessions & Terms</h1>
        <Button onClick={() => setShowNew(true)}>New Session</Button>
      </div>

      {showNew && (
        <Card variant="bordered" className="shadow-sm">
          <form onSubmit={createSession} className="space-y-4">
            <Input label="Session Name" value={sName} onChange={e => setSName(e.target.value)} placeholder="2026/2027" required />
            <div className="grid grid-cols-2 gap-4">
              <Input label="Start Date" type="date" value={sStart} onChange={e => setSStart(e.target.value)} required />
              <Input label="End Date" type="date" value={sEnd} onChange={e => setSEnd(e.target.value)} required />
            </div>
            <div className="flex gap-3">
              <Button type="submit">Create</Button>
              <Button variant="ghost" onClick={() => setShowNew(false)}>Cancel</Button>
            </div>
          </form>
        </Card>
      )}

      <div className="grid grid-cols-1 tablet:grid-cols-3 gap-4">
        <div className="space-y-2">
          <h2 className="text-h3 font-bold">Sessions</h2>
          {sessions.map(s => (
            <div key={s.id} onClick={() => loadTerms(s.id)} className={`p-3 rounded-sm cursor-pointer border ${selSession===s.id?"bg-primary-light border-primary":"bg-surface border-border hover:bg-bg"}`}>
              <p className="font-semibold text-small">{s.name}</p>
              <p className="text-caption text-text-muted">{new Date(s.start_date).toLocaleDateString()} — {new Date(s.end_date).toLocaleDateString()}</p>
            </div>
          ))}
        </div>
        <div className="tablet:col-span-2">
          <h2 className="text-h3 font-bold mb-3">Terms</h2>
          {terms.map(t => (
            <div key={t.id} className="flex items-center justify-between p-3 bg-surface border border-border rounded-sm mb-2">
              <div><p className="text-body font-semibold">{t.name}</p><p className="text-caption text-text-muted">{t.start_date} — {t.end_date}</p></div>
              <div className="flex items-center gap-3">
                <Badge variant={t.is_active?"success":"default"}>{t.is_active ? "Active" : "Inactive"}</Badge>
                {!t.is_active && <Button size="sm" variant="secondary" onClick={() => toggleActive(t.id)}>Set Active</Button>}
              </div>
            </div>
          ))}
          {terms.length===0 && selSession && <p className="text-small text-text-muted">No terms yet. Create one below.</p>}
        </div>
      </div>
    </div>
  );
}
