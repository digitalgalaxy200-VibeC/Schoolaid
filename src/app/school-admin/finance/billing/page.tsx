"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Card, Button, Input, Badge, Modal, showToast } from "@/components/ui";
import { money, billStatusLabel, fetchArray } from "@/components/finance/helpers";

type Term = { id: string; name: string; is_active: boolean };
type Bill = {
  id: string;
  student_id: string;
  student_name: string;
  class_name: string | null;
  gross_amount: number;
  waiver_amount: number;
  net_amount: number;
  paid: number;
  outstanding: number;
  status: string;
};
type Preview = {
  students_total: number;
  students_with_bills: number;
  students_missing: number;
  students_no_fees: number;
  expected_by_fee: { fee: string; students: number; total: number }[];
  expected_total: number;
};

type SyncPreview = {
  term_name: string;
  students_affected: number;
  bills_affected: number;
  totals_before: number;
  totals_after: number;
  difference: number;
  overflow_total: number;
  overflow_students: number;
  examples: {
    student_name: string;
    class_name: string | null;
    net_before: number;
    net_after: number;
    changes: { fee: string; before: number; after: number }[];
  }[];
  up_to_date: boolean;
};

export default function FinanceBillingPage() {
  const [terms, setTerms] = useState<Term[]>([]);
  const [termId, setTermId] = useState("");
  const [bills, setBills] = useState<Bill[]>([]);
  const [search, setSearch] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [generating, setGenerating] = useState(false);

  // Recalculation (Phase 2): sync existing bills with the current fee setup
  const [syncOpen, setSyncOpen] = useState(false);
  const [syncPlan, setSyncPlan] = useState<SyncPreview | null>(null);
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncReason, setSyncReason] = useState("");
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    fetchArray<Term>("/api/school-admin/terms").then((rows) => {
      setTerms(rows);
      const active = rows.find((t) => t.is_active) || rows[0];
      if (active) setTermId(active.id);
    });
  }, []);

  const load = useCallback(() => {
    const q = termId ? `?term_id=${encodeURIComponent(termId)}` : "";
    fetchArray<Bill>(`/api/school-admin/finance/billing${q}`).then(setBills);
  }, [termId]);
  useEffect(() => {
    if (terms.length > 0) load();
  }, [terms, load]);

  const openPreview = async () => {
    if (!termId) return;
    setPreviewing(true);
    const res = await fetch("/api/school-admin/finance/billing/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ term_id: termId, dry_run: true }),
    });
    const d = await res.json().catch(() => null);
    setPreviewing(false);
    if (res.ok) setPreview(d);
    else showToast({ type: "error", title: d?.error || "Preview failed" });
  };

  const generate = async () => {
    if (!termId) return;
    setGenerating(true);
    const res = await fetch("/api/school-admin/finance/billing/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ term_id: termId }),
    });
    const d = await res.json().catch(() => ({}));
    setGenerating(false);
    setPreview(null);
    if (res.ok) {
      showToast({ type: "success", title: `${d.created || 0} bills generated` });
      load();
    } else {
      showToast({ type: "error", title: d?.error || "Generation failed" });
    }
  };

  const openSync = async () => {
    if (!termId) return;
    setSyncOpen(true);
    setSyncPlan(null);
    setSyncReason("");
    setSyncLoading(true);
    const res = await fetch("/api/school-admin/finance/recalc/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ term_id: termId }),
    });
    const d = await res.json().catch(() => null);
    setSyncLoading(false);
    if (res.ok) setSyncPlan(d);
    else {
      showToast({ type: "error", title: d?.error || "Preview failed" });
      setSyncOpen(false);
    }
  };

  const applySync = async () => {
    if (!termId || !syncPlan) return;
    setApplying(true);
    const res = await fetch("/api/school-admin/finance/recalc/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ term_id: termId, reason: syncReason.trim() || null }),
    });
    const d = await res.json().catch(() => ({}));
    setApplying(false);
    if (res.ok) {
      showToast({
        type: "success",
        title: `${d?.updated_bills || 0} bill(s) updated${d?.credits_created ? ` · ${d.credits_created} credit(s) created` : ""}`,
      });
      setSyncOpen(false);
      setSyncPlan(null);
      load();
    } else {
      showToast({ type: "error", title: d?.error || "Apply failed" });
    }
  };

  const filtered = bills.filter((b) => !search || b.student_name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-4">
      {/* Term + actions */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          {terms.map((t) => (
            <button
              key={t.id}
              onClick={() => setTermId(t.id)}
              className={`px-3 py-1.5 rounded-full text-caption font-semibold whitespace-nowrap border ${
                termId === t.id ? "bg-primary text-text-inverse border-primary" : "bg-surface text-text-secondary border-border"
              }`}
            >
              {t.name}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={openSync} disabled={!termId} title="Update existing bills to match the current fee setup">
            ⟳ Sync with fee setup
          </Button>
          <Button onClick={openPreview} loading={previewing} disabled={!termId}>+ Generate bills</Button>
        </div>
      </div>

      <div className="max-w-md">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search student…" />
      </div>

      {/* List */}
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <p className="text-caption font-semibold text-text-secondary uppercase tracking-wider">
            {filtered.length} bill{filtered.length === 1 ? "" : "s"} · {terms.find((t) => t.id === termId)?.name || ""}
          </p>
        </div>
        <div className="hidden tablet:flex items-center justify-between gap-3 px-4 text-caption font-semibold text-text-secondary uppercase tracking-wider">
          <span>Student / Class</span>
          <span className="w-28 text-right">Owing (of bill)</span>
          <span className="w-16 text-center">Status</span>
        </div>
        {filtered.map((b) => {
          const st = billStatusLabel(b.status);
          return (
            <Link key={b.id} href={`/school-admin/finance/billing/${b.id}`}>
              <div className="rounded-lg bg-surface border border-border px-4 py-3 flex items-center justify-between gap-3 hover:bg-clay transition-colors">
                <div className="min-w-0">
                  <p className="font-semibold text-text-primary truncate">{b.student_name}</p>
                  <p className="text-caption text-text-secondary">{b.class_name || "—"}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-bold text-text-primary">{money(b.outstanding)}</p>
                  <p className="text-caption text-text-secondary">of {money(b.net_amount)}</p>
                </div>
                <Badge variant={st.badge}>{st.label}</Badge>
              </div>
            </Link>
          );
        })}
        {filtered.length === 0 && (
          <Card padding="md" className="text-center">
            <p className="text-caption text-text-secondary">
              No bills found. Use “+ Generate bills” to create bills from your fee configuration.
            </p>
          </Card>
        )}
      </div>

      {/* Preview modal */}
      <Modal isOpen={!!preview} onClose={() => setPreview(null)} title="Review before generating">
        {preview && (
          <div className="space-y-4">
            <h2 className="text-h2 font-bold text-text-primary">Review before generating</h2>
            <div className="rounded-lg bg-clay p-4 text-caption text-text-secondary space-y-1">
              <p><b className="text-text-primary">{preview.students_missing}</b> students need bills ({preview.students_total} total · {preview.students_with_bills} already billed · {preview.students_no_fees} have no fees configured)</p>
            </div>
            <div className="space-y-1">
              {preview.expected_by_fee.map((f) => (
                <div key={f.fee} className="flex justify-between text-body">
                  <span className="text-text-primary">{f.fee} × {f.students}</span>
                  <b>{money(f.total)}</b>
                </div>
              ))}
              <div className="flex justify-between border-t border-border pt-2 font-bold text-text-primary">
                <span>Expected total</span>
                <span>{money(preview.expected_total)}</span>
              </div>
            </div>
            <p className="text-caption text-text-secondary">
              Existing bills are never changed — only students without a bill will be generated.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setPreview(null)}>Cancel</Button>
              <Button onClick={generate} loading={generating}>Generate {preview.students_missing} bills</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Sync-with-fee-setup modal (recalculation preview → apply) */}
      <Modal isOpen={syncOpen} onClose={() => !applying && setSyncOpen(false)} title="Sync bills with fee setup">
        <div className="space-y-4">
          {syncLoading ? (
            <p className="text-caption text-text-secondary py-6 text-center">Checking existing bills against the fee setup…</p>
          ) : syncPlan?.up_to_date ? (
            <div className="text-center py-4 space-y-2">
              <p className="text-body font-semibold text-success">✅ Bills already match the fee setup</p>
              <p className="text-caption text-text-secondary">
                No student bill for {syncPlan.term_name} needs to change.
              </p>
              <Button variant="secondary" onClick={() => setSyncOpen(false)}>Close</Button>
            </div>
          ) : syncPlan ? (
            <>
              <p className="text-caption text-text-secondary">
                Changing the fee setup does not touch existing bills. Review what applying it would change for{" "}
                <b className="text-text-primary">{syncPlan.term_name}</b>:
              </p>

              <div className="grid grid-cols-2 gap-3 text-center">
                <div className="rounded-lg bg-clay py-3">
                  <p className="text-h2 font-extrabold text-text-primary">{syncPlan.bills_affected}</p>
                  <p className="text-caption text-text-secondary">bill(s) affected</p>
                </div>
                <div className="rounded-lg bg-clay py-3">
                  <p className="text-h2 font-extrabold text-text-primary">{syncPlan.students_affected}</p>
                  <p className="text-caption text-text-secondary">student(s)</p>
                </div>
              </div>

              <div className="rounded-lg border border-border bg-surface px-4 py-3 space-y-1 text-caption">
                <div className="flex justify-between">
                  <span className="text-text-secondary">Total obligation now</span>
                  <b className="text-text-primary">{money(syncPlan.totals_before)}</b>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-secondary">Total obligation after</span>
                  <b className="text-text-primary">{money(syncPlan.totals_after)}</b>
                </div>
                <div className="flex justify-between border-t border-border pt-1.5">
                  <span className="text-text-secondary">Difference</span>
                  <b className={syncPlan.difference >= 0 ? "text-warning" : "text-success"}>
                    {syncPlan.difference >= 0 ? "+" : "−"}{money(Math.abs(syncPlan.difference))}
                  </b>
                </div>
              </div>

              {syncPlan.overflow_total > 0 && (
                <div className="rounded-lg bg-warning-bg border border-warning px-4 py-3 text-caption">
                  ⚠️ <b>{money(syncPlan.overflow_total)}</b> of payments would exceed the new fee amounts for{" "}
                  <b>{syncPlan.overflow_students}</b> student(s). Payments are never changed — the excess becomes a{" "}
                  <b>credit</b> on each student’s account, traced to the original payment.
                </div>
              )}

              <div className="max-h-48 overflow-y-auto space-y-2">
                {syncPlan.examples.map((ex, i) => (
                  <div key={`${ex.student_name}-${i}`} className="rounded-lg bg-clay px-3 py-2 text-caption">
                    <p className="font-semibold text-text-primary">
                      {ex.student_name}
                      {ex.class_name ? ` · ${ex.class_name}` : ""}{" "}
                      <span className="text-text-secondary font-normal">
                        {money(ex.net_before)} → <b className="text-text-primary">{money(ex.net_after)}</b>
                      </span>
                    </p>
                    {ex.changes.map((c) => (
                      <p key={c.fee} className="text-text-secondary">
                        {c.fee}: {money(c.before)} → {money(c.after)}
                      </p>
                    ))}
                  </div>
                ))}
                {syncPlan.examples.length === 0 && (
                  <p className="text-caption text-text-secondary text-center py-2">No examples to show.</p>
                )}
              </div>

              <div>
                <label className="text-caption text-text-secondary block mb-1">Reason (optional, saved to history)</label>
                <Input value={syncReason} onChange={(e) => setSyncReason(e.target.value)} placeholder="e.g. Fee increase approved for this term" />
              </div>

              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="secondary" onClick={() => setSyncOpen(false)} disabled={applying}>Cancel</Button>
                <Button onClick={applySync} loading={applying}>
                  Apply to {syncPlan.bills_affected} bill{syncPlan.bills_affected === 1 ? "" : "s"}
                </Button>
              </div>
            </>
          ) : (
            <p className="text-caption text-text-secondary py-6 text-center">Preview failed — please try again.</p>
          )}
        </div>
      </Modal>
    </div>
  );
}
