"use client";
import { useEffect, useState } from "react";
import { Button, Input, Card } from "@/components/ui";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

type TabType = "components" | "grading" | "psychomotor" | "affective";

export default function AssessmentSeparatedPage() {
  const [tab, setTab] = useState<TabType>("components");
  const [classes, setClasses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Data per tab
  const [templates, setTemplates] = useState<{ [key in TabType]: any[] }>({
    components: [],
    grading: [],
    psychomotor: [],
    affective: [],
  });

  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Form State
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [selectedClasses, setSelectedClasses] = useState<string[]>([]);
  const [rows, setRows] = useState<any[]>([]);

  // Confirm
  const [confirm, setConfirm] = useState({ open: false, id: "" });

  const endpoints: Record<TabType, string> = {
    components: "/api/school-admin/assessment-components",
    grading: "/api/school-admin/grading-scales",
    psychomotor: "/api/school-admin/psychomotor",
    affective: "/api/school-admin/affective",
  };

  const flash = (type: "success" | "error", text: string) => {
    setMsg({ type, text });
    setTimeout(() => setMsg(null), 4000);
  };

  const loadAll = async () => {
    setLoading(true);
    const [c, g, p, a, cls] = await Promise.all([
      fetch(endpoints.components).then((r) => r.json()),
      fetch(endpoints.grading).then((r) => r.json()),
      fetch(endpoints.psychomotor).then((r) => r.json()),
      fetch(endpoints.affective).then((r) => r.json()),
      fetch("/api/school-admin/classes").then((r) => r.json()),
    ]);
    setTemplates({
      components: Array.isArray(c) ? c : [],
      grading: Array.isArray(g) ? g : [],
      psychomotor: Array.isArray(p) ? p : [],
      affective: Array.isArray(a) ? a : [],
    });
    setClasses(Array.isArray(cls) ? cls : []);
    setLoading(false);
  };

  useEffect(() => {
    loadAll();
  }, []);

  const resetForm = () => {
    setEditId(null);
    setName("");
    setSelectedClasses([]);
    setRows([]);
    setIsFormOpen(false);
  };

  const openAdd = () => {
    resetForm();
    setIsFormOpen(true);
  };

  const openEdit = (t: any) => {
    setEditId(t.id);
    setName(t.name);
    // map class_id from junction tables based on current tab
    const relKey = `class_${tab}_templates`;
    setSelectedClasses(t[relKey]?.map((c: any) => c.class_id) || []);
    
    // map rows based on current tab
    const rowKey = tab === "components" ? "components_rows" : 
                   tab === "grading" ? "grading_rows" : 
                   tab === "psychomotor" ? "psychomotor_rows" : "affective_rows";
    setRows(t[rowKey] || []);
    setIsFormOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return flash("error", "Template name is required.");

    const res = await fetch(endpoints[tab], {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: editId, name, class_ids: selectedClasses, rows }),
    });

    if (res.ok) {
      flash("success", "Template saved successfully!");
      resetForm();
      loadAll();
    } else {
      const d = await res.json();
      flash("error", d.error || "Failed to save template.");
    }
  };

  const handleDelete = async () => {
    const res = await fetch(`${endpoints[tab]}?id=${confirm.id}`, { method: "DELETE" });
    if (res.ok) {
      flash("success", "Template deleted.");
      setConfirm({ open: false, id: "" });
      loadAll();
    } else {
      const d = await res.json();
      flash("error", d.error || "Failed to delete.");
    }
  };

  const toggleClass = (id: string) => {
    setSelectedClasses((prev) => prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]);
  };

  // Row Mutators
  const updateRow = (index: number, field: string, value: any) => {
    setRows((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };
  const addRow = (defaultValues: any) => setRows((prev) => [...prev, defaultValues]);
  const removeRow = (index: number) => setRows((prev) => prev.filter((_, i) => i !== index));

  if (loading) return <div>Loading assessment configuration...</div>;

  const currentTemplates = templates[tab];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-h1 font-bold">Assessment Configuration</h1>
          <p className="text-text-secondary text-small">
            Create independent templates for Components, Grading, and Traits, and assign them to classes.
          </p>
        </div>
      </div>

      {msg && (
        <div className={`px-4 py-3 rounded-sm text-small font-medium ${msg.type === "success" ? "bg-success-bg text-success border border-success" : "bg-error-bg text-error border border-error"}`}>
          {msg.text}
        </div>
      )}

      {/* TABS */}
      <div className="flex gap-2 border-b border-border pb-0">
        {[
          { k: "components", l: "Components" },
          { k: "grading", l: "Grading Scale" },
          { k: "psychomotor", l: "Psychomotor" },
          { k: "affective", l: "Affective" },
        ].map((t) => (
          <button
            key={t.k}
            onClick={() => { setTab(t.k as TabType); resetForm(); }}
            className={`px-4 py-2 text-small font-semibold border-b-2 transition-colors ${tab === t.k ? "border-primary text-primary" : "border-transparent text-text-secondary hover:text-text-primary"}`}
          >
            {t.l}
          </button>
        ))}
      </div>

      <div className="flex justify-between items-center mt-6">
        <h2 className="text-h2 font-bold capitalize">{tab} Templates</h2>
        {!isFormOpen && <Button onClick={openAdd}>Create Template</Button>}
      </div>

      {isFormOpen ? (
        <Card className="animate-fade-in shadow-lg border border-border-strong p-0 overflow-hidden mt-4">
          <form onSubmit={handleSave}>
            <div className="bg-surface p-5 border-b border-border">
              <h2 className="text-h3 font-bold mb-4">{editId ? "Edit" : "New"} {tab} Template</h2>
              <Input
                label="Template Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., JSS Template"
                required
              />
            </div>

            <div className="p-5 bg-surface space-y-6">
              {/* CLASSES */}
              <div>
                <label className="block text-small font-semibold text-text-secondary mb-2">Assign Classes</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {classes.map((c) => (
                    <label key={c.id} className="flex items-center gap-2 cursor-pointer p-2 border border-border rounded-sm hover:bg-bg transition-colors">
                      <input type="checkbox" checked={selectedClasses.includes(c.id)} onChange={() => toggleClass(c.id)} className="accent-primary w-4 h-4" />
                      <span className="text-small font-medium">{c.name}</span>
                    </label>
                  ))}
                </div>
              </div>

              <hr className="border-border" />

              {/* ROWS */}
              <div>
                <label className="block text-small font-semibold text-text-secondary mb-2">Rows</label>
                
                {tab === "components" && (
                  <div className="space-y-3">
                    {rows.map((r, i) => (
                      <div key={i} className="flex gap-3 items-end">
                        <div className="flex-1">
                          <label className="text-caption font-semibold text-text-secondary">Component Name</label>
                          <input type="text" className="w-full px-3 py-2 border rounded-sm text-small mt-1 bg-bg" value={r.name} onChange={(e) => updateRow(i, "name", e.target.value)} placeholder="e.g. Exam" required />
                        </div>
                        <div className="w-32">
                          <label className="text-caption font-semibold text-text-secondary">Max Score</label>
                          <input type="number" className="w-full px-3 py-2 border rounded-sm text-small mt-1 bg-bg" value={r.maximum_score} onChange={(e) => updateRow(i, "maximum_score", e.target.value)} required />
                        </div>
                        <Button variant="ghost" type="button" className="text-error" onClick={() => removeRow(i)}>✕</Button>
                      </div>
                    ))}
                    <Button type="button" variant="ghost" onClick={() => addRow({ name: "", maximum_score: 0 })}>+ Add Component</Button>
                  </div>
                )}

                {tab === "grading" && (
                  <div className="space-y-3">
                    {rows.map((r, i) => (
                      <div key={i} className="flex gap-3 items-end">
                        <div className="w-20">
                          <label className="text-caption font-semibold text-text-secondary">Grade</label>
                          <input type="text" className="w-full px-3 py-2 border rounded-sm text-small mt-1 bg-bg" value={r.grade} onChange={(e) => updateRow(i, "grade", e.target.value)} placeholder="A" required />
                        </div>
                        <div className="w-24">
                          <label className="text-caption font-semibold text-text-secondary">Min</label>
                          <input type="number" className="w-full px-3 py-2 border rounded-sm text-small mt-1 bg-bg" value={r.minimum_score} onChange={(e) => updateRow(i, "minimum_score", e.target.value)} required />
                        </div>
                        <div className="w-24">
                          <label className="text-caption font-semibold text-text-secondary">Max</label>
                          <input type="number" className="w-full px-3 py-2 border rounded-sm text-small mt-1 bg-bg" value={r.maximum_score} onChange={(e) => updateRow(i, "maximum_score", e.target.value)} required />
                        </div>
                        <div className="flex-1">
                          <label className="text-caption font-semibold text-text-secondary">Remark</label>
                          <input type="text" className="w-full px-3 py-2 border rounded-sm text-small mt-1 bg-bg" value={r.remark || ""} onChange={(e) => updateRow(i, "remark", e.target.value)} placeholder="Excellent" />
                        </div>
                        <Button variant="ghost" type="button" className="text-error" onClick={() => removeRow(i)}>✕</Button>
                      </div>
                    ))}
                    <Button type="button" variant="ghost" onClick={() => addRow({ grade: "", minimum_score: 0, maximum_score: 0, remark: "" })}>+ Add Grade</Button>
                  </div>
                )}

                {(tab === "psychomotor" || tab === "affective") && (
                  <div className="space-y-3">
                    {rows.map((r, i) => (
                      <div key={i} className="flex gap-3 items-end">
                        <div className="flex-1">
                          <label className="text-caption font-semibold text-text-secondary">Trait Name</label>
                          <input type="text" className="w-full px-3 py-2 border rounded-sm text-small mt-1 bg-bg" value={r.name} onChange={(e) => updateRow(i, "name", e.target.value)} placeholder="e.g. Handwriting" required />
                        </div>
                        <Button variant="ghost" type="button" className="text-error" onClick={() => removeRow(i)}>✕</Button>
                      </div>
                    ))}
                    <Button type="button" variant="ghost" onClick={() => addRow({ name: "" })}>+ Add Trait</Button>
                  </div>
                )}
              </div>
            </div>

            <div className="p-5 border-t border-border bg-surface flex justify-end gap-3">
              <Button type="button" variant="ghost" onClick={resetForm}>Cancel</Button>
              <Button type="submit">Save Template</Button>
            </div>
          </form>
        </Card>
      ) : (
        <div className="grid gap-4 mt-4">
          {currentTemplates.length === 0 ? (
            <Card variant="bordered" className="text-center py-12">
              <p className="text-text-muted text-body mb-4">No {tab} templates configured yet.</p>
              <Button onClick={openAdd}>Create First Template</Button>
            </Card>
          ) : (
            currentTemplates.map((t) => (
              <Card key={t.id} variant="bordered" className="shadow-sm">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-h3 font-bold text-text-primary">{t.name}</h3>
                    <p className="text-caption text-text-muted mt-1">
                      Assigned to {t[`class_${tab}_templates`]?.length || 0} class(es).
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(t)}>Edit</Button>
                    <Button variant="danger" size="sm" onClick={() => setConfirm({ open: true, id: t.id })}>Delete</Button>
                  </div>
                </div>

                <div className="text-small text-text-secondary">
                  <strong>Items:</strong> {t[
                    tab === "components" ? "components_rows" :
                    tab === "grading" ? "grading_rows" :
                    tab === "psychomotor" ? "psychomotor_rows" : "affective_rows"
                  ]?.length || 0} configured
                </div>
              </Card>
            ))
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirm.open}
        title="Delete Template"
        message="Are you sure you want to delete this template? All assigned classes will lose this structure."
        onConfirm={handleDelete}
        onCancel={() => setConfirm({ open: false, id: "" })}
      />
    </div>
  );
}
