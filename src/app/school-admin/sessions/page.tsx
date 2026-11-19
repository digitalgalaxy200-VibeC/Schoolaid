"use client";
import { useEffect, useState } from "react";
import { Button, Input, Card, Badge, Modal, toast } from "@/components/ui";
import { formatDate } from "@/lib/dates";
import { dateRangeError, durationInWeeks, splitSpan } from "@/lib/academic/term-span";

const DEFAULT_TERMS = ["First Term", "Second Term", "Third Term"];

/** First, Second, Third, then anything else in the order it arrived. */
const termOrder = (name: string) => {
  const index = DEFAULT_TERMS.findIndex(
    (term) => term.toLowerCase() === String(name).trim().toLowerCase(),
  );
  return index === -1 ? DEFAULT_TERMS.length : index;
};

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
  // Why the last save was refused, shown beside the fields it belongs to.
  const [editError, setEditError] = useState<string | null>(null);
  const [applyingToTerms, setApplyingToTerms] = useState(false);

  // Add term modal
  const [showAddTerm, setShowAddTerm] = useState(false);
  const [addTermSid, setAddTermSid] = useState("");
  const [newTermName, setNewTermName] = useState("");

  const load = () =>
    fetch("/api/school-admin/sessions")
      .then((r) => r.json())
      .then((d) => setSessions(Array.isArray(d) ? d : []))
      .catch(() => toast.error("Failed to load sessions", "Please refresh the page and try again."));
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

    const rangeError = dateRangeError(sStart, sEnd);
    if (rangeError) {
      toast.error("Check the dates", rangeError);
      return;
    }

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
    const session = await r.json().catch(() => ({}));
    if (!r.ok) {
      toast.error("Could not create session", session.error || `Server error (${r.status}). Please try again.`);
      setSaving(false);
      return;
    }

    // The three default terms are CONSECUTIVE slices of the session, not three
    // copies of it. Without this every term carried the session's own range, so
    // First, Second and Third Term all read the same dates.
    const spans =
      sStart && sEnd ? splitSpan(sStart, sEnd, DEFAULT_TERMS.length) : [];

    let termFailures = 0;
    for (let index = 0; index < DEFAULT_TERMS.length; index++) {
      const span = spans[index];
      const tr = await fetch("/api/school-admin/terms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: DEFAULT_TERMS[index],
          session_id: session.id,
          ...(span ? { start_date: span.start, end_date: span.end } : {}),
        }),
      }).catch(() => null);
      if (!tr || !tr.ok) termFailures++;
    }
    setSaving(false);
    setShowNew(false);
    setSName("");
    setSStart("");
    setSEnd("");
    showMsg("success", `${sName} created`);
    load();
    if (termFailures > 0) {
      toast.warning(
        "Some terms were not created",
        `${termFailures} of ${DEFAULT_TERMS.length} default terms failed. Add them manually from the session row.`,
      );
    }
  };

  const toggleActive = async (termId: string) => {
    const r = await fetch("/api/school-admin/terms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: termId, is_active: true }),
    });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      toast.error("Could not activate term", d.error || `Server error (${r.status}). Please try again.`);
      return;
    }
    load();
  };

  const saveTermEdit = async () => {
    if (!editTerm) return;
    const rangeError = dateRangeError(editTerm.start_date, editTerm.end_date);
    if (rangeError) {
      setEditError(rangeError);
      return;
    }

    setSaving(true);
    setEditError(null);
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
      const d = await r.json().catch(() => ({}));
      toast.error("Could not update term", d.error || `Server error (${r.status}). Please try again.`);
    }
  };

  const saveSessionEdit = async () => {
    if (!editSession) return;
    const rangeError = dateRangeError(editSession.start_date, editSession.end_date);
    if (rangeError) {
      setEditError(rangeError);
      return;
    }

    setSaving(true);
    setEditError(null);
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
      const d = await r.json().catch(() => ({}));
      toast.error("Could not update session", d.error || `Server error (${r.status}). Please try again.`);
    }
  };

  /**
   * Give every term a consecutive slice of the session's range — the same split
   * used when the session is created. Derived, never invented.
   */
  const applyDatesToTerms = async () => {
    if (!editSession) return;

    const rangeError = dateRangeError(editSession.start_date, editSession.end_date);
    if (rangeError) {
      setEditError(rangeError);
      return;
    }

    const terms = [...(editSession.terms || [])].sort(
      (a: { name?: string }, b: { name?: string }) =>
        termOrder(a.name ?? "") - termOrder(b.name ?? ""),
    );
    if (terms.length === 0) {
      setEditError("This session has no terms to date.");
      return;
    }

    const spans = splitSpan(editSession.start_date, editSession.end_date, terms.length);
    if (spans.length === 0) {
      setEditError("Give the session a start and end date first.");
      return;
    }

    setApplyingToTerms(true);
    setEditError(null);
    try {
      for (let index = 0; index < terms.length; index++) {
        const res = await fetch("/api/school-admin/terms", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: terms[index].id,
            start_date: spans[index].start,
            end_date: spans[index].end,
          }),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.error || `Could not update ${terms[index].name} (${res.status}).`);
        }
      }
      setEditSession(null);
      load();
      showMsg("success", "Term dates spread across the session");
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Could not update the terms.");
    } finally {
      setApplyingToTerms(false);
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
    const r = await fetch("/api/school-admin/terms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newTermName.trim(),
        session_id: addTermSid,
      }),
    });
    setSaving(false);
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      toast.error("Could not add term", d.error || `Server error (${r.status}). Please try again.`);
      return;
    }
    setShowAddTerm(false);
    load();
    showMsg("success", "Term added");
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap gap-3 items-center justify-between">
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
        <Card variant="default" className="shadow-sm">
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
            <div className="grid grid-cols-1 tablet:grid-cols-2 gap-4">
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
        <Card variant="default" className="shadow-sm border-primary">
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

      {/* Edit Session — dates and duration */}
      <Modal
        isOpen={!!editSession}
        onClose={() => {
          setEditSession(null);
          setEditError(null);
        }}
        title="Edit Session"
        size="md"
      >
        {editSession && (
          <div className="space-y-4">
            <Input
              label="Session name"
              value={editSession.name}
              onChange={(e) => setEditSession({ ...editSession, name: e.target.value })}
            />
            <div className="grid grid-cols-1 tablet:grid-cols-2 gap-4">
              <Input
                label="Start date"
                type="date"
                value={editSession.start_date?.slice(0, 10) || ""}
                onChange={(e) => {
                  setEditError(null);
                  setEditSession({ ...editSession, start_date: e.target.value });
                }}
              />
              <Input
                label="End date"
                type="date"
                value={editSession.end_date?.slice(0, 10) || ""}
                onChange={(e) => {
                  setEditError(null);
                  setEditSession({ ...editSession, end_date: e.target.value });
                }}
              />
            </div>

            <p className="text-caption text-text-muted">
              {durationInWeeks(editSession.start_date, editSession.end_date) ?? 0} weeks. Its terms
              keep their own dates until you choose to spread these across them.
            </p>

            {editError ? <p className="text-caption font-medium text-error">{editError}</p> : null}

            <div className="flex flex-wrap gap-3">
              <Button onClick={saveSessionEdit} loading={saving}>
                Save
              </Button>
              <Button
                variant="secondary"
                onClick={applyDatesToTerms}
                loading={applyingToTerms}
              >
                Spread dates across {editSession.terms?.length || 3} terms
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setEditSession(null);
                  setEditError(null);
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Edit Term — dates and duration */}
      <Modal
        isOpen={!!editTerm}
        onClose={() => {
          setEditTerm(null);
          setEditError(null);
        }}
        title="Edit Term"
        size="md"
      >
        {editTerm && (
          <div className="space-y-4">
            <Input
              label="Term name"
              value={editTerm.name}
              onChange={(e) => setEditTerm({ ...editTerm, name: e.target.value })}
            />
            <div className="grid grid-cols-1 tablet:grid-cols-2 gap-4">
              <Input
                label="Start date"
                type="date"
                value={editTerm.start_date?.slice(0, 10) || ""}
                onChange={(e) => {
                  setEditError(null);
                  setEditTerm({ ...editTerm, start_date: e.target.value });
                }}
              />
              <Input
                label="End date"
                type="date"
                value={editTerm.end_date?.slice(0, 10) || ""}
                onChange={(e) => {
                  setEditError(null);
                  setEditTerm({ ...editTerm, end_date: e.target.value });
                }}
              />
            </div>

            <p className="text-caption text-text-muted">
              {durationInWeeks(editTerm.start_date, editTerm.end_date) ?? 0} weeks long.
            </p>

            {editError ? <p className="text-caption font-medium text-error">{editError}</p> : null}

            <div className="flex gap-3">
              <Button onClick={saveTermEdit} loading={saving}>
                Save
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setEditTerm(null);
                  setEditError(null);
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Session Cards */}
      {sessions.length === 0 ? (
        <Card variant="default" className="shadow-sm">
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
                variant="default"
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
                        {formatDate(session.start_date)} —{" "}
                        {formatDate(session.end_date)}
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
                              {formatDate(term.start_date)} — {formatDate(term.end_date)}
                              {durationInWeeks(term.start_date, term.end_date)
                                ? ` · ${durationInWeeks(term.start_date, term.end_date)} weeks`
                                : ""}
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
