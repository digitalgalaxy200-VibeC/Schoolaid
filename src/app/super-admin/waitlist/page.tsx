"use client";

import { useEffect, useState } from "react";
import { Mail, Phone, MapPin, Building2, Calendar } from "lucide-react";
import { Card, Badge, Button, Modal, ConfirmDialog } from "@/components/ui";

type Submission = {
  id: string;
  full_name: string;
  school_name: string;
  email: string;
  phone: string | null;
  country: string | null;
  city: string | null;
  message: string | null;
  source: string;
  status: "new" | "contacted" | "archived";
  created_at: string;
};

const STATUS_TABS: { key: "all" | Submission["status"]; label: string }[] = [
  { key: "all", label: "All" },
  { key: "new", label: "New" },
  { key: "contacted", label: "Contacted" },
  { key: "archived", label: "Archived" },
];

const STATUS_BADGE: Record<Submission["status"], "info" | "success" | "default"> = {
  new: "info",
  contacted: "success",
  archived: "default",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function WaitlistPage() {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"all" | Submission["status"]>("all");
  const [selected, setSelected] = useState<Submission | null>(null);
  const [updating, setUpdating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = () => {
    setLoading(true);
    fetch(`/api/super-admin/waitlist?status=${tab}`)
      .then((r) => r.json())
      .then((data) => {
        setSubmissions(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(load, [tab]);

  const updateStatus = async (id: string, status: Submission["status"]) => {
    setUpdating(true);
    try {
      const res = await fetch(`/api/super-admin/waitlist/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSelected(data);
      setSubmissions((prev) => prev.map((s) => (s.id === id ? { ...s, status } : s)));
    } catch {
      // no-op — the row simply won't reflect the change
    } finally {
      setUpdating(false);
    }
  };

  const handleDelete = async () => {
    if (!selected) return;
    setDeleting(true);
    try {
      await fetch(`/api/super-admin/waitlist/${selected.id}`, { method: "DELETE" });
      setSubmissions((prev) => prev.filter((s) => s.id !== selected.id));
      setConfirmDelete(false);
      setSelected(null);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-h1 font-bold">Waitlist</h1>
        <p className="text-body text-text-muted mt-1">
          Leads submitted through the public landing page.
        </p>
      </div>

      <div className="flex gap-2">
        {STATUS_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-sm text-body font-semibold ${
              tab === t.key
                ? "bg-primary text-text-inverse"
                : "bg-surface text-text-secondary border border-border"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      ) : (
        <Card variant="default" className="shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-body">
              <thead>
                <tr className="bg-bg border-b border-border">
                  <th className="text-left px-4 py-3 font-mono text-caption uppercase text-text-muted">Name</th>
                  <th className="text-left px-4 py-3 font-mono text-caption uppercase text-text-muted">School</th>
                  <th className="text-left px-4 py-3 font-mono text-caption uppercase text-text-muted">Contact</th>
                  <th className="text-left px-4 py-3 font-mono text-caption uppercase text-text-muted">Location</th>
                  <th className="text-left px-4 py-3 font-mono text-caption uppercase text-text-muted">Status</th>
                  <th className="text-left px-4 py-3 font-mono text-caption uppercase text-text-muted">Submitted</th>
                </tr>
              </thead>
              <tbody>
                {submissions.map((s) => (
                  <tr
                    key={s.id}
                    onClick={() => setSelected(s)}
                    className="border-b border-border hover:bg-bg cursor-pointer"
                  >
                    <td className="px-4 py-3 font-semibold">{s.full_name}</td>
                    <td className="px-4 py-3 text-text-secondary">{s.school_name}</td>
                    <td className="px-4 py-3 text-text-secondary">{s.email}</td>
                    <td className="px-4 py-3 text-text-secondary">
                      {[s.city, s.country].filter(Boolean).join(", ") || "—"}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={STATUS_BADGE[s.status]}>{s.status}</Badge>
                    </td>
                    <td className="px-4 py-3 text-text-secondary text-caption">{formatDate(s.created_at)}</td>
                  </tr>
                ))}
                {submissions.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-text-muted">
                      No submissions yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Modal
        isOpen={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.full_name}
        size="md"
        footer={
          selected && (
            <>
              <Button variant="ghost" onClick={() => setConfirmDelete(true)}>
                Delete
              </Button>
              <div className="flex-1" />
              {selected.status !== "new" && (
                <Button variant="secondary" size="sm" loading={updating} onClick={() => updateStatus(selected.id, "new")}>
                  Mark New
                </Button>
              )}
              {selected.status !== "contacted" && (
                <Button variant="secondary" size="sm" loading={updating} onClick={() => updateStatus(selected.id, "contacted")}>
                  Mark Contacted
                </Button>
              )}
              {selected.status !== "archived" && (
                <Button variant="primary" size="sm" loading={updating} onClick={() => updateStatus(selected.id, "archived")}>
                  Archive
                </Button>
              )}
            </>
          )
        }
      >
        {selected && (
          <div className="space-y-5">
            <div className="flex items-center gap-2">
              <Badge variant={STATUS_BADGE[selected.status]}>{selected.status}</Badge>
              <span className="text-caption text-text-muted font-mono uppercase">
                via {selected.source}
              </span>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-3 text-body">
                <Building2 className="w-4 h-4 text-text-muted shrink-0" />
                <span>{selected.school_name}</span>
              </div>
              <div className="flex items-center gap-3 text-body">
                <Mail className="w-4 h-4 text-text-muted shrink-0" />
                <a href={`mailto:${selected.email}`} className="text-primary hover:underline">
                  {selected.email}
                </a>
              </div>
              {selected.phone && (
                <div className="flex items-center gap-3 text-body">
                  <Phone className="w-4 h-4 text-text-muted shrink-0" />
                  <a href={`tel:${selected.phone}`} className="text-primary hover:underline">
                    {selected.phone}
                  </a>
                </div>
              )}
              {(selected.city || selected.country) && (
                <div className="flex items-center gap-3 text-body">
                  <MapPin className="w-4 h-4 text-text-muted shrink-0" />
                  <span>{[selected.city, selected.country].filter(Boolean).join(", ")}</span>
                </div>
              )}
              <div className="flex items-center gap-3 text-body">
                <Calendar className="w-4 h-4 text-text-muted shrink-0" />
                <span>{formatDate(selected.created_at)}</span>
              </div>
            </div>

            {selected.message && (
              <div>
                <h3 className="text-caption font-mono uppercase text-text-muted mb-1.5">Message</h3>
                <p className="text-body text-text-primary bg-bg border border-border rounded-lg p-4 whitespace-pre-wrap">
                  {selected.message}
                </p>
              </div>
            )}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete submission?"
        message={`This permanently deletes ${selected?.full_name}'s submission. This can't be undone.`}
        confirmLabel="Delete"
        variant="danger"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}
