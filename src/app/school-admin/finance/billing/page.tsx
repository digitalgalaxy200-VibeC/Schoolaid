"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Card, Button, Input, Badge, Modal, showToast } from "@/components/ui";
import { money, billStatusLabel } from "@/components/finance/helpers";

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

export default function FinanceBillingPage() {
  const [terms, setTerms] = useState<Term[]>([]);
  const [termId, setTermId] = useState("");
  const [bills, setBills] = useState<Bill[]>([]);
  const [search, setSearch] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    fetch("/api/school-admin/terms")
      .then((r) => r.json())
      .then((rows: Term[]) => {
        setTerms(rows);
        const active = rows.find((t) => t.is_active) || rows[0];
        if (active) setTermId(active.id);
      })
      .catch(() => {});
  }, []);

  const load = useCallback(() => {
    const q = termId ? `?term_id=${encodeURIComponent(termId)}` : "";
    fetch(`/api/school-admin/finance/billing${q}`)
      .then((r) => r.json())
      .then(setBills)
      .catch(() => {});
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
        <Button onClick={openPreview} loading={previewing} disabled={!termId}>+ Generate bills</Button>
      </div>

      <div className="max-w-md">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search student…" />
      </div>

      {/* List */}
      <div className="space-y-2">
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
    </div>
  );
}
