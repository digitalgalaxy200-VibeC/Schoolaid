"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Card, Badge } from "@/components/ui";
import { money, moneyShort } from "@/components/finance/helpers";

type Term = { id: string; name: string; is_active: boolean };

type SectionSummary = {
  id: string | null;
  name: string;
  expected: number;
  collected: number;
  outstanding: number;
  rate: number;
  student_counts: { total: number; paid: number; partial: number; unpaid: number };
};

type ClassSummary = SectionSummary & { section_id: string | null };

type FeeSummary = { fee_head_id: string; fee_name: string; expected: number; collected: number; outstanding: number };

type Dashboard = {
  totalCharged?: string;
  totalCollected?: string;
  outstanding?: string;
  collectionRate?: number;
  expected: number;
  collected: number;
  outstandingAmount: number;
  legacy_collected?: string;
  student_counts: { total: number; paid: number; partial: number; unpaid: number };
  sections: SectionSummary[];
  classes: ClassSummary[];
  fee_breakdown: FeeSummary[];
};

export default function FinanceOverviewPage() {
  const [terms, setTerms] = useState<Term[]>([]);
  const [termId, setTermId] = useState<string>("");
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedSection, setSelectedSection] = useState<string | null>(null);

  // Load terms once; default to the active term
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
    setLoading(true);
    const q = termId ? `?term_id=${encodeURIComponent(termId)}` : "";
    fetch(`/api/school-admin/finance/dashboard${q}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Dashboard | null) => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [termId]);

  useEffect(() => {
    if (terms.length > 0) load();
  }, [terms, load]);

  const s = data?.student_counts;
  const visibleClasses = selectedSection
    ? (data?.classes || []).filter((c) => c.section_id === selectedSection)
    : [];

  return (
    <div className="space-y-5">
      {/* Term selector */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
        <span className="text-caption font-semibold text-text-secondary uppercase tracking-wider">Term</span>
        {terms.map((t) => (
          <button
            key={t.id}
            onClick={() => setTermId(t.id)}
            className={`px-3 py-1.5 rounded-full text-caption font-semibold whitespace-nowrap border transition-colors ${
              termId === t.id
                ? "bg-primary text-text-inverse border-primary"
                : "bg-surface text-text-secondary border-border hover:bg-primary-light hover:text-primary"
            }`}
          >
            {t.name}
          </button>
        ))}
      </div>

      {loading && !data ? (
        <p className="text-caption text-text-secondary py-10 text-center">Loading…</p>
      ) : (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-1 tablet:grid-cols-3 gap-4">
            <Card className="text-center py-6">
              <p className="text-caption uppercase tracking-wider text-text-disabled font-mono">Expected</p>
              <p className="text-display font-extrabold text-text-primary mt-1">{money(data?.expected ?? 0)}</p>
            </Card>
            <Card className="text-center py-6">
              <p className="text-caption uppercase tracking-wider text-text-disabled font-mono">Collected</p>
              <p className="text-display font-extrabold text-success mt-1">{money(data?.collected ?? 0)}</p>
            </Card>
            <Card className="text-center py-6">
              <p className="text-caption uppercase tracking-wider text-text-disabled font-mono">Outstanding</p>
              <p className="text-display font-extrabold text-warning mt-1">{money(data?.outstandingAmount ?? 0)}</p>
            </Card>
          </div>

          {/* Collection rate */}
          <Card padding="md">
            <div className="flex items-center justify-between">
              <p className="text-caption font-semibold text-text-secondary uppercase tracking-wider">Collection Rate</p>
              <p className="text-body font-bold text-text-primary">{data?.collectionRate ?? 0}%</p>
            </div>
            <div className="h-3 mt-3 rounded-full bg-clay overflow-hidden">
              <div
                className="h-full bg-success rounded-full transition-all"
                style={{ width: `${Math.min(100, data?.collectionRate ?? 0)}%` }}
              />
            </div>
            {data?.legacy_collected ? (
              <p className="text-caption text-text-disabled mt-3">
                Includes {data.legacy_collected} from pre-billing records (not yet allocated).
              </p>
            ) : null}
          </Card>

          {/* Students */}
          <Card padding="md">
            <p className="text-caption font-semibold text-text-secondary uppercase tracking-wider mb-3">Students</p>
            <div className="grid grid-cols-2 tablet:grid-cols-4 gap-3 text-center">
              {[
                { label: "Total", value: s?.total ?? 0, cls: "text-text-primary" },
                { label: "Paid", value: s?.paid ?? 0, cls: "text-success" },
                { label: "Partial", value: s?.partial ?? 0, cls: "text-warning" },
                { label: "Unpaid", value: s?.unpaid ?? 0, cls: "text-error" },
              ].map((x) => (
                <div key={x.label} className="py-3 rounded-lg bg-clay">
                  <p className={`text-h2 font-extrabold ${x.cls}`}>{x.value}</p>
                  <p className="text-caption text-text-secondary">{x.label}</p>
                </div>
              ))}
            </div>
          </Card>

          {/* Sections drill-down */}
          <div>
            <p className="text-caption font-semibold text-text-secondary uppercase tracking-wider mb-2">By Section</p>
            <div className="space-y-2">
              {(data?.sections || []).map((sec) => (
                <button
                  key={sec.id || "unassigned"}
                  onClick={() => setSelectedSection(selectedSection === sec.id ? null : sec.id)}
                  className={`w-full text-left rounded-lg border p-4 transition-colors ${
                    selectedSection === sec.id
                      ? "bg-primary-light border-primary"
                      : "bg-surface border-border hover:bg-clay"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-text-primary">{sec.name}</p>
                    <div className="flex items-center gap-2">
                      <span className="text-caption text-text-secondary">
                        {sec.student_counts.total} students
                      </span>
                      <Badge variant={sec.rate >= 90 ? "success" : sec.rate >= 50 ? "warning" : "error"}>
                        {sec.rate}%
                      </Badge>
                    </div>
                  </div>
                  <div className="flex gap-4 mt-2 text-caption text-text-secondary">
                    <span>Expected <b className="text-text-primary">{moneyShort(sec.expected)}</b></span>
                    <span>Collected <b className="text-success">{moneyShort(sec.collected)}</b></span>
                    <span>Outstanding <b className="text-warning">{moneyShort(sec.outstanding)}</b></span>
                  </div>
                </button>
              ))}
              {(data?.sections || []).length === 0 && (
                <Card padding="md" className="text-center">
                  <p className="text-caption text-text-secondary">
                    No bills yet —{" "}
                    <Link href="/school-admin/finance/billing" className="text-primary font-semibold underline">
                      generate bills
                    </Link>
                  </p>
                </Card>
              )}
            </div>

            {/* Classes inside the selected section */}
            {selectedSection && (
              <div className="mt-3 space-y-2">
                {visibleClasses.map((c) => (
                  <div key={c.id} className="flex items-center justify-between rounded-lg bg-surface border border-border px-4 py-3">
                    <div>
                      <p className="font-medium text-text-primary">{c.name}</p>
                      <p className="text-caption text-text-secondary">
                        {moneyShort(c.expected)} expected · {c.student_counts.total} students
                      </p>
                    </div>
                    <Badge variant={c.rate >= 90 ? "success" : c.rate >= 50 ? "warning" : "error"}>{c.rate}%</Badge>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Fee breakdown */}
          {(data?.fee_breakdown || []).length > 0 && (
            <Card>
              <p className="text-caption font-semibold text-text-secondary uppercase tracking-wider mb-3">By Fee</p>
              <div className="space-y-2">
                {(data?.fee_breakdown || []).map((f) => (
                  <div key={f.fee_head_id} className="flex items-center justify-between text-caption">
                    <span className="font-medium text-text-primary">{f.fee_name}</span>
                    <span className="text-text-secondary">
                      Expected <b>{moneyShort(f.expected)}</b> · Collected{" "}
                      <b className="text-success">{moneyShort(f.collected)}</b> · Outstanding{" "}
                      <b className="text-warning">{moneyShort(f.outstanding)}</b>
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
