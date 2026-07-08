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
  const [msg, setMsg] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const load = () =>
    fetch("/api/school-admin/sessions")
      .then((r) => r.json())
      .then((d) => setSessions(Array.isArray(d) ? d : []));
  useEffect(() => {
    load();
  }, []);

  const loadTerms = (sid: string) => {
    setSelSession(sid);
    fetch(`/api/school-admin/terms?session_id=${sid}`)
      .then((r) => r.json())
      .then((d) => setTerms(Array.isArray(d) ? d : []));
  };

  const createSession = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await fetch("/api/school-admin/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: sName, start_date: sStart, end_date: sEnd }),
    });
    if (r.ok) {
      setMsg({ type: "success", text: "Session created" });
      setShowS(false);
      load();
    } else {
      const d = await r.json();
      setMsg({ type: "error", text: d.error });
    }
  };

  const createTerm = async (e: React.FormEvent) => {
    e.preventDefault();
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
    if (r.ok) {
      setMsg({ type: "success", text: "Term created" });
      setShowT(false);
      loadTerms(selSession);
    } else {
      const d = await r.json();
      setMsg({ type: "error", text: d.error });
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
      <div className="flex justify-between">
        <h1 className="text-h1 font-bold">Sessions & Terms</h1>
        <Button onClick={() => setShowS(true)}>New Session</Button>
      </div>
      {msg && (
        <div
          className={`px-4 py-3 rounded-sm text-small font-medium ${msg.type === "success" ? "bg-success-bg text-success border border-success" : "bg-error-bg text-error border border-error"}`}
        >
          {msg.text}
        </div>
      )}

      {showS && (
        <Card variant="bordered">
          <form onSubmit={createSession} className="space-y-4">
            <Input
              label="Session Name"
              value={sName}
              onChange={(e) => setSName(e.target.value)}
              placeholder="2026/2027"
              hint="Example: 2023/2024"
              required
            />
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Start Date"
                type="date"
                value={sStart}
                onChange={(e) => setSStart(e.target.value)}
                required
              />
              <Input
                label="End Date"
                type="date"
                value={sEnd}
                onChange={(e) => setSEnd(e.target.value)}
                required
              />
            </div>
            <div className="flex gap-3">
              <Button type="submit">Create</Button>
              <Button variant="ghost" onClick={() => setShowS(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      )}

      <div className="grid grid-cols-1 tablet:grid-cols-3 gap-4">
        <div className="space-y-2">
          <h2 className="text-h3 font-bold">Sessions</h2>
          {sessions.map((s) => (
            <div
              key={s.id}
              onClick={() => loadTerms(s.id)}
              className={`p-3 rounded-sm cursor-pointer border ${selSession === s.id ? "bg-primary-light border-primary" : "bg-surface border-border hover:bg-bg"}`}
            >
              <p className="font-semibold text-small">{s.name}</p>
              <p className="text-caption text-text-muted">
                {new Date(s.start_date).toLocaleDateString()} —{" "}
                {new Date(s.end_date).toLocaleDateString()}
              </p>
            </div>
          ))}
        </div>
        <div className="tablet:col-span-2">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-h3 font-bold">Terms</h2>
            {selSession && (
              <Button size="sm" onClick={() => setShowT(true)}>
                Add Term
              </Button>
            )}
          </div>
          {showT && (
            <Card variant="bordered" className="mb-3">
              <form onSubmit={createTerm} className="space-y-4">
                <Input
                  label="Term Name"
                  value={tName}
                  onChange={(e) => setTName(e.target.value)}
                  placeholder="First Term"
                  hint="Example: First Term, Second Term"
                  required
                />
                <div className="grid grid-cols-2 gap-4">
                  <Input
                    label="Start Date"
                    type="date"
                    value={tStart}
                    onChange={(e) => setTStart(e.target.value)}
                    required
                  />
                  <Input
                    label="End Date"
                    type="date"
                    value={tEnd}
                    onChange={(e) => setTEnd(e.target.value)}
                    required
                  />
                </div>
                <div className="flex gap-3">
                  <Button type="submit">Create</Button>
                  <Button variant="ghost" onClick={() => setShowT(false)}>
                    Cancel
                  </Button>
                </div>
              </form>
            </Card>
          )}
          {terms.map((t) => (
            <div
              key={t.id}
              className="flex items-center justify-between p-3 bg-surface border border-border rounded-sm mb-2"
            >
              <div>
                <p className="text-body font-semibold">{t.name}</p>
                <p className="text-caption text-text-muted">
                  {t.start_date} — {t.end_date}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant={t.is_active ? "success" : "default"}>
                  {t.is_active ? "Active" : "Inactive"}
                </Badge>
                {!t.is_active && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => toggleActive(t.id)}
                  >
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
