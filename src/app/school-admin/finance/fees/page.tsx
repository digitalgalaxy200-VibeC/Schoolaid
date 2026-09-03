"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, Button, Input, Badge, showToast } from "@/components/ui";
import { money, fetchArray } from "@/components/finance/helpers";

type FeeHead = { id: string; name: string; description: string | null; is_compulsory: boolean; is_active: boolean };
type Section = { id: string | null; name: string; classes: { id: string; name: string }[] };
type TermFee = {
  id: string;
  fee_head_id: string;
  default_amount: number;
  fee_type: string;
  is_active: boolean;
  fee_heads: { id: string; name: string; is_compulsory: boolean } | { id: string; name: string; is_compulsory: boolean }[] | null;
};
type ClassFee = {
  id: string;
  term_fee_id: string;
  class_id: string;
  amount: number;
  term_fees: { fee_head_id: string; default_amount: number; fee_type: string; fee_heads: { id: string; name: string } | { id: string; name: string }[] | null } | { fee_head_id: string; default_amount: number; fee_type: string; fee_heads: { id: string; name: string } | { id: string; name: string }[] | null }[] | null;
};

const SUBTABS = [
  { key: "heads", label: "Fee Heads" },
  { key: "defaults", label: "Section Defaults" },
  { key: "classes", label: "Class Pricing" },
];

export default function FinanceFeesPage() {
  const [tab, setTab] = useState("heads");
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
      {tab === "heads" && <FeeHeads />}
      {tab === "defaults" && <SectionDefaults />}
      {tab === "classes" && <ClassPricing />}
    </div>
  );
}

/* ── Fee Heads ─────────────────────────────────────────── */
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
      body: JSON.stringify({ name, is_compulsory: compulsory }),
    });
    const d = await res.json().catch(() => ({}));
    if (res.ok) {
      showToast({ type: "success", title: "Fee head added" });
      setName("");
      setCompulsory(true);
      load();
    } else {
      showToast({ type: "error", title: d?.error || "Failed" });
    }
    setBusy(false);
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

/* ── Section Defaults ──────────────────────────────────── */
function SectionDefaults() {
  const [sections, setSections] = useState<Section[]>([]);
  const [sectionId, setSectionId] = useState<string>("null");
  const [defaults, setDefaults] = useState<TermFee[]>([]);
  const [heads, setHeads] = useState<FeeHead[]>([]);
  const [newHeadId, setNewHeadId] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [newRequired, setNewRequired] = useState(true);
  const [replaceOverrides, setReplaceOverrides] = useState(false);

  const loadSections = useCallback(() => {
    fetchArray<Section>("/api/school-admin/finance/sections").then(setSections);
  }, []);
  useEffect(() => loadSections(), [loadSections]);

  const load = useCallback(() => {
    fetchArray<FeeHead>("/api/school-admin/finance/fee-heads").then(setHeads);
    fetchArray<TermFee>(`/api/school-admin/finance/term-fees?section_id=${sectionId}`).then(setDefaults);
  }, [sectionId]);
  useEffect(() => load(), [load]);

  const chosen = sections.find((s) => s.id === sectionId) || (sectionId === "null" ? { id: null as string | null, name: "School-wide (all classes)", classes: [] } : null);

  const addDefault = async () => {
    if (!newHeadId) return;
    const res = await fetch("/api/school-admin/finance/term-fees", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        academic_section_id: sectionId === "null" ? null : sectionId,
        fee_head_id: newHeadId,
        default_amount: Number(newAmount || 0),
        fee_type: newRequired ? "Required" : "Not Required",
      }),
    });
    const d = await res.json().catch(() => ({}));
    if (res.ok) {
      showToast({ type: "success", title: "Default added" });
      setNewHeadId("");
      setNewAmount("");
      load();
    } else {
      showToast({ type: "error", title: d?.error || "Failed" });
    }
  };

  const update = async (id: string, patch: Record<string, unknown>) => {
    const res = await fetch("/api/school-admin/finance/term-fees", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      showToast({ type: "error", title: d?.error || "Failed" });
    }
    load();
  };

  const applyToClasses = async (tf: TermFee) => {
    const res = await fetch("/api/school-admin/finance/class-fees/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        term_fee_id: tf.id,
        section_id: sectionId === "null" ? null : sectionId,
        replace: replaceOverrides,
      }),
    });
    const d = await res.json().catch(() => ({}));
    if (res.ok) {
      showToast({ type: "success", title: `Applied — ${d.created || 0} created, ${d.skipped || 0} kept, ${d.updated || 0} updated` });
    } else {
      showToast({ type: "error", title: d?.error || "Failed" });
    }
  };

  const availableHeads = heads.filter((h) => !defaults.some((t) => t.fee_head_id === h.id));

  return (
    <div className="space-y-4">
      {/* Scope picker */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        <button
          onClick={() => setSectionId("null")}
          className={`px-4 py-2 rounded-full text-caption font-semibold whitespace-nowrap border ${
            sectionId === "null" ? "bg-primary text-text-inverse border-primary" : "bg-surface text-text-secondary border-border"
          }`}
        >
          School-wide
        </button>
        {sections.map((s) => (
          <button
            key={s.id || "unassigned"}
            onClick={() => setSectionId(s.id || "null")}
            className={`px-4 py-2 rounded-full text-caption font-semibold whitespace-nowrap border ${
              sectionId === s.id ? "bg-primary text-text-inverse border-primary" : "bg-surface text-text-secondary border-border"
            }`}
          >
            {s.name}
          </button>
        ))}
      </div>

      <Card padding="md">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
          <p className="font-semibold text-text-primary">{chosen?.name || "Section"} — default fees</p>
          {chosen?.classes?.length ? (
            <span className="text-caption text-text-secondary">{chosen.classes.length} classes</span>
          ) : null}
        </div>

        <div className="space-y-2">
          {defaults.filter((t) => t.is_active !== false).map((tf) => (
            <div key={tf.id} className="flex flex-col tablet:flex-row tablet:items-center gap-2 rounded-lg bg-clay px-3 py-3">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-text-primary truncate">
                  {Array.isArray(tf.fee_heads) ? tf.fee_heads[0]?.name : tf.fee_heads?.name || "Fee"}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-caption text-text-secondary">₦</span>
                <Input
                  type="number"
                  defaultValue={Number(tf.default_amount) || 0}
                  className="w-28"
                  onBlur={(e) => {
                    const v = Number(e.target.value);
                    if (Number.isFinite(v) && v !== Number(tf.default_amount)) update(tf.id, { default_amount: v });
                  }}
                />
                <button
                  onClick={() => update(tf.id, { fee_type: tf.fee_type === "Required" ? "Not Required" : "Required" })}
                  className="text-caption"
                >
                  <Badge variant={tf.fee_type === "Required" ? "info" : "default"}>{tf.fee_type}</Badge>
                </button>
                <button onClick={() => update(tf.id, { is_active: false })} className="text-caption font-semibold text-error underline">
                  Disable
                </button>
                <Button size="sm" variant="secondary" onClick={() => applyToClasses(tf)}>
                  Apply to classes
                </Button>
              </div>
            </div>
          ))}
          {defaults.length === 0 && (
            <p className="text-caption text-text-secondary text-center py-4">
              No defaults set yet — add one below.
            </p>
          )}
        </div>

        {/* Add default */}
        <div className="mt-4 pt-4 border-t border-border flex flex-col tablet:flex-row gap-2 items-end">
          <div className="flex-1 w-full">
            <label className="text-caption text-text-secondary block mb-1">Fee head</label>
            <select
              value={newHeadId}
              onChange={(e) => setNewHeadId(e.target.value)}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-body text-text-primary focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">Select a fee head…</option>
              {availableHeads.map((h) => (
                <option key={h.id} value={h.id}>{h.name}</option>
              ))}
            </select>
          </div>
          <div className="w-full tablet:w-28">
            <label className="text-caption text-text-secondary block mb-1">Amount</label>
            <Input type="number" value={newAmount} onChange={(e) => setNewAmount(e.target.value)} placeholder="0" />
          </div>
          <label className="flex items-center gap-2 text-caption text-text-secondary pb-2 whitespace-nowrap">
            <input type="checkbox" checked={newRequired} onChange={(e) => setNewRequired(e.target.checked)} className="h-4 w-4 accent-primary" />
            Required
          </label>
          <Button onClick={addDefault} disabled={!newHeadId}>Add default</Button>
        </div>

        {chosen?.classes?.length ? (
          <label className="flex items-center gap-2 mt-3 text-caption text-text-secondary">
            <input type="checkbox" checked={replaceOverrides} onChange={(e) => setReplaceOverrides(e.target.checked)} className="h-4 w-4 accent-primary" />
            Replace existing class overrides when applying
          </label>
        ) : null}
      </Card>
    </div>
  );
}

/* ── Class Pricing (overrides) ─────────────────────────── */
function ClassPricing() {
  const [classes, setClasses] = useState<{ id: string; name: string }[]>([]);
  const [classId, setClassId] = useState("");
  const [overrides, setOverrides] = useState<ClassFee[]>([]);
  const [defaults, setDefaults] = useState<TermFee[]>([]);
  const [newTfId, setNewTfId] = useState("");
  const [newAmount, setNewAmount] = useState("");

  const loadClasses = useCallback(() => {
    fetchArray<Section>("/api/school-admin/finance/sections").then((secs) => {
      const flat: { id: string; name: string }[] = [];
      for (const s of secs) for (const c of s.classes) flat.push(c);
      setClasses(flat);
    });
  }, []);
  useEffect(() => loadClasses(), [loadClasses]);

  const load = useCallback(() => {
    if (!classId) return;
    fetchArray<ClassFee>(`/api/school-admin/finance/class-fees?class_id=${classId}`).then(setOverrides);
    fetchArray<TermFee>("/api/school-admin/finance/term-fees").then(setDefaults);
  }, [classId]);
  useEffect(() => load(), [load]);

  const addOverride = async () => {
    if (!newTfId) return;
    const res = await fetch("/api/school-admin/finance/class-fees", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ term_fee_id: newTfId, class_id: classId, amount: Number(newAmount || 0) }),
    });
    const d = await res.json().catch(() => ({}));
    if (res.ok) {
      showToast({ type: "success", title: "Override added" });
      setNewTfId("");
      setNewAmount("");
      load();
    } else {
      showToast({ type: "error", title: d?.error || "Failed" });
    }
  };

  const update = async (id: string, amount: number) => {
    await fetch("/api/school-admin/finance/class-fees", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, amount }),
    });
    load();
  };

  const remove = async (id: string) => {
    await fetch(`/api/school-admin/finance/class-fees?id=${id}`, { method: "DELETE" });
    load();
  };

  const nameOf = (tf: TermFee["fee_heads"]) => (Array.isArray(tf) ? tf[0]?.name : tf?.name) || "Fee";
  // Class-fee rows carry term_fees → fee_heads nested; dig out the fee name.
  const feeNameOf = (tf: ClassFee["term_fees"]): string => {
    const t = Array.isArray(tf) ? tf[0] : tf;
    if (!t) return "Fee";
    const fh = Array.isArray(t.fee_heads) ? t.fee_heads[0] : t.fee_heads;
    return fh?.name || "Fee";
  };
  const tfById = (id: string) => defaults.find((t) => t.id === id);
  const availableDefaults = defaults.filter((t) => !overrides.some((o) => o.term_fee_id === t.id));

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center gap-2">
        <select
          value={classId}
          onChange={(e) => setClassId(e.target.value)}
          className="flex-1 rounded-md border border-border bg-surface px-3 py-2 text-body text-text-primary focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="">Select a class…</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      {classId && (
        <>
          <p className="text-caption text-text-secondary">
            Fees shown here override this class's default. Fees without an override automatically use the section/school default.
          </p>
          <Card padding="md">
            <div className="space-y-2">
              {overrides.map((o) => (
                <div key={o.id} className="flex items-center gap-2 rounded-lg bg-clay px-3 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-text-primary truncate">{feeNameOf(o.term_fees)}</p>
                    <p className="text-caption text-text-disabled">Default: {money(tfById(o.term_fee_id)?.default_amount ?? 0)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-caption text-text-secondary">₦</span>
                    <Input
                      type="number"
                      defaultValue={Number(o.amount)}
                      className="w-28"
                      onBlur={(e) => {
                        const v = Number(e.target.value);
                        if (Number.isFinite(v) && v !== Number(o.amount)) update(o.id, v);
                      }}
                    />
                    <button onClick={() => remove(o.id)} className="text-caption font-semibold text-error underline whitespace-nowrap">
                      Remove
                    </button>
                  </div>
                </div>
              ))}
              {overrides.length === 0 && (
                <p className="text-caption text-text-secondary text-center py-3">No overrides yet — this class uses the defaults.</p>
              )}
            </div>

            <div className="mt-4 pt-4 border-t border-border flex flex-col tablet:flex-row gap-2 items-end">
              <div className="flex-1 w-full">
                <label className="text-caption text-text-secondary block mb-1">Fee</label>
                <select
                  value={newTfId}
                  onChange={(e) => setNewTfId(e.target.value)}
                  className="w-full rounded-md border border-border bg-surface px-3 py-2 text-body focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">Select a fee…</option>
                  {availableDefaults.map((t) => (
                    <option key={t.id} value={t.id}>{nameOf(t.fee_heads)}</option>
                  ))}
                </select>
              </div>
              <div className="w-full tablet:w-28">
                <label className="text-caption text-text-secondary block mb-1">Amount</label>
                <Input type="number" value={newAmount} onChange={(e) => setNewAmount(e.target.value)} placeholder="0" />
              </div>
              <Button onClick={addOverride} disabled={!newTfId || !classId}>Add override</Button>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
