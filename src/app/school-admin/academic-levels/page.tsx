"use client";
import { useEffect, useState } from "react";
import { Button, Card, Badge } from "@/components/ui";

type Level = {
  id: string; name: string; display_order: number;
  classes: { id: string; name: string }[];
  level_components_templates: { template_id: string }[];
  level_grading_templates: { template_id: string }[];
  level_psychomotor_templates: { template_id: string }[];
  level_affective_templates: { template_id: string }[];
};

export default function AcademicLevelsPage() {
  const [levels, setLevels] = useState<Level[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [templates, setTemplates] = useState<Record<string, any[]>>({});
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [selectedClasses, setSelectedClasses] = useState<string[]>([]);
  const [selectedTemplates, setSelectedTemplates] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const load = async () => {
    setLoading(true);
    const [lvl, cls, comp, grad, psy, aff] = await Promise.all([
      fetch("/api/school-admin/academic-levels").then(r => r.json()),
      fetch("/api/school-admin/classes").then(r => r.json()),
      fetch("/api/school-admin/assessment-components").then(r => r.json()),
      fetch("/api/school-admin/grading-scales").then(r => r.json()),
      fetch("/api/school-admin/psychomotor").then(r => r.json()),
      fetch("/api/school-admin/affective").then(r => r.json()),
    ]);
    setLevels(Array.isArray(lvl) ? lvl : []);
    setClasses(Array.isArray(cls) ? cls : []);
    setTemplates({ components: comp || [], grading: grad || [], psychomotor: psy || [], affective: aff || [] });
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openAdd = () => {
    setEditId(null); setName(""); setSelectedClasses([]);
    setSelectedTemplates({ components: "", grading: "", psychomotor: "", affective: "" });
    setShowForm(true);
  };

  const openEdit = (l: Level) => {
    setEditId(l.id); setName(l.name);
    setSelectedClasses((l.classes || []).map(c => c.id));
    setSelectedTemplates({
      components: l.level_components_templates?.[0]?.template_id || "",
      grading: l.level_grading_templates?.[0]?.template_id || "",
      psychomotor: l.level_psychomotor_templates?.[0]?.template_id || "",
      affective: l.level_affective_templates?.[0]?.template_id || "",
    });
    setShowForm(true);
  };

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    const res = await fetch("/api/school-admin/academic-levels", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: editId, name, class_ids: selectedClasses, templates: selectedTemplates }),
    });
    setSaving(false);
    if (res.ok) {
      setMsg({ type: "success", text: "Saved!" });
      setShowForm(false);
      load();
    } else {
      const d = await res.json();
      setMsg({ type: "error", text: d.error || "Failed" });
    }
    setTimeout(() => setMsg(null), 3000);
  };

  const del = async (id: string) => {
    if (!confirm("Delete this academic level?")) return;
    await fetch(`/api/school-admin/academic-levels?id=${id}`, { method: "DELETE" });
    load();
  };

  const tglClass = (id: string) => setSelectedClasses(p => p.includes(id) ? p.filter(c => c !== id) : [...p, id]);

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin h-6 w-6 border-2 border-accent border-t-transparent rounded-full" /></div>;

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-h1 font-bold">Academic Levels</h1>
          <p className="text-small text-text-muted">Group classes into levels (e.g., Primary, Secondary) and assign templates once.</p>
        </div>
        {!showForm && <Button onClick={openAdd}>+ Create Level</Button>}
      </div>

      {msg && <div className={`px-4 py-2 rounded-sm text-small font-medium ${msg.type === "success" ? "bg-success-bg text-success" : "bg-error-bg text-error"}`}>{msg.text}</div>}

      {showForm && (
        <Card variant="default" className="p-5 space-y-4">
          <h2 className="text-h3 font-bold">{editId ? "Edit" : "New"} Academic Level</h2>
          <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Level name (e.g. Primary)"
            className="w-full px-3 py-2.5 border border-border-strong rounded-sm text-body" />

          <div>
            <p className="text-caption font-semibold text-text-muted mb-2">Classes in this level</p>
            <div className="grid grid-cols-3 gap-2">
              {classes.map((c: any) => (
                <label key={c.id} className="flex items-center gap-2 text-small cursor-pointer">
                  <input type="checkbox" checked={selectedClasses.includes(c.id)} onChange={() => tglClass(c.id)} />
                  {c.name}
                </label>
              ))}
            </div>
          </div>

          {["components", "grading", "psychomotor", "affective"].map(key => (
            <div key={key}>
              <label className="text-caption font-semibold text-text-muted capitalize">{key} Template</label>
              <select value={selectedTemplates[key] || ""} onChange={e => setSelectedTemplates(p => ({ ...p, [key]: e.target.value }))}
                className="w-full px-3 py-2.5 border border-border-strong rounded-sm text-body mt-1">
                <option value="">— None (use individual class assignments) —</option>
                {(templates[key] || []).map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          ))}

          <div className="flex gap-3">
            <Button onClick={save} loading={saving}>Save Level</Button>
            <Button variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
          </div>
        </Card>
      )}

      {/* Configuration Health Dashboard */}
      <div className="space-y-3">
        {levels.length === 0 ? (
          <Card variant="default" className="text-center py-10">
            <p className="text-text-muted">No academic levels yet. Create one to group your classes.</p>
          </Card>
        ) : (
          levels.map(l => {
            const health = ["components", "grading", "psychomotor", "affective"].map(k => {
              const has = (l as any)[`level_${k}_templates`]?.length > 0;
              return { key: k, has };
            });
            const ready = health.every(h => h.has);
            return (
              <Card key={l.id} variant="default" className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <h3 className="text-h3 font-bold">{l.name}</h3>
                    <p className="text-caption text-text-muted">{(l.classes || []).length} classes</p>
                  </div>
                  <div className="flex gap-2">
                    <Badge variant={ready ? "success" : "warning"}>{ready ? "Ready" : "Needs Setup"}</Badge>
                    <Button variant="ghost" size="sm" onClick={() => openEdit(l)}>Edit</Button>
                    <Button variant="ghost" size="sm" onClick={() => del(l.id)}>Delete</Button>
                  </div>
                </div>
                <div className="flex gap-4 text-caption">
                  {health.map(h => (
                    <span key={h.key} className={h.has ? "text-success" : "text-warning"}>
                      {h.has ? "✓" : "⚠"} {h.key}
                    </span>
                  ))}
                </div>
                {l.classes?.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {l.classes.map((c: any) => <Badge key={c.id} variant="default">{c.name}</Badge>)}
                  </div>
                )}
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
