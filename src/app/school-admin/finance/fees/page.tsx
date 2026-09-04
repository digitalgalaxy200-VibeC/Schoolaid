"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, Button, Input, Modal, showToast } from "@/components/ui";
import { fetchArray, fetchObject } from "@/components/finance/helpers";

// Finance → Fee Setup
// FEE MATRIX (fee heads × classes). No separate tabs, no default column.
//   - Add a fee head → its row appears; every class starts empty.
//   - Bulk… on a row = one amount for several classes (all pre-selected).
//   - Empty cell = that class is not charged this fee.
//   - Every cell can be edited (or cleared) directly in the matrix.

type MHead = {
  id: string;
  name: string;
  is_compulsory: boolean;
  is_active: boolean;
};
type MClass = { id: string; name: string; section_id: string | null };
type MSection = { id: string; name: string };
type Cell = { fee_head_id: string; class_id: string; amount: number | null; excluded: boolean };
type Matrix = {
  fee_heads: MHead[];
  classes: MClass[];
  sections: MSection[];
  cells: Cell[];
  has_config: boolean;
  template_available: boolean;
  template_head_count?: number;
};
type TermInfo = { id: string; name: string; is_active: boolean; session_id: string | null };
type SessionInfo = { id: string; name: string; terms: TermInfo[] };

const cellKey = (headId: string, classId: string) => `${headId}:${classId}`;

export default function FinanceFeesPage() {
  return <FeeMatrix />;
}

/* ── Fee Matrix ─────────────────────────────────────────── */

function FeeMatrix() {
  const [data, setData] = useState<Matrix | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  // Drafts let typing feel instant; commits happen on blur.
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  // Add-fee-head modal
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCompulsory, setNewCompulsory] = useState(true);
  const [adding, setAdding] = useState(false);

  // Bulk modal per fee head
  const [bulkHead, setBulkHead] = useState<MHead | null>(null);
  const [bulkAmount, setBulkAmount] = useState("");
  const [bulkSel, setBulkSel] = useState<Set<string>>(new Set());
  const [bulking, setBulking] = useState(false);

  // Session/Term scoping (Phase 1 — a change in one term never touches another)
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [sessionId, setSessionId] = useState("");
  const [termId, setTermId] = useState("");
  const [termLabel, setTermLabel] = useState("");
  const [metaReady, setMetaReady] = useState(false);
  const [copying, setCopying] = useState(false);

  const load = useCallback(() => {
    const q = termId ? `?term_id=${encodeURIComponent(termId)}` : "";
    fetchObject<Matrix>(`/api/school-admin/finance/matrix${q}`).then((d) => {
      setData(d);
      setDrafts({});
      setLoaded(true);
    });
  }, [termId]);
  useEffect(() => load(), [load]);

  // Load sessions/terms once; default to the school's active term.
  useEffect(() => {
    fetchArray<SessionInfo>("/api/school-admin/sessions").then((rows) => {
      setSessions(rows);
      const pairs = rows.flatMap((s) => s.terms.map((t) => ({ term: t, session: s })));
      const active = pairs.find((x) => x.term.is_active);
      const first = active || pairs[0];
      if (first) {
        setSessionId(first.session.id);
        setTermId(first.term.id);
        setTermLabel(`${first.term.name} · ${first.session.name}`);
      }
      setMetaReady(true);
    });
  }, []);

  const post = async (body: Record<string, unknown>) => {
    const res = await fetch("/api/school-admin/finance/matrix", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ term_id: termId || undefined, ...body }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d?.error || "Request failed");
    return d;
  };

  const reload = () => {
    setBusy(false);
    load();
  };

  const pickSession = (sessionIdNext: string) => {
    const s = sessions.find((x) => x.id === sessionIdNext);
    if (!s) return;
    setSessionId(s.id);
    const t0 = s.terms[0];
    if (t0) {
      setTermId(t0.id);
      setTermLabel(`${t0.name} · ${s.name}`);
    } else {
      setTermId("");
      setTermLabel(`${s.name} — no term yet`);
    }
  };

  const pickTerm = (termIdNext: string) => {
    const s = sessions.find((x) => x.id === sessionId);
    const t = s?.terms.find((x) => x.id === termIdNext);
    if (!s || !t) return;
    setTermId(t.id);
    setTermLabel(`${t.name} · ${s.name}`);
  };

  const copyTemplate = async () => {
    if (!termId) return;
    setCopying(true);
    try {
      const d = await post({ action: "copy_config", from: "template", reason: `Initial fee setup for ${termLabel}` });
      showToast({ type: "success", title: `Copied ${d?.heads || 0} saved default setup(s) into ${termLabel}` });
      load();
    } catch (e) {
      showToast({ type: "error", title: e instanceof Error ? e.message : "Copy failed" });
    } finally {
      setCopying(false);
    }
  };

  // Columns grouped by section (classes without a section sit in one block).
  const groups = useMemo(() => {
    if (!data) return [] as { label: string | null; classes: MClass[] }[];
    const out: { label: string | null; classes: MClass[] }[] = [];
    for (const sec of data.sections) {
      const members = data.classes.filter((c) => c.section_id === sec.id);
      if (members.length > 0) out.push({ label: sec.name, classes: members });
    }
    const unassigned = data.classes.filter((c) => !c.section_id || !data.sections.some((s) => s.id === c.section_id));
    if (unassigned.length > 0) out.push({ label: null, classes: unassigned });
    return out;
  }, [data]);

  const cellAmount = (headId: string, classId: string): number | null => {
    const c = data?.cells.find((x) => x.fee_head_id === headId && x.class_id === classId);
    if (!c || c.excluded) return null;
    return c.amount;
  };

  const heads = data?.fee_heads.filter((h) => h.is_active) || [];

  const addHead = async () => {
    if (!newName.trim()) return;
    setAdding(true);
    const res = await fetch("/api/school-admin/finance/fee-heads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim(), is_compulsory: newCompulsory }),
    });
    const d = await res.json().catch(() => ({}));
    setAdding(false);
    if (res.ok) {
      showToast({ type: "success", title: "Fee head added — set its amounts below" });
      setAddOpen(false);
      setNewName("");
      setNewCompulsory(true);
      load();
    } else {
      showToast({ type: "error", title: d?.error || "Failed to add fee head" });
    }
  };

  const saveCompulsory = async (h: MHead, isCompulsory: boolean) => {
    if (isCompulsory === h.is_compulsory) return;
    setBusy(true);
    try {
      await post({ action: "set_compulsory", fee_head_id: h.id, is_compulsory: isCompulsory });
      showToast({ type: "success", title: `${h.name} is now ${isCompulsory ? "required" : "optional"}` });
      reload();
    } catch (e) {
      showToast({ type: "error", title: e instanceof Error ? e.message : "Failed" });
      setBusy(false);
    }
  };

  const commitCell = async (h: MHead, c: MClass, raw: string) => {
    const v = raw.trim();
    if (v === "") {
      // blank = not needed for this class
      setBusy(true);
      try {
        await post({ action: "clear_classes", fee_head_id: h.id, class_ids: [c.id] });
        reload();
      } catch (e) {
        showToast({ type: "error", title: e instanceof Error ? e.message : "Failed" });
        setBusy(false);
      }
      return;
    }
    const num = Number(v);
    if (!Number.isFinite(num) || num < 0) {
      showToast({ type: "error", title: "Enter a valid amount" });
      load();
      return;
    }
    if (num === 0) {
      setBusy(true);
      try {
        await post({ action: "clear_classes", fee_head_id: h.id, class_ids: [c.id] });
        reload();
      } catch (e) {
        showToast({ type: "error", title: e instanceof Error ? e.message : "Failed" });
        setBusy(false);
      }
      return;
    }
    setBusy(true);
    try {
      await post({ action: "set_classes", fee_head_id: h.id, class_ids: [c.id], amount: num });
      reload();
    } catch (e) {
      showToast({ type: "error", title: e instanceof Error ? e.message : "Failed" });
      setBusy(false);
    }
  };

  const openBulk = (h: MHead) => {
    setBulkHead(h);
    setBulkAmount("");
    // Pre-select every class so “add fee → Bulk → amount → Apply” prices the whole school.
    setBulkSel(new Set((data?.classes || []).map((c) => c.id)));
  };

  const runBulk = async (mode: "set" | "clear") => {
    if (!bulkHead || bulkSel.size === 0) return;
    const amount = Number(bulkAmount);
    if (mode === "set" && (!Number.isFinite(amount) || amount <= 0)) {
      showToast({ type: "error", title: "Enter an amount greater than zero" });
      return;
    }
    setBulking(true);
    try {
      const body =
        mode === "set"
          ? { action: "set_classes", fee_head_id: bulkHead.id, class_ids: Array.from(bulkSel), amount }
          : { action: "clear_classes", fee_head_id: bulkHead.id, class_ids: Array.from(bulkSel) };
      const d = await post(body);
      showToast({ type: "success", title: mode === "set" ? `Set ${d?.updated || bulkSel.size} class(es)` : `Cleared ${d?.updated || bulkSel.size} class(es)` });
      setBulkHead(null);
      load();
    } catch (e) {
      showToast({ type: "error", title: e instanceof Error ? e.message : "Failed" });
    } finally {
      setBulking(false);
    }
  };

  if (!metaReady) return <p className="text-caption text-text-secondary py-10 text-center">Loading…</p>;

  const totalTerms = sessions.reduce((n, s) => n + s.terms.length, 0);
  if (totalTerms === 0) {
    return (
      <Card padding="md" className="text-center space-y-2">
        <p className="text-caption text-text-secondary">
          No sessions or terms yet — create them under <b>Sessions &amp; Terms</b> first, then price your fees per term.
        </p>
        <a href="/school-admin/sessions" className="inline-block text-caption font-semibold text-primary underline">
          Go to Sessions &amp; Terms →
        </a>
      </Card>
    );
  }

  if (!termId) {
    return (
      <Card padding="md" className="text-center">
        <p className="text-caption text-text-secondary">This session has no term yet — create one under Sessions &amp; Terms.</p>
      </Card>
    );
  }

  if (!loaded) return <p className="text-caption text-text-secondary py-10 text-center">Loading…</p>;

  if (!data) {
    return (
      <Card padding="md" className="text-center">
        <p className="text-caption text-text-secondary">Could not load the fee matrix. Please refresh and try again.</p>
      </Card>
    );
  }

  if (data.classes.length === 0) {
    return (
      <Card padding="md" className="text-center space-y-2">
        <p className="text-caption text-text-secondary">
          No classes yet — add classes in <b>Classes</b> first, then price your fees here.
        </p>
        <a href="/school-admin/classes" className="inline-block text-caption font-semibold text-primary underline">
          Go to Classes →
        </a>
      </Card>
    );
  }

  const allClasses = data.classes;
  const currentSession = sessions.find((s) => s.id === sessionId);

  return (
    <div className="space-y-4">
      {/* Session / Term scoping */}
      <div className="flex flex-col tablet:flex-row gap-3">
        <div>
          <label className="text-caption font-semibold text-text-secondary uppercase tracking-wider block mb-1">Session</label>
          <select
            value={sessionId}
            onChange={(e) => pickSession(e.target.value)}
            className="rounded-md border border-border bg-surface px-3 py-2 text-body text-text-primary focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-caption font-semibold text-text-secondary uppercase tracking-wider block mb-1">Term</label>
          <select
            value={termId}
            onChange={(e) => pickTerm(e.target.value)}
            className="rounded-md border border-border bg-surface px-3 py-2 text-body text-text-primary focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {(currentSession?.terms || []).map((t) => (
              <option key={t.id} value={t.id}>{t.name}{t.is_active ? " (current)" : ""}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Copy template into an empty term */}
      {data && !data.has_config && data.template_available && (
        <Card variant="clay" padding="md" className="flex flex-col tablet:flex-row items-start tablet:items-center justify-between gap-3">
          <p className="text-caption text-text-secondary">
            <b className="text-text-primary">{termLabel}</b> has no fees configured yet.
            {data.template_head_count
              ? ` Your saved default setup covers ${data.template_head_count} fee head(s) — copy it into this term to start.`
              : " Your earlier default setup is available to copy into this term."}
          </p>
          <Button size="sm" loading={copying} onClick={copyTemplate}>Copy defaults into this term</Button>
        </Card>
      )}

      {/* Summary + add */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-caption text-text-secondary">
          <b className="text-text-primary">{termLabel}</b> — {heads.length} fee head{heads.length === 1 ? "" : "s"} × {allClasses.length} class{allClasses.length === 1 ? "" : "es"}. Blank = class not charged this fee.
        </p>
        <Button size="sm" onClick={() => setAddOpen(true)}>+ Fee head</Button>
      </div>

      {heads.length === 0 ? (
        <Card padding="md" className="text-center">
          <p className="text-caption text-text-secondary">
            No fee heads yet. Add one (e.g. Tuition) and set its amount for your classes.
          </p>
        </Card>
      ) : (
        <div className="overflow-x-auto no-scrollbar rounded-lg border border-border bg-surface">
          <table className="w-full" style={{ minWidth: 200 + allClasses.length * 120 }}>
            <thead>
              {/* Section label row */}
              <tr className="bg-clay">
                <th className="text-left px-4 py-2 text-caption font-bold text-text-secondary uppercase tracking-wider align-bottom">
                  Fees
                  <span className="block font-normal normal-case mt-0.5">Amount per class — blank = not charged</span>
                </th>
                {groups.map((g) =>
                  g.classes.map((c) => (
                    <th key={c.id} className="px-3 py-2 text-caption font-bold text-text-primary whitespace-nowrap align-bottom">
                      {c.name}
                      {g.label && <span className="block font-normal text-[10px] text-text-disabled uppercase tracking-wider">{g.label}</span>}
                    </th>
                  )),
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {heads.map((h) => (
                <tr key={h.id} className="group">
                  {/* Fee head */}
                  <td className="px-4 py-3 min-w-[160px]">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold text-text-primary truncate">{h.name}</p>
                        <select
                          value={h.is_compulsory ? "Required" : "Optional"}
                          disabled={busy}
                          onChange={(e) => saveCompulsory(h, e.target.value === "Required")}
                          className="mt-1 rounded-md border border-border bg-surface px-1.5 py-1 text-caption font-semibold text-text-secondary focus:outline-none focus:ring-2 focus:ring-primary"
                        >
                          <option value="Required">Required</option>
                          <option value="Optional">Optional</option>
                        </select>
                      </div>
                      <button
                        onClick={() => openBulk(h)}
                        className="shrink-0 text-caption font-semibold text-primary underline whitespace-nowrap"
                        title="Set this fee for several classes at once"
                      >
                        Bulk…
                      </button>
                    </div>
                  </td>

                  {/* Per-class cells */}
                  {groups.map((g) =>
                    g.classes.map((c) => {
                      const eff = cellAmount(h.id, c.id);
                      const key = cellKey(h.id, c.id);
                      return (
                        <td key={key} className="px-3 py-3">
                          <input
                            type="number"
                            min={0}
                            disabled={busy}
                            placeholder="—"
                            value={drafts[key] !== undefined ? drafts[key] : eff ?? ""}
                            onChange={(e) => setDrafts((d) => ({ ...d, [key]: e.target.value }))}
                            onBlur={(e) => {
                              const v = e.target.value;
                              if ((v === "" && eff === null) || (v !== "" && Number(v) === eff)) {
                                setDrafts((d) => {
                                  const next = { ...d };
                                  delete next[key];
                                  return next;
                                });
                                return;
                              }
                              commitCell(h, c, v);
                            }}
                            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                            className={`w-24 rounded-md border px-2 py-1.5 text-body text-text-primary focus:outline-none focus:ring-2 focus:ring-primary ${
                              drafts[key] !== undefined ? "border-primary bg-primary-light" : "border-border bg-bg"
                            }`}
                          />
                        </td>
                      );
                    }),
                  )}
                </tr>
              ))}
            </tbody>
            {/* Class totals */}
            <tfoot className="border-t border-border bg-clay">
              <tr>
                <td className="px-4 py-2 text-caption font-semibold text-text-secondary uppercase tracking-wider">Totals</td>
                {groups.map((g) =>
                  g.classes.map((c) => {
                    const total = data.cells
                      .filter((x) => x.class_id === c.id && x.amount)
                      .reduce((s, x) => s + (x.amount || 0), 0);
                    return (
                      <td key={c.id} className="px-3 py-2 text-caption font-bold text-text-primary whitespace-nowrap">
                        ₦{total.toLocaleString()}
                      </td>
                    );
                  }),
                )}
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <p className="text-caption text-text-disabled">
        Tip: add a fee head, then tap <b>Bulk…</b> on its row — all classes are already selected, so type the amount and press Apply to
        price the whole school. Change one class afterwards by typing in its cell, or leave a cell blank if that class doesn’t need the fee.
      </p>

      {/* Add fee head modal */}
      <Modal isOpen={addOpen} onClose={() => setAddOpen(false)} title="Add fee head">
        <div className="space-y-4">
          <div>
            <label className="text-caption text-text-secondary block mb-1">Fee name</label>
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Tuition, Examination, School Bus" />
          </div>
          <label className="flex items-center gap-2 text-caption text-text-secondary">
            <input type="checkbox" checked={newCompulsory} onChange={(e) => setNewCompulsory(e.target.checked)} className="h-4 w-4 accent-primary" />
            Compulsory (every applicable student pays it)
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={addHead} loading={adding} disabled={!newName.trim()}>Add fee head</Button>
          </div>
        </div>
      </Modal>

      {/* Bulk modal */}
      <Modal isOpen={!!bulkHead} onClose={() => setBulkHead(null)} title={bulkHead ? `Set ${bulkHead.name} for classes` : ""}>
        {bulkHead && (
          <div className="space-y-4">
            <div>
              <label className="text-caption text-text-secondary block mb-1">Amount (₦)</label>
              <Input type="number" value={bulkAmount} onChange={(e) => setBulkAmount(e.target.value)} placeholder="e.g. 50000" min={0} />
            </div>
            <div className="flex items-center justify-between">
              <p className="text-caption font-semibold text-text-secondary uppercase tracking-wider">Classes</p>
              <button
                onClick={() =>
                  setBulkSel(bulkSel.size === allClasses.length ? new Set() : new Set(allClasses.map((c) => c.id)))
                }
                className="text-caption font-semibold text-primary underline"
              >
                {bulkSel.size === allClasses.length ? "Clear all" : `Select all (${allClasses.length})`}
              </button>
            </div>
            <div className="max-h-64 overflow-y-auto space-y-3 rounded-lg bg-clay p-3">
              {groups.map((g) => (
                <div key={g.label || "unassigned"}>
                  {g.label && (
                    <p className="text-caption font-bold text-text-secondary uppercase tracking-wider mb-1">{g.label}</p>
                  )}
                  <div className="space-y-1.5">
                    {g.classes.map((c) => (
                      <label key={c.id} className="flex items-center gap-2 text-caption text-text-primary">
                        <input
                          type="checkbox"
                          checked={bulkSel.has(c.id)}
                          onChange={(e) => {
                            const next = new Set(bulkSel);
                            if (e.target.checked) next.add(c.id);
                            else next.delete(c.id);
                            setBulkSel(next);
                          }}
                          className="h-4 w-4 accent-primary"
                        />
                        {c.name}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <p className="text-caption text-text-disabled">
              “Apply” prices the selected classes at the amount above. “Not needed” leaves them blank (they won’t be charged this fee).
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="secondary" onClick={() => runBulk("clear")} loading={bulking} disabled={bulkSel.size === 0}>
                Mark not needed
              </Button>
              <Button onClick={() => runBulk("set")} loading={bulking} disabled={bulkSel.size === 0 || !(Number(bulkAmount) > 0)}>
                Apply to {bulkSel.size} class{bulkSel.size === 1 ? "" : "es"}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
