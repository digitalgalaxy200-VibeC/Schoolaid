"use client";
import { useEffect, useState } from "react";
import { Button, Input, Card, Badge } from "@/components/ui";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

export default function AssessmentTemplatesPage() {
  const [templates, setTemplates] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // ── Form State ──
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [selectedClasses, setSelectedClasses] = useState<string[]>([]);
  const [components, setComponents] = useState<any[]>([]);
  const [grading, setGrading] = useState<any[]>([]);
  const [psychomotor, setPsychomotor] = useState<any[]>([]);
  const [affective, setAffective] = useState<any[]>([]);

  // ── Sub-tabs for Form ──
  const [formTab, setFormTab] = useState<"classes" | "components" | "grading" | "psychomotor" | "affective">("classes");

  // ── Confirm Dialog ──
  const [confirm, setConfirm] = useState({ open: false, id: "" });

  const flash = (type: "success" | "error", text: string) => {
    setMsg({ type, text });
    setTimeout(() => setMsg(null), 4000);
  };

  const loadData = async () => {
    setLoading(true);
    const [tRes, cRes] = await Promise.all([
      fetch("/api/school-admin/assessment-templates"),
      fetch("/api/school-admin/classes")
    ]);
    const tData = await tRes.json();
    const cData = await cRes.json();
    setTemplates(Array.isArray(tData) ? tData : []);
    setClasses(Array.isArray(cData) ? cData : []);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const resetForm = () => {
    setEditId(null);
    setName("");
    setSelectedClasses([]);
    setComponents([]);
    setGrading([]);
    setPsychomotor([]);
    setAffective([]);
    setFormTab("classes");
    setIsFormOpen(false);
  };

  const openAdd = () => {
    resetForm();
    setIsFormOpen(true);
  };

  const openEdit = (t: any) => {
    setEditId(t.id);
    setName(t.name);
    setSelectedClasses(t.class_assessment_templates?.map((c: any) => c.class_id) || []);
    setComponents(t.template_components || []);
    setGrading(t.template_grading_scales || []);
    setPsychomotor(t.template_psychomotor_traits || []);
    setAffective(t.template_affective_traits || []);
    setFormTab("classes");
    setIsFormOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return flash("error", "Template name is required.");

    const payload = {
      id: editId,
      name,
      class_ids: selectedClasses,
      components,
      grading,
      psychomotor,
      affective,
    };

    const res = await fetch("/api/school-admin/assessment-templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      flash("success", "Template saved successfully!");
      resetForm();
      loadData();
    } else {
      const d = await res.json();
      flash("error", d.error || "Failed to save template.");
    }
  };

  const handleDelete = async () => {
    const res = await fetch(`/api/school-admin/assessment-templates?id=${confirm.id}`, { method: "DELETE" });
    if (res.ok) {
      flash("success", "Template deleted.");
      setConfirm({ open: false, id: "" });
      loadData();
    } else {
      const d = await res.json();
      flash("error", d.error || "Failed to delete.");
    }
  };

  const toggleClass = (id: string) => {
    setSelectedClasses((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  };

  // ── Row Mutators ──
  const updateRow = (setter: any, index: number, field: string, value: any) => {
    setter((prev: any[]) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };
  const addRow = (setter: any, defaultValues: any) => {
    setter((prev: any[]) => [...prev, defaultValues]);
  };
  const removeRow = (setter: any, index: number) => {
    setter((prev: any[]) => prev.filter((_, i) => i !== index));
  };

  if (loading) return <div>Loading assessment configuration...</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-h1 font-bold">Assessment Templates</h1>
          <p className="text-text-secondary text-small">
            Create unified assessment structures (tests, grades, traits) and assign them to classes.
          </p>
        </div>
        {!isFormOpen && <Button onClick={openAdd}>Create Template</Button>}
      </div>

      {msg && (
        <div className={`px-4 py-3 rounded-sm text-small font-medium ${msg.type === "success" ? "bg-success-bg text-success border border-success" : "bg-error-bg text-error border border-error"}`}>
          {msg.text}
        </div>
      )}

      {isFormOpen ? (
        <Card className="animate-fade-in shadow-lg border border-border-strong p-0 overflow-hidden">
          <div className="bg-surface p-5 border-b border-border">
            <h2 className="text-h3 font-bold mb-4">{editId ? "Edit Assessment Template" : "New Assessment Template"}</h2>
            <Input
              label="Template Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Junior Secondary Structure"
              required
            />
          </div>

          <div className="flex border-b border-border bg-bg">
            {[
              { id: "classes", label: "Assign Classes" },
              { id: "components", label: "Components" },
              { id: "grading", label: "Grading Scale" },
              { id: "psychomotor", label: "Psychomotor" },
              { id: "affective", label: "Affective" },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setFormTab(t.id as any)}
                className={`px-5 py-3 text-small font-semibold border-b-2 transition-colors ${formTab === t.id ? "border-primary text-primary bg-surface" : "border-transparent text-text-secondary hover:text-text-primary"}`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="p-5 bg-surface min-h-[300px]">
            {/* CLASSES */}
            {formTab === "classes" && (
              <div>
                <p className="text-small text-text-muted mb-4">Select which classes will use this template. (Note: A class can only have one active template at a time).</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {classes.map((c) => (
                    <label key={c.id} className="flex items-center gap-2 cursor-pointer p-2 border border-border rounded-sm hover:bg-bg transition-colors">
                      <input type="checkbox" checked={selectedClasses.includes(c.id)} onChange={() => toggleClass(c.id)} className="accent-primary w-4 h-4" />
                      <span className="text-small font-medium">{c.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* COMPONENTS */}
            {formTab === "components" && (
              <div className="space-y-4">
                <p className="text-small text-text-muted">Define exams, tests, and assignments. (e.g. 1st CA = 20, Exam = 60).</p>
                <div className="space-y-3">
                  {components.map((c, i) => (
                    <div key={i} className="flex gap-3 items-end">
                      <div className="flex-1">
                        <label className="text-caption font-semibold text-text-secondary">Component Name</label>
                        <input type="text" className="w-full px-3 py-2 border rounded-sm text-small mt-1 bg-bg" value={c.name} onChange={(e) => updateRow(setComponents, i, "name", e.target.value)} placeholder="e.g. Exam" />
                      </div>
                      <div className="w-32">
                        <label className="text-caption font-semibold text-text-secondary">Max Score</label>
                        <input type="number" className="w-full px-3 py-2 border rounded-sm text-small mt-1 bg-bg" value={c.maximum_score} onChange={(e) => updateRow(setComponents, i, "maximum_score", e.target.value)} />
                      </div>
                      <Button variant="ghost" className="text-error" onClick={() => removeRow(setComponents, i)}>✕</Button>
                    </div>
                  ))}
                </div>
                <Button type="button" variant="ghost" onClick={() => addRow(setComponents, { name: "", maximum_score: 0 })}>+ Add Component</Button>
              </div>
            )}

            {/* GRADING */}
            {formTab === "grading" && (
              <div className="space-y-4">
                <p className="text-small text-text-muted">Define grade letters and their score ranges. (e.g. A = 70 to 100, Remark = Excellent).</p>
                <div className="space-y-3">
                  {grading.map((g, i) => (
                    <div key={i} className="flex flex-wrap md:flex-nowrap gap-3 items-end">
                      <div className="w-20">
                        <label className="text-caption font-semibold text-text-secondary">Grade</label>
                        <input type="text" className="w-full px-3 py-2 border rounded-sm text-small mt-1 bg-bg" value={g.grade} onChange={(e) => updateRow(setGrading, i, "grade", e.target.value)} placeholder="A" />
                      </div>
                      <div className="w-24">
                        <label className="text-caption font-semibold text-text-secondary">Min</label>
                        <input type="number" className="w-full px-3 py-2 border rounded-sm text-small mt-1 bg-bg" value={g.minimum_score} onChange={(e) => updateRow(setGrading, i, "minimum_score", e.target.value)} />
                      </div>
                      <div className="w-24">
                        <label className="text-caption font-semibold text-text-secondary">Max</label>
                        <input type="number" className="w-full px-3 py-2 border rounded-sm text-small mt-1 bg-bg" value={g.maximum_score} onChange={(e) => updateRow(setGrading, i, "maximum_score", e.target.value)} />
                      </div>
                      <div className="flex-1">
                        <label className="text-caption font-semibold text-text-secondary">Remark</label>
                        <input type="text" className="w-full px-3 py-2 border rounded-sm text-small mt-1 bg-bg" value={g.remark || ""} onChange={(e) => updateRow(setGrading, i, "remark", e.target.value)} placeholder="Excellent" />
                      </div>
                      <Button variant="ghost" className="text-error" onClick={() => removeRow(setGrading, i)}>✕</Button>
                    </div>
                  ))}
                </div>
                <Button type="button" variant="ghost" onClick={() => addRow(setGrading, { grade: "", minimum_score: 0, maximum_score: 0, remark: "" })}>+ Add Grade</Button>
              </div>
            )}

            {/* PSYCHOMOTOR */}
            {formTab === "psychomotor" && (
              <div className="space-y-4">
                <p className="text-small text-text-muted">Define psychomotor traits like Handwriting, Sports, etc.</p>
                <div className="space-y-3">
                  {psychomotor.map((p, i) => (
                    <div key={i} className="flex gap-3 items-end">
                      <div className="flex-1">
                        <label className="text-caption font-semibold text-text-secondary">Trait Name</label>
                        <input type="text" className="w-full px-3 py-2 border rounded-sm text-small mt-1 bg-bg" value={p.name} onChange={(e) => updateRow(setPsychomotor, i, "name", e.target.value)} placeholder="e.g. Handwriting" />
                      </div>
                      <Button variant="ghost" className="text-error" onClick={() => removeRow(setPsychomotor, i)}>✕</Button>
                    </div>
                  ))}
                </div>
                <Button type="button" variant="ghost" onClick={() => addRow(setPsychomotor, { name: "" })}>+ Add Trait</Button>
              </div>
            )}

            {/* AFFECTIVE */}
            {formTab === "affective" && (
              <div className="space-y-4">
                <p className="text-small text-text-muted">Define affective traits like Politeness, Honesty, etc.</p>
                <div className="space-y-3">
                  {affective.map((a, i) => (
                    <div key={i} className="flex gap-3 items-end">
                      <div className="flex-1">
                        <label className="text-caption font-semibold text-text-secondary">Trait Name</label>
                        <input type="text" className="w-full px-3 py-2 border rounded-sm text-small mt-1 bg-bg" value={a.name} onChange={(e) => updateRow(setAffective, i, "name", e.target.value)} placeholder="e.g. Politeness" />
                      </div>
                      <Button variant="ghost" className="text-error" onClick={() => removeRow(setAffective, i)}>✕</Button>
                    </div>
                  ))}
                </div>
                <Button type="button" variant="ghost" onClick={() => addRow(setAffective, { name: "" })}>+ Add Trait</Button>
              </div>
            )}
          </div>

          <div className="p-5 border-t border-border bg-surface flex justify-end gap-3">
            <Button variant="ghost" onClick={resetForm}>Cancel</Button>
            <Button onClick={handleSave}>Save Template</Button>
          </div>
        </Card>
      ) : (
        <div className="grid gap-4">
          {templates.length === 0 ? (
            <Card variant="bordered" className="text-center py-12">
              <p className="text-text-muted text-body mb-4">No templates configured yet.</p>
              <Button onClick={openAdd}>Create First Template</Button>
            </Card>
          ) : (
            templates.map((t) => (
              <Card key={t.id} variant="bordered" className="shadow-sm">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-h3 font-bold text-text-primary">{t.name}</h3>
                    <p className="text-caption text-text-muted mt-1">
                      Assigned to {t.class_assessment_templates?.length || 0} class(es).
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(t)}>Edit</Button>
                    <Button variant="danger" size="sm" onClick={() => setConfirm({ open: true, id: t.id })}>Delete</Button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-4 text-small text-text-secondary">
                  <div className="bg-bg px-3 py-1.5 rounded-sm border border-border">
                    <span className="font-semibold">{t.template_components?.length || 0}</span> Components
                  </div>
                  <div className="bg-bg px-3 py-1.5 rounded-sm border border-border">
                    <span className="font-semibold">{t.template_grading_scales?.length || 0}</span> Grades
                  </div>
                  <div className="bg-bg px-3 py-1.5 rounded-sm border border-border">
                    <span className="font-semibold">{t.template_psychomotor_traits?.length || 0}</span> Psychomotor
                  </div>
                  <div className="bg-bg px-3 py-1.5 rounded-sm border border-border">
                    <span className="font-semibold">{t.template_affective_traits?.length || 0}</span> Affective
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirm.open}
        title="Delete Template"
        message="Are you sure you want to delete this template? All assigned classes will lose their assessment structure."
        onConfirm={handleDelete}
        onCancel={() => setConfirm({ open: false, id: "" })}
      />
    </div>
  );
}
