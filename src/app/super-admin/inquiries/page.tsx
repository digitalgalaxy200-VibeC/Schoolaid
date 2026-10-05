"use client";

import { useEffect, useState } from "react";
import { Badge, Button, Card } from "@/components/ui";
import {
  INQUIRY_LABELS,
  INQUIRY_ROLE_LABELS,
  INQUIRY_SIZE_LABELS,
  INQUIRY_STATUSES,
  INQUIRY_STATUS_LABELS,
  type InquiryStatus,
} from "@/lib/inquiries/config";

type Inquiry = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  school_name: string | null;
  role: string | null;
  school_size: string | null;
  message: string | null;
  status: InquiryStatus;
  admin_notes: string | null;
  source: string | null;
  submit_count: number;
  last_submitted_at: string;
  created_at: string;
};

type ListResponse = {
  data: Inquiry[];
  total: number;
  page: number;
  pageSize: number;
  counts: Record<InquiryStatus, number>;
};

const STATUS_BADGE: Record<InquiryStatus, "info" | "warning" | "success" | "default"> = {
  new: "info",
  contacted: "warning",
  qualified: "success",
  closed: "default",
};

const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

export default function InquiriesPage() {
  const [status, setStatus] = useState<InquiryStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [resp, setResp] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  // Bumped after a change so the list refetches.
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const params = new URLSearchParams({ page: String(page) });
        if (status !== "all") params.set("status", status);
        if (q) params.set("q", q);
        const res = await fetch(`/api/super-admin/inquiries?${params}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Failed to load");
        if (!cancelled) { setResp(json); setError(""); }
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [status, q, page, reloadKey]);

  const patch = async (id: string, body: { status?: InquiryStatus; admin_notes?: string }) => {
    setBusy(id);
    setError("");
    try {
      const res = await fetch(`/api/super-admin/inquiries/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Update failed");
      setReloadKey((k) => k + 1);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(null);
    }
  };

  const totalPages = resp ? Math.max(1, Math.ceil(resp.total / resp.pageSize)) : 1;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-h2 font-bold">{INQUIRY_LABELS.pageTitle}</h1>
        <p className="text-small text-text-muted mt-1">{INQUIRY_LABELS.pageSubtitle}</p>
      </div>

      {/* Status filter with live counts */}
      <div className="flex flex-wrap gap-2">
        {(["all", ...INQUIRY_STATUSES] as const).map((s) => {
          const count = resp
            ? s === "all"
              ? INQUIRY_STATUSES.reduce((n, k) => n + resp.counts[k], 0)
              : resp.counts[s]
            : null;
          const active = status === s;
          return (
            <button
              key={s}
              onClick={() => { setStatus(s); setPage(1); }}
              className={`px-3.5 py-1.5 rounded-full text-caption font-semibold border transition-colors ${
                active ? "bg-primary text-text-inverse border-primary" : "bg-surface text-text-secondary border-border hover:bg-bg"
              }`}
            >
              {s === "all" ? "All" : INQUIRY_STATUS_LABELS[s]}
              {count !== null && <span className="ml-1.5 opacity-75">{count}</span>}
            </button>
          );
        })}
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); setQ(search.trim()); setPage(1); }}
        className="flex gap-2 max-w-md"
      >
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, email or school"
          className="flex-1 h-[42px] px-3.5 bg-surface border border-border rounded-lg text-body focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <Button type="submit" variant="secondary">Search</Button>
      </form>

      {error && (
        <div className="bg-error-bg border border-error rounded-sm px-4 py-2">
          <p className="text-small text-error font-medium">{error}</p>
        </div>
      )}

      {loading && !resp ? (
        <Card variant="default" className="shadow-sm"><p className="text-text-muted py-8 text-center">Loading…</p></Card>
      ) : resp && resp.data.length === 0 ? (
        <Card variant="default" className="shadow-sm">
          <div className="text-center py-12 text-text-muted">
            <p className="text-body">No {INQUIRY_LABELS.item}s {status !== "all" || q ? "match these filters" : "yet"}.</p>
            {status === "all" && !q && (
              <p className="text-caption mt-2">They appear here when someone submits the form on the landing page.</p>
            )}
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {resp?.data.map((row) => {
            const open = openId === row.id;
            return (
              <Card key={row.id} variant="default" className="shadow-sm">
                <div className="flex flex-col tablet:flex-row tablet:items-start gap-3 justify-between">
                  <button className="text-left min-w-0 flex-1" onClick={() => setOpenId(open ? null : row.id)}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-body font-bold text-text-primary">{row.full_name}</span>
                      <Badge variant={STATUS_BADGE[row.status]}>{INQUIRY_STATUS_LABELS[row.status]}</Badge>
                      {row.submit_count > 1 && <Badge variant="default">Asked {row.submit_count}×</Badge>}
                    </div>
                    <p className="text-small text-text-secondary mt-0.5 truncate">
                      {row.school_name || "School not given"}
                      {row.role ? ` · ${INQUIRY_ROLE_LABELS[row.role as keyof typeof INQUIRY_ROLE_LABELS] ?? row.role}` : ""}
                    </p>
                    <p className="text-caption text-text-muted mt-0.5">{dateFmt.format(new Date(row.last_submitted_at))}</p>
                  </button>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <a href={`mailto:${row.email}`} className="text-small font-semibold text-primary hover:underline">{row.email}</a>
                    <select
                      value={row.status}
                      disabled={busy === row.id}
                      onChange={(e) => patch(row.id, { status: e.target.value as InquiryStatus })}
                      className="h-[34px] px-2 bg-surface border border-border rounded-lg text-caption"
                      aria-label="Change status"
                    >
                      {INQUIRY_STATUSES.map((s) => (
                        <option key={s} value={s}>{INQUIRY_STATUS_LABELS[s]}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {open && (
                  <div className="mt-4 pt-4 border-t border-border grid gap-4 tablet:grid-cols-2">
                    <dl className="space-y-2 text-small">
                      <div><dt className="text-caption text-text-muted">Phone</dt><dd>{row.phone ? <a className="text-primary hover:underline" href={`tel:${row.phone}`}>{row.phone}</a> : "—"}</dd></div>
                      <div><dt className="text-caption text-text-muted">School size</dt><dd>{row.school_size ? INQUIRY_SIZE_LABELS[row.school_size as keyof typeof INQUIRY_SIZE_LABELS] ?? row.school_size : "—"}</dd></div>
                      <div><dt className="text-caption text-text-muted">First submitted</dt><dd>{dateFmt.format(new Date(row.created_at))}</dd></div>
                      <div><dt className="text-caption text-text-muted">What they want to know</dt><dd className="whitespace-pre-wrap">{row.message || "—"}</dd></div>
                    </dl>
                    <div className="space-y-2">
                      <label className="block text-caption font-medium" htmlFor={`notes-${row.id}`}>Internal notes</label>
                      <textarea
                        id={`notes-${row.id}`}
                        rows={4}
                        maxLength={2000}
                        value={notes[row.id] ?? row.admin_notes ?? ""}
                        onChange={(e) => setNotes((n) => ({ ...n, [row.id]: e.target.value }))}
                        className="w-full px-3.5 py-2 bg-surface border border-border rounded-lg text-body focus:outline-none focus:ring-2 focus:ring-primary"
                        placeholder="Only super admins see this."
                      />
                      <Button size="sm" loading={busy === row.id} onClick={() => patch(row.id, { admin_notes: notes[row.id] ?? row.admin_notes ?? "" })}>
                        Save notes
                      </Button>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {resp && totalPages > 1 && (
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
          <span className="text-caption text-text-muted">Page {page} of {totalPages}</span>
          <Button variant="ghost" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      )}
    </div>
  );
}
