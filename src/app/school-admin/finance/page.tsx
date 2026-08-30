"use client";

import { useEffect, useState } from "react";
import { Card, Button, Input, Badge } from "@/components/ui";

const TABS = [
  { key: "dashboard", label: "📊 Dashboard" },
  { key: "fee-heads", label: "🏷️ Fee Heads" },
  { key: "templates", label: "📋 Templates" },
  { key: "pricing", label: "💰 Pricing" },
  { key: "payments", label: "💳 Payments" },
  { key: "discounts", label: "🎁 Discounts" },
  { key: "plans", label: "📅 Payment Plans" },
];

export default function FinancePage() {
  const [tab, setTab] = useState("dashboard");

  return (
    <div className="space-y-6">
      <h1 className="text-h1 font-bold">Finance</h1>

      {/* Sub-tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-sm text-small font-semibold whitespace-nowrap ${tab === t.key ? "bg-primary text-text-inverse" : "bg-surface text-text-secondary border border-border"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === "dashboard" && <FinanceDashboard />}
      {tab === "fee-heads" && <FeeHeadsTab />}
      {tab === "templates" && <TemplatesTab />}
      {tab === "pricing" && <PricingTab />}
      {tab === "payments" && <PaymentsTab />}
      {tab === "discounts" && <DiscountsTab />}
      {tab === "plans" && <PlansTab />}
    </div>
  );
}

/** ── Dashboard ── */
type FinanceStats = {
  totalCollected?: string;
  outstanding?: string;
  collectionRate?: number;
};

type FeeHead = {
  id: string;
  name: string;
  is_optional: boolean;
};

function FinanceDashboard() {
  const [stats, setStats] = useState<FinanceStats | null>(null);

  useEffect(() => {
    fetch("/api/school-admin/finance/dashboard")
      .then((r) => r.json())
      .then(setStats)
      .catch(() => {});
  }, []);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 tablet:grid-cols-3 gap-4">
        <Card variant="default" className="text-center py-6">
          <p className="text-display font-extrabold text-primary">{stats?.totalCollected ?? "—"}</p>
          <p className="text-caption text-text-muted uppercase font-mono mt-1">Total Collected</p>
        </Card>
        <Card variant="default" className="text-center py-6">
          <p className="text-display font-extrabold text-warning">{stats?.outstanding ?? "—"}</p>
          <p className="text-caption text-text-muted uppercase font-mono mt-1">Outstanding</p>
        </Card>
        <Card variant="default" className="text-center py-6">
          <p className="text-display font-extrabold text-success">{stats?.collectionRate ?? "—"}%</p>
          <p className="text-caption text-text-muted uppercase font-mono mt-1">Collection Rate</p>
        </Card>
      </div>
      <Card variant="default" className="text-center py-10">
        <p className="text-small text-text-muted">Detailed reports coming soon.</p>
      </Card>
    </div>
  );
}

/** ── Fee Heads ── */
function FeeHeadsTab() {
  const [items, setItems] = useState<FeeHead[]>([]);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [optional, setOptional] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const load = () => fetch("/api/school-admin/finance/fee-heads").then((r) => r.json()).then(setItems);
  useEffect(() => { load(); }, []);

  const add = async () => {
    if (!name.trim()) return;
    setSaving(true);
    const res = await fetch("/api/school-admin/finance/fee-heads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description: desc, is_optional: optional }),
    });
    const data = await res.json().catch(() => ({}));
    setMsg({ type: res.ok ? "success" : "error", text: res.ok ? "Added" : (data.error || "Failed") });
    if (res.ok) { setName(""); setDesc(""); setOptional(false); load(); }
    setTimeout(() => setMsg(null), 2000);
    setSaving(false);
  };

  return (
    <div className="space-y-4 max-w-xl">
      {msg && <div className={`px-4 py-2 rounded-sm text-small font-medium ${msg.type === "success" ? "bg-success-bg text-success" : "bg-error-bg text-error"}`}>{msg.text}</div>}
      <Card variant="default">
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <label className="text-caption text-text-muted block mb-1">Fee Name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Tuition, ICT, Sports" />
          </div>
          <label className="flex items-center gap-1 text-small cursor-pointer pb-2">
            <input type="checkbox" checked={optional} onChange={(e) => setOptional(e.target.checked)} /> Optional
          </label>
          <Button onClick={add} loading={saving}>Add</Button>
        </div>
      </Card>
      <Card variant="default">
        {items.length === 0 ? <p className="text-small text-text-muted py-4 text-center">No fee heads yet.</p> : (
          <div className="space-y-2">
            {items.map((f: FeeHead) => (
              <div key={f.id} className="flex justify-between items-center p-3 bg-bg rounded-sm">
                <div>
                  <span className="font-semibold">{f.name}</span>
                  {f.is_optional && <Badge variant="draft" className="ml-2">Optional</Badge>}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

/** ── Templates (placeholder) ── */
function TemplatesTab() {
  return <Card variant="default" className="text-center py-10"><p className="text-small text-text-muted">Fee Templates — coming next.</p></Card>;
}

/** ── Pricing (placeholder) ── */
function PricingTab() {
  return <Card variant="default" className="text-center py-10"><p className="text-small text-text-muted">Section Defaults & Class Overrides — coming next.</p></Card>;
}

/** ── Payments (placeholder) ── */
function PaymentsTab() {
  return <Card variant="default" className="text-center py-10"><p className="text-small text-text-muted">Payment Recording — coming next.</p></Card>;
}

/** ── Discounts (placeholder) ── */
function DiscountsTab() {
  return <Card variant="default" className="text-center py-10"><p className="text-small text-text-muted">Discount Engine — coming next.</p></Card>;
}

/** ── Plans (placeholder) ── */
function PlansTab() {
  return <Card variant="default" className="text-center py-10"><p className="text-small text-text-muted">Payment Plans — coming next.</p></Card>;
}
