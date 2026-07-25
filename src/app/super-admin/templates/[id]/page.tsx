"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, Badge, Button } from "@/components/ui";

const ALL_SECTIONS = [
  { key: "header", label: "School Header" },
  { key: "student_info", label: "Student Information" },
  { key: "attendance", label: "Attendance" },
  { key: "academic", label: "Academic Performance" },
  { key: "grading_key", label: "Grading System" },
  { key: "psychomotor", label: "Psychomotor Skills" },
  { key: "affective", label: "Affective Traits" },
  { key: "cognitive", label: "Communication & Cognitive" },
  { key: "physical", label: "Physical Development" },
  { key: "teacher_comment", label: "Teacher's Comment" },
  { key: "principal_comment", label: "Principal's Remark" },
  { key: "promotion", label: "Promotion Status" },
  { key: "signatures", label: "Signatures" },
  { key: "qr_code", label: "QR Verification" },
  { key: "footer", label: "Footer" },
];

type Section = {
  id?: string;
  section_key: string;
  label: string;
  display_order: number;
  config: Record<string, unknown>;
  is_enabled: boolean;
};

export default function TemplateEditorPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("draft");
  const [version, setVersion] = useState(1);
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    fetch(`/api/super-admin/templates/${id}`)
      .then((r) => r.json())
      .then((d) => {
        setName(d.name || "");
        setDescription(d.description || "");
        setStatus(d.status || "draft");
        setVersion(d.version || 1);
        setSections(d.sections || []);
      })
      .finally(() => setLoading(false));
  }, [id]);

  const save = async () => {
    setSaving(true);
    const res = await fetch(`/api/super-admin/templates/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description, sections }),
    });
    if (res.ok) {
      setMsg({ type: "success", text: "Saved" });
      setTimeout(() => setMsg(null), 2000);
    } else {
      const d = await res.json();
      setMsg({ type: "error", text: d.error || "Save failed" });
    }
    setSaving(false);
  };

  const publish = async () => {
    setSaving(true);
    const res = await fetch(`/api/super-admin/templates/${id}/publish`, { method: "POST" });
    if (res.ok) {
      const d = await res.json();
      setStatus("published");
      setVersion(d.version);
      setMsg({ type: "success", text: `Published as v${d.version}` });
      setTimeout(() => setMsg(null), 3000);
    } else {
      const d = await res.json();
      setMsg({ type: "error", text: d.error || "Publish failed" });
    }
    setSaving(false);
  };

  const cloneTemplate = async () => {
    setSaving(true);
    const res = await fetch(`/api/super-admin/templates/${id}/clone`, { method: "POST" });
    if (res.ok) {
      const clone = await res.json();
      router.push(`/super-admin/templates/${clone.id}`);
    }
    setSaving(false);
  };

  const addSection = (key: string) => {
    if (sections.find((s) => s.section_key === key)) return;
    setSections([...sections, { section_key: key, label: ALL_SECTIONS.find((s) => s.key === key)?.label || key, display_order: sections.length, config: {}, is_enabled: true }]);
  };

  const removeSection = (key: string) => {
    setSections(sections.filter((s) => s.section_key !== key));
  };

  const moveSection = (key: string, dir: -1 | 1) => {
    const idx = sections.findIndex((s) => s.section_key === key);
    if (idx < 0) return;
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= sections.length) return;
    const next = [...sections];
    [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
    setSections(next.map((s, i) => ({ ...s, display_order: i })));
  };

  const updateLabel = (key: string, label: string) => {
    setSections(sections.map((s) => (s.section_key === key ? { ...s, label } : s)));
  };

  const usedKeys = new Set(sections.map((s) => s.section_key));
  const availableSections = ALL_SECTIONS.filter((s) => !usedKeys.has(s.key));

  if (loading) return <p className="text-text-muted text-small py-8 text-center">Loading…</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <button onClick={() => router.push("/super-admin/templates")} className="text-caption text-primary hover:underline">← Templates</button>
          <h1 className="text-h2 font-bold">Edit Template</h1>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant={status === "published" ? "success" : "warning"}>{status}</Badge>
            <span className="text-caption text-text-muted">v{version}</span>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={cloneTemplate} loading={saving}>Clone</Button>
          {status !== "published" && <Button size="sm" onClick={publish} loading={saving}>Publish</Button>}
          <Button size="sm" onClick={save} loading={saving}>Save</Button>
        </div>
      </div>

      {msg && (
        <div className={`px-4 py-2 rounded-sm text-small font-medium ${msg.type === "success" ? "bg-success-bg text-success" : "bg-error-bg text-error"}`}>
          {msg.text}
        </div>
      )}

      <div className="grid grid-cols-1 tablet:grid-cols-3 gap-6">
        {/* Left: Template Info + Sections */}
        <div className="tablet:col-span-2 space-y-4">
          <Card variant="bordered">
            <label className="block text-caption text-text-muted mb-1">Template Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="w-full border border-border rounded-sm px-3 py-2 text-small bg-surface mb-3" />
            <label className="block text-caption text-text-muted mb-1">Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="w-full border border-border rounded-sm px-3 py-2 text-small bg-surface resize-y" />
          </Card>

          <Card variant="bordered">
            <h3 className="text-h3 font-bold mb-3">Sections ({sections.length})</h3>
            {sections.length === 0 ? (
              <p className="text-small text-text-muted">No sections added yet. Add sections from the right panel.</p>
            ) : (
              <div className="space-y-2">
                {sections.sort((a, b) => a.display_order - b.display_order).map((s, i) => (
                  <div key={s.section_key} className="flex items-center gap-2 border border-border rounded-sm p-3 bg-surface">
                    <div className="flex flex-col gap-1">
                      <button onClick={() => moveSection(s.section_key, -1)} disabled={i === 0} className="text-caption text-text-muted hover:text-primary disabled:opacity-30">▲</button>
                      <button onClick={() => moveSection(s.section_key, 1)} disabled={i === sections.length - 1} className="text-caption text-text-muted hover:text-primary disabled:opacity-30">▼</button>
                    </div>
                    <div className="flex-1">
                      <input
                        value={s.label}
                        onChange={(e) => updateLabel(s.section_key, e.target.value)}
                        className="w-full border border-border rounded-sm px-2 py-1 text-small bg-transparent"
                      />
                      <span className="text-caption text-text-muted">{s.section_key}</span>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => removeSection(s.section_key)}>✕</Button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Right: Add Section */}
        <div className="space-y-4">
          <Card variant="bordered">
            <h3 className="text-small font-bold mb-2">Add Section</h3>
            {availableSections.length === 0 ? (
              <p className="text-caption text-text-muted">All sections added.</p>
            ) : (
              <div className="space-y-1">
                {availableSections.map((s) => (
                  <button key={s.key} onClick={() => addSection(s.key)} className="w-full text-left px-3 py-2 text-small hover:bg-bg rounded-sm transition-colors">
                    + {s.label}
                  </button>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
