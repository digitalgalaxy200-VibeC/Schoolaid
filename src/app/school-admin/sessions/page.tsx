"use client";
import { useEffect, useState } from "react";
import { Button, Input, Card, Badge } from "@/components/ui";

export default function SessionsPage() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [terms, setTerms] = useState<any[]>([]);
  const [selSession, setSelSession] = useState<string>("");
  const [showS, setShowS] = useState(false);
  const [showT, setShowT] = useState(false);
  const [sName, setSName] = useState("");
  const [sStart, setSStart] = useState("");
  const [sEnd, setSEnd] = useState("");
  const [tName, setTName] = useState("");
  const [tStart, setTStart] = useState("");
  const [tEnd, setTEnd] = useState("");
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  // Editing state
  const [editingSession, setEditingSession] = useState<any | null>(null);
  const [editingTerm, setEditingTerm] = useState<any | null>(null);

  const load = () =>
    fetch("/api/school-admin/sessions")
      .then((r) => r.json())
      .then((d) => setSessions(Array.isArray(d) ? d : []));

  useEffect(() => { load(); }, []);

  const loadTerms = (sid: string) => {
    setSelSession(sid);
    fetch(`/api/school-admin/terms?session_id=${sid}`)
      .then((r) => r.json())
      .then((d) => setTerms(Array.isArray(d) ? d : []));
  };

  const showMsg = (type: "success" | "error", text: string) => {
    setMsg({ type, text });
    setTimeout(() => setMsg(null), 4000);
  };

  const createSession = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const r = await fetch("/api/school-admin/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: sName, start_date: sStart, end_date: sEnd }),
    });
    const d = await r.json();
    setSaving(false);
    if (r.ok) {
      showMsg("success", "Session created");
      setShowS(false);
      setSName(""); setSStart(""); setSEnd("");
      load();
    } else {
      showMsg("error", d.error);
    }
  };

  const saveSession = async () => {
    if (!editingSession) return;
    setSaving(true);
    const r = await fetch("/api/school-admin/sessions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: editingSession.id,
        name: editingSession.name,
        start_date: editingSession.start_date,
        end_date: editingSession.end_date,
      }),
    });
    const d = await r.json();
    setSaving(false);
    if (r.ok) {
      showMsg("success", "Session updated");
      setEditingSession(null);
      load();
    } else {
      showMsg("error", d.error);
    }
  };

  const createTerm = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const r = await fetch("/api/school-admin/terms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: tName,
        start_date: tStart,
        end_date: tEnd,
        academic_session_id: selSession,
      }),
    });
    const d = await r.json();
    setSaving(false);
    if (r.ok) {
      showMsg("success", "Term created");
      setShowT(false);
      setTName(""); setTStart(""); setTEnd("");
      loadTerms(selSession);
    } else {
      showMsg("error", d.error);
    }
  };

  const saveTerm = async () => {
    if (!editingTerm) return;
    setSaving(true);
    const r = await fetch("/api/school-admin/terms", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: editingTerm.id,
        name: editingTerm.name,
        start_date: editingTerm.start_date,
        end_date: editingTerm.end_date,
      }),
    });
    const d = await r.json();
    setSaving(false);
    if (r.ok) {
      showMsg("success", "Term updated");
      setEditingTerm(null);
      loadTerms(selSession);
    } else {
      showMsg("error", d.error);
    }
  };

  const toggleActive = async (termId: string) => {
    await fetch("/api/school-admin/terms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: termId, is_active: true }),
    });
    loadTerms(selSession);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-h1 font-bold">Sessions & Terms</h1>
        <Button onClick={() => setShowS(true)}>New Session</Button>
      </div>

      {msg && (
        <div className={`px-4 py-3 rounded-lg text-small font-medium ${msg.type === "success" ? "bg-success-bg text-success border border-success" : "bg-error-bg text-error border border-error"}`}>
          {msg.text}
        </div>
      )}

      {showS && (
        <Card variant="bordered">
          <form onSubmit={createSession} className="space-y-4">
            <h3 className="text-h3 font-bold">New Academic Session</h3>
            <Input label="Session Name" value={sName} onChange={(e) => setSName(e.target.value)} placeholder="2026/2027" hint="Example: 2025/2026" required />
            <div className="grid grid-cols-1 tablet:grid-cols-2 gap-4">
              <Input label="Start Date" type="date" value={sStart} onChange={(e) => setSStart(e.target.value)} required />
              <Input label="End Date" type="date" value={sEnd} onChange={(e) => setSEnd(e.target.value)} required />
            </div>
            <div className="flex gap-3">
              <Button type="submit" loading={saving}>Create</Button>
              <Button variant="ghost" onClick={() => setShowS(false)}>Cancel</Button>
            </div>
          </form>
        </Card>
      )}

      {/* Edit Session Modal */}
      {editingSession && (
        <Card variant="bordered" className="border-primary">
          <div className="space-y-4">
            <h3 className="text-h3 font-bold">Edit Session</h3>
            <Input label="Session Name" value={editingSession.name} onChange={(e) => setEditingSession({ ...editingSession, name: e.target.value })} required />
            <div className="grid grid-cols-1 tablet:grid-cols-2 gap-4">
              <Input label="Start Date" type="date" value={editingSession.start_date?.slice(0, 10)} onChange={(e) => setEditingSession({ ...editingSession, start_date: e.target.value })} required />
              <Input label="End Date" type="date" value={editingSession.end_date?.slice(0, 10)} onChange={(e) => setEditingSession({ ...editingSession, end_date: e.target.value })} required />
            </div>
            <div className="flex gap-3">
              <Button onClick={saveSession} loading={saving}>Save Changes</Button>
              <Button variant="ghost" onClick={() => setEditingSession(null)}>Cancel</Button>
            </div>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 tablet:grid-cols-3 gap-4">
        {/* Sessions list */}
        <div className="space-y-2">
          <h2 className="text-h3 font-bold">Sessions</h2>
          {sessions.length === 0 && (
            <p className="text-caption text-text-muted py-4">No sessions yet. Create one above.</p>
          )}
          {sessions.map((s) => (
            <div
              key={s.id}
              className={`p-3 rounded-lg cursor-pointer border transition-all ${selSession === s.id ? "bg-primary-light border-primary" : "bg-surface border-border hover:bg-bg"}`}
            >
              <div onClick={() => loadTerms(s.id)}>
                <p className="font-semibold text-small">{s.name}</p>
                <p className="text-caption text-text-muted">
                  {new Date(s.start_date).toLocaleDateString()} — {new Date(s.end_date).toLocaleDateString()}
                </p>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); setEditingSession({ ...s }); }}
                className="text-caption text-primary hover:underline mt-1"
              >
                Edit dates
              </button>
            </div>
          ))}
        </div>

        {/* Terms list */}
        <div className="tablet:col-span-2">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-h3 font-bold">Terms</h2>
            {selSession && (
              <Button size="sm" onClick={() => setShowT(true)}>Add Term</Button>
            )}
          </div>

          {!selSession && (
            <p className="text-caption text-text-muted py-4">← Select a session to view its terms.</p>
          )}

          {showT && (
            <Card variant="bordered" className="mb-3">
              <form onSubmit={createTerm} className="space-y-4">
                <h3 className="text-h3 font-bold">New Term</h3>
                <Input label="Term Name" value={tName} onChange={(e) => setTName(e.target.value)} placeholder="First Term" hint="Example: First Term, Second Term" required />
                <div className="grid grid-cols-1 tablet:grid-cols-2 gap-4">
                  <Input label="Start Date" type="date" value={tStart} onChange={(e) => setTStart(e.target.value)} required />
                  <Input label="End Date" type="date" value={tEnd} onChange={(e) => setTEnd(e.target.value)} required />
                </div>
                <div className="flex gap-3">
                  <Button type="submit" loading={saving}>Create</Button>
                  <Button variant="ghost" onClick={() => setShowT(false)}>Cancel</Button>
                </div>
              </form>
            </Card>
          )}

          {/* Edit Term Modal */}
          {editingTerm && (
            <Card variant="bordered" className="border-primary mb-3">
              <div className="space-y-4">
                <h3 className="text-h3 font-bold">Edit Term</h3>
                <Input label="Term Name" value={editingTerm.name} onChange={(e) => setEditingTerm({ ...editingTerm, name: e.target.value })} required />
                <div className="grid grid-cols-1 tablet:grid-cols-2 gap-4">
                  <Input label="Start Date" type="date" value={editingTerm.start_date?.slice(0, 10)} onChange={(e) => setEditingTerm({ ...editingTerm, start_date: e.target.value })} required />
                  <Input label="End Date" type="date" value={editingTerm.end_date?.slice(0, 10)} onChange={(e) => setEditingTerm({ ...editingTerm, end_date: e.target.value })} required />
                </div>
                <div className="flex gap-3">
                  <Button onClick={saveTerm} loading={saving}>Save Changes</Button>
                  <Button variant="ghost" onClick={() => setEditingTerm(null)}>Cancel</Button>
                </div>
              </div>
            </Card>
          )}

          {terms.map((t) => (
            <div key={t.id} className="flex items-start justify-between p-3 bg-surface border border-border rounded-lg mb-2">
              <div>
                <p className="text-body font-semibold">{t.name}</p>
                <p className="text-caption text-text-muted">
                  {t.start_date?.slice(0, 10)} — {t.end_date?.slice(0, 10)}
                </p>
                <button
                  onClick={() => setEditingTerm({ ...t })}
                  className="text-caption text-primary hover:underline mt-0.5"
                >
                  Edit dates
                </button>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Badge variant={t.is_active ? "success" : "default"}>
                  {t.is_active ? "Active" : "Inactive"}
                </Badge>
                {!t.is_active && (
                  <Button size="sm" variant="secondary" onClick={() => toggleActive(t.id)}>
                    Set Active
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
