"use client";
import { useEffect, useState } from "react";
import { Button, Input, Card, Badge } from "@/components/ui";

const DEFAULT_TERMS = ["First Term", "Second Term", "Third Term"];

export default function SessionsPage() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [sName, setSName] = useState("");
  const [sStart, setSStart] = useState("");
  const [sEnd, setSEnd] = useState("");
  const [msg, setMsg] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  // Edit states
  const [editTerm, setEditTerm] = useState<any | null>(null);
  const [editSession, setEditSession] = useState<any | null>(null);

  // Add term modal
  const [showAddTerm, setShowAddTerm] = useState(false);
  const [addTermSid, setAddTermSid] = useState("");
  const [newTermName, setNewTermName] = useState("");

  const load = () =>
    fetch("/api/school-admin/sessions")
      .then((r) => r.json())
      .then((d) => setSessions(Array.isArray(d) ? d : []));
  useEffect(() => {
    load();
  }, []);

  const showMsg = (type: "success" | "error", text: string) => {
    setMsg({ type, text });
    setTimeout(() => setMsg(null), 3000);
  };

  const createSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sName.trim()) return;
    setSaving(true);
    const r = await fetch("/api/school-admin/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: sName.trim(),
        start_date: sStart || null,
        end_date: sEnd || null,
      }),
    });
    const session = await r.json();
    if (!r.ok) {
      showMsg("error", session.error);
      setSaving(false);
      return;
    }

    for (const termName of DEFAULT_TERMS) {
      await fetch("/api/school-admin/terms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: termName,
          start_date: null,
          end_date: null,
          academic_session_id: session.id,
        }),
      });
    }
    setSaving(false);
    setShowNew(false);
    setSName("");
    setSStart("");
    setSEnd("");
    showMsg("success", `${sName} created with 3 terms`);
    load();
  };

  const toggleActive = async (termId: string) => {
    await fetch("/api/school-admin/terms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: termId, is_active: true }),
    });
    load();
  };

  const saveTermEdit = async () => {
    if (!editTerm) return;
    setSaving(true);
    const r = await fetch("/api/school-admin/terms", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: editTerm.id,
        name: editTerm.name,
        start_date: editTerm.start_date || null,
        end_date: editTerm.end_date || null,
      }),
    });
    setSaving(false);
    if (r.ok) {
      setEditTerm(null);
      load();
      showMsg("success", "Term updated");
    } else {
      const d = await r.json();
      showMsg("error", d.error);
    }
  };

  const saveSessionEdit = async () => {
    if (!editSession) return;
    setSaving(true);
    const r = await fetch("/api/school-admin/sessions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: editSession.id,
        name: editSession.name,
        start_date: editSession.start_date || null,
        end_date: editSession.end_date || null,
      }),
    });
    setSaving(false);
    if (r.ok) {
      setEditSession(null);
      load();
      showMsg("success", "Session updated");
    } else {
      const d = await r.json();
      showMsg("error", d.error);
    }
  };

  const openAddTerm = (sid: string) => {
    setAddTermSid(sid);
    setNewTermName("");
    setShowAddTerm(true);
  };

  const addTerm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTermName.trim()) return;
    setSaving(true);
    await fetch("/api/school-admin/terms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newTermName.trim(),
        start_date: null,
        end_date: null,
        academic_session_id: addTermSid,
      }),
    });
    setSaving(false);
    setShowAddTerm(false);
    load();
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-h1 font-bold">Sessions &amp; Terms</h1>
          <p className="text-small text-text-muted mt-1">
            Each session auto-creates First, Second, and Third Term
          </p>
        </div>
        <Button onClick={() => setShowNew(true)}>New Session</Button>
      </div>

      {msg && (
        <div
          className={`px-4 py-3 rounded-sm text-small font-medium ${msg.type === "success" ? "bg-success-bg text-success border border-success" : "bg-error-bg text-error border border-error"}`}
        >
          {msg.text}
        </div>
      )}

      {/* New Session Form */}
      {showNew && (
        <Card variant="bordered" className="shadow-sm">
          <form onSubmit={createSession} className="p-5 space-y-4">
            <h3 className="text-h3 font-bold">Create Academic Session</h3>
            <p className="text-caption text-text-muted">
              First, Second, and Third Term will be created automatically.
            </p>
            <Input
              label="Session Name"
              value={sName}
              onChange={(e) => setSName(e.target.value)}
              placeholder="2025/2026"
              hint="Example: 2025/2026"
              required
            />
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Start Date (optional)"
                type="date"
                value={sStart}
                onChange={(e) => setSStart(e.target.value)}
              />
              <Input
                label="End Date (optional)"
                type="date"
                value={sEnd}
                onChange={(e) => setSEnd(e.target.value)}
              />
            </div>
            <div className="flex gap-3">
              <Button type="submit" loading={saving}>
                Create Session &amp; Terms
              </Button>
              <Button variant="ghost" onClick={() => setShowNew(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Add Term Modal */}
      {showAddTerm && (
        <Card variant="bordered" className="shadow-sm border-primary">
          <form onSubmit={addTerm} className="p-5 space-y-4">
            <h3 className="text-h3 font-bold">Add Term</h3>
            <Input
              label="Term Name"
              value={newTermName}
              onChange={(e) => setNewTermName(e.target.value)}
              placeholder="e.g. Summer Term"
              required
            />
            <div className="flex gap-3">
              <Button type="submit" loading={saving}>
                Add Term
              </Button>
              <Button variant="ghost" onClick={() => setShowAddTerm(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Edit Session Modal */}
      {editSession && (
        <Card variant="bordered" className="shadow-sm border-primary">
          <div className="p-5 space-y-4">
            <h3 className="text-h3 font-bold">Edit Session</h3>
            <Input
              label="Name"
              value={editSession.name}
              onChange={(e) =>
                setEditSession({ ...editSession, name: e.target.value })
              }
            />
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Start Date"
                type="date"
                value={editSession.start_date?.slice(0, 10) || ""}
                onChange={(e) =>
                  setEditSession({ ...editSession, start_date: e.target.value })
                }
              />
              <Input
                label="End Date"
                type="date"
                value={editSession.end_date?.slice(0, 10) || ""}
                onChange={(e) =>
                  setEditSession({ ...editSession, end_date: e.target.value })
                }
              />
            </div>
            <div className="flex gap-3">
              <Button onClick={saveSessionEdit} loading={saving}>
                Save
              </Button>
              <Button variant="ghost" onClick={() => setEditSession(null)}>
                Cancel
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Edit Term Modal */}
      {editTerm && (
        <Card variant="bordered" className="shadow-sm border-primary">
          <div className="p-5 space-y-4">
            <h3 className="text-h3 font-bold">Edit Term</h3>
            <Input
              label="Name"
              value={editTerm.name}
              onChange={(e) =>
                setEditTerm({ ...editTerm, name: e.target.value })
              }
            />
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Start Date"
                type="date"
                value={editTerm.start_date?.slice(0, 10) || ""}
                onChange={(e) =>
                  setEditTerm({ ...editTerm, start_date: e.target.value })
                }
              />
              <Input
                label="End Date"
                type="date"
                value={editTerm.end_date?.slice(0, 10) || ""}
                onChange={(e) =>
                  setEditTerm({ ...editTerm, end_date: e.target.value })
                }
              />
            </div>
            <div className="flex gap-3">
              <Button onClick={saveTermEdit} loading={saving}>
                Save
              </Button>
              <Button variant="ghost" onClick={() => setEditTerm(null)}>
                Cancel
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Session Cards */}
      {sessions.length === 0 ? (
        <Card variant="bordered" className="shadow-sm">
          <p className="text-small text-text-muted py-12 text-center">
            No sessions yet. Create one above.
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          {sessions.map((session) => {
            const terms = session.terms || [];
            const hasActive = terms.some((t: any) => t.is_active);
            return (
              <Card
                key={session.id}
                variant="bordered"
                className="shadow-sm overflow-hidden"
              >
                <div
                  onClick={() =>
                    setExpanded(expanded === session.id ? null : session.id)
                  }
                  className="p-5 cursor-pointer hover:bg-bg transition-colors flex items-center justify-between"
                >
                  <div>
                    <div className="flex items-center gap-3">
                      <h2 className="text-h2 font-bold">{session.name}</h2>
                      {hasActive && <Badge variant="success">Active</Badge>}
                    </div>
                    {session.start_date && (
                      <p className="text-caption text-text-muted mt-1">
                        {new Date(session.start_date).toLocaleDateString()} —{" "}
                        {new Date(session.end_date).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-small text-text-muted">
                      {terms.length} terms
                    </span>
                    <span
                      className={`text-h3 transition-transform ${expanded === session.id ? "rotate-90" : ""}`}
                    >
                      ›
                    </span>
                  </div>
                </div>
                {expanded === session.id && (
                  <div className="border-t border-border px-5 py-4 bg-bg/50 space-y-2 animate-fade-in">
                    <div className="flex justify-between items-center mb-2">
                      <p className="text-caption text-text-muted uppercase font-semibold">
                        Terms
                      </p>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditSession({ ...session });
                          }}
                        >
                          Edit Session
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            openAddTerm(session.id);
                          }}
                        >
                          + Add Term
                        </Button>
                      </div>
                    </div>
                    {terms.map((term: any) => (
                      <div
                        key={term.id}
                        className="flex items-center justify-between p-3 bg-surface rounded-sm border border-border"
                      >
                        <div>
                          <p className="font-semibold text-body">{term.name}</p>
                          {term.start_date && (
                            <p className="text-caption text-text-muted">
                              {term.start_date?.slice(0, 10)} —{" "}
                              {term.end_date?.slice(0, 10)}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {term.is_active ? (
                            <Badge variant="success">Active</Badge>
                          ) : (
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleActive(term.id);
                              }}
                            >
                              Set Active
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditTerm({ ...term });
                            }}
                          >
                            Edit
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
