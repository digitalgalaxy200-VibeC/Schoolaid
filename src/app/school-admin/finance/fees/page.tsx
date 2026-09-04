"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, Button, Input, Badge, Modal, showToast } from "@/components/ui";
import { fetchArray, fetchObject } from "@/components/finance/helpers";

// Finance → Fee Setup
// Primary view: FEE MATRIX (fee heads × classes).
//   - A fee head with a default shows that amount for every class.
//   - Empty cell  = that class is not charged this fee.
//   - Set the same amount for many classes at once (bulk), then adjust.
//   - Every cell can be edited (or cleared) directly in the matrix.
// The old Section Defaults → Class Pricing two-step flow is replaced by this.

type MHead = {
  id: string;
  name: string;
  is_compulsory: boolean;
  is_active: boolean;
  default: { term_fee_id: string; amount: number } | null;
};
type MClass = { id: string; name: string; section_id: string | null };
type MSection = { id: string; name: string };
type Cell = { fee_head_id: string; class_id: string; amount: number | null; excluded: boolean };
type Matrix = { fee_heads: MHead[]; classes: MClass[]; sections: MSection[]; cells: Cell[] };

type FeeHead = { id: string; name: string; description: string | null; is_compulsory: boolean; is_active: boolean };

const SUBTABS = [
  { key: "matrix", label: "Fee Matrix" },
  { key: "heads", label: "Fee Heads" },
];

const cellKey = (headId: string, classId: string) => `${headId}:${classId}`;

export default function FinanceFeesPage() {
  const [tab, setTab] = useState("matrix");
  return (
    <div className="space-y-4">
      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        {SUBTABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-full text-caption font-semibold whitespace-nowrap border transition-colors ${
              tab === t.key ? "bg-primary text-text-inverse border-primary" : "bg-surface text-text-secondary border-border"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "matrix" && <FeeMatrix />}
      {tab === "heads" && <FeeHeads />}
    </div>
  );
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

  const load = useCallback(() => {
    fetchObject<Matrix>("/api/school-admin/finance/matrix").then((d) => {
      setData(d);
      setDrafts({});
      setLoaded(true);
    });
  }, []);
  useEffect(() => load(), [load]);

  const post = async (body: Record<string, unknown>) => {
    const res = await fetch("/api/school-admin/finance/matrix", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d?.error || "Request failed");
    return d;
  };

  const reload = () => {
    setBusy(false);
    load();
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

  const toggleCompulsory = async (h: MHead) => {
    setBusy(true);
    try {
      await post({ action: "set_compulsory", fee_head_id: h.id, is_compulsory: !h.is_compulsory });
      showToast({ type: "success", title: h.name + (h.is_compulsory ? " is now optional" : " is now required") });
      reload();
    } catch (e) {
      showToast({ type: "error", title: e instanceof Error ? e.message : "Failed" });
      setBusy(false);
    }
  };

  const commitDefault = async (h: MHead, raw: string) => {
    const v = raw.trim();
    const num = Number(v);
    if (v !== "" && (!Number.isFinite(num) || num < 0)) {
      showToast({ type: "error", title: "Enter a valid amount" });
      load();
      return;
    }
    // blank or ₦0 → no default (the row stays so per-class amounts survive)
    setBusy(true);
    try {
      await post({ action: "set_default", fee_head_id: h.id, amount: v === "" ? 0 : num });
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
    setBulkSel(new Set());
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

  return (
    <div className="space-y-4">
      {/* Summary + add */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-caption text-text-secondary">
          {heads.length} fee head{heads.length === 1 ? "" : "s"} × {allClasses.length} class{allClasses.length === 1 ? "" : "es"} — blank = class not charged this fee.
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
          <table className="w-full" style={{ minWidth: 320 + allClasses.length * 120 }}>
            <thead>
              {/* Section label row */}
              <tr className="bg-clay">
                <th className="text-left px-4 py-2 text-caption font-bold text-text-secondary uppercase tracking-wider align-bottom">
                  Fees
                  <span className="block font-normal normal-case mt-0.5">Set a class cell or use “All”</span>
                </th>
                <th className="px-3 py-2 text-caption font-bold text-primary uppercase tracking-wider align-bottom whitespace-nowrap">
                  All classes<br /><span className="font-normal normal-case text-text-secondary">(default)</span>
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
                        <button
                          onClick={() => toggleCompulsory(h)}
                          className="mt-1 inline-flex items-center gap-1 text-caption font-semibold text-primary underline"
                          disabled={busy}
                        >
                          {h.is_compulsory ? "Required" : "Optional"} · tap to change
                        </button>
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

                  {/* All-classes default */}
                  <td className="px-3 py-3">
                    <input
                      type="number"
                      min={0}
                      disabled={busy}
                      value={drafts[`default:${h.id}`] !== undefined ? drafts[`default:${h.id}`] : h.default?.amount?.toString() ?? ""}
                      placeholder="—"
                      onChange={(e) => setDrafts((d) => ({ ...d, [`default:${h.id}`]: e.target.value }))}
                      onBlur={(e) => {
                        const v = e.target.value;
                        if ((v === "" && h.default === null) || (v !== "" && Number(v) === h.default?.amount)) {
                          setDrafts((d) => {
                            const next = { ...d };
                            delete next[`default:${h.id}`];
                            return next;
                          });
                          return;
                        }
                        commitDefault(h, v);
                      }}
                      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                      className="w-24 rounded-md border border-border bg-bg px-2 py-1.5 text-body text-text-primary focus:outline-none focus:ring-2 focus:ring-primary"
                    />
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
                <td className="px-3 py-2 text-caption font-semibold text-text-secondary">—</td>
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
        Tip: set the <b>All classes</b> default first (e.g. Tuition ₦50,000) — every class shows it immediately. Then change one class,
        or use <b>Bulk…</b> on the fee to apply a different price to a group of classes at once.
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

/* ── Fee Heads (manage names, required/optional, active) ── */

function FeeHeads() {
  const [items, setItems] = useState<FeeHead[]>([]);
  const [name, setName] = useState("");
  const [compulsory, setCompulsory] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    fetchArray<FeeHead>("/api/school-admin/finance/fee-heads").then(setItems);
  }, []);
  useEffect(() => load(), [load]);

  const add = async () => {
    if (!name.trim()) return;
    setBusy(true);
    const res = await fetch("/api/school-admin/finance/fee-heads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), is_compulsory: compulsory }),
    });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) {
      showToast({ type: "success", title: "Fee head added" });
      setName("");
      setCompulsory(true);
      load();
    } else {
      showToast({ type: "error", title: d?.error || "Failed" });
    }
  };

  const toggle = async (fh: FeeHead) => {
    await fetch("/api/school-admin/finance/fee-heads", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: fh.id, is_active: !fh.is_active }),
    });
    load();
  };

  return (
    <div className="space-y-4 max-w-2xl">
      <Card padding="md">
        <div className="flex flex-col tablet:flex-row gap-3 items-end">
          <div className="flex-1 w-full">
            <label className="text-caption text-text-secondary block mb-1">Fee name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Tuition, Examination, School Bus" />
          </div>
          <label className="flex items-center gap-2 text-caption text-text-secondary pb-2 whitespace-nowrap">
            <input type="checkbox" checked={compulsory} onChange={(e) => setCompulsory(e.target.checked)} className="h-4 w-4 accent-primary" />
            Compulsory
          </label>
          <Button onClick={add} loading={busy} disabled={!name.trim()}>Add</Button>
        </div>
      </Card>

      <div className="space-y-2">
        {items.map((fh) => (
          <div key={fh.id} className="flex items-center justify-between rounded-lg bg-surface border border-border px-4 py-3">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-semibold text-text-primary truncate">{fh.name}</span>
              <Badge variant={fh.is_compulsory ? "info" : "default"}>{fh.is_compulsory ? "Required" : "Optional"}</Badge>
              {!fh.is_active && <Badge variant="error">Inactive</Badge>}
            </div>
            <button onClick={() => toggle(fh)} className="text-caption font-semibold text-primary underline whitespace-nowrap">
              {fh.is_active ? "Deactivate" : "Activate"}
            </button>
          </div>
        ))}
        {items.length === 0 && (
          <Card padding="md" className="text-center text-caption text-text-secondary">
            No fee heads yet — add your first one above.
          </Card>
        )}
      </div>
    </div>
  );
}
