"use client";
import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { Button, Input, Card } from "@/components/ui";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { PLATFORM_DEFAULTS } from "@/lib/school-defaults";

type TabType = "components" | "grading" | "psychomotor" | "affective" | "academic_levels";
type GradingSubTab = "grade_config" | "principal_remarks";

// ── Placeholder helper ──────────────────────────────────────────────
const PLACEHOLDERS = [
  { label: "{name}", desc: "Student first name" },
  { label: "{average}", desc: "Overall average score" },
  { label: "{grade}", desc: "Letter grade" },
  { label: "{He/She}", desc: "Gender pronoun (He/She)" },
  { label: "{His/Her}", desc: "Possessive (His/Her)" },
  { label: "{him/her}", desc: "Object (him/her)" },
];

function compileLivePreview(template: string, gender: "male" | "female"): string {
  let out = template;
  const s: Record<string, string> = {
    name: "John",
    average: "85.0",
    grade: "A",
    "He/She": gender === "female" ? "She" : "He",
    "he/she": gender === "female" ? "she" : "he",
    "His/Her": gender === "female" ? "Her" : "His",
    "his/her": gender === "female" ? "her" : "his",
    "him/her": gender === "female" ? "her" : "him",
  };
  for (const [k, v] of Object.entries(s)) {
    out = out.split(`{${k}}`).join(v);
  }
  return out;
}

// ── Remark Editor Modal ─────────────────────────────────────────────
function RemarkEditorModal({
  row,
  onSave,
  onClose,
}: {
  row: { grade: string; minimum_score: string | number; maximum_score: string | number; principal_remark?: string };
  onSave: (remark: string) => void;
  onClose: () => void;
}) {
  const [template, setTemplate] = useState(row.principal_remark || "");
  const [previewGender, setPreviewGender] = useState<"male" | "female">("male");
  const textareaRef = (el: HTMLTextAreaElement | null) => { if (el) el.focus(); };

  const preview = compileLivePreview(template, previewGender);

  const insertPlaceholder = (ph: string) => {
    setTemplate((prev) => prev + ph);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end tablet:items-center justify-center p-0 tablet:p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full tablet:max-w-lg bg-surface rounded-t-2xl tablet:rounded-2xl shadow-2xl border border-border flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-border">
          <div>
            <h3 className="text-h3 font-bold text-text-primary">Edit Principal Remark</h3>
            <p className="text-caption text-text-muted mt-0.5">
              Grade <strong className="text-text-primary">{row.grade}</strong> &nbsp;·&nbsp; {row.minimum_score}–{row.maximum_score} marks
            </p>
          </div>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary p-1.5 rounded-sm transition-colors text-lg leading-none" aria-label="Close">
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Placeholder chips */}
          <div>
            <p className="text-caption font-semibold text-text-secondary mb-2">Insert Placeholder</p>
            <div className="flex flex-wrap gap-2">
              {PLACEHOLDERS.map((ph) => (
                <button
                  key={ph.label}
                  type="button"
                  onClick={() => insertPlaceholder(ph.label)}
                  title={ph.desc}
                  className="px-2.5 py-1 rounded-md text-caption font-mono bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors"
                >
                  {ph.label}
                </button>
              ))}
            </div>
          </div>

          {/* Template textarea */}
          <div>
            <label className="text-caption font-semibold text-text-secondary block mb-2">Remark Template</label>
            <textarea
              ref={textareaRef}
              className="w-full px-3 py-2.5 border border-border rounded-lg text-small bg-bg resize-y focus:outline-none focus:border-primary transition-colors leading-relaxed"
              rows={5}
              placeholder={`e.g. {name} has performed excellently this term. {He/She} should continue working hard.`}
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
            />
          </div>

          {/* Live Preview */}
          <div className="rounded-xl border border-border bg-bg overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-surface">
              <p className="text-caption font-semibold text-text-secondary">Live Preview</p>
              <div className="flex items-center gap-1 bg-bg rounded-full p-0.5 border border-border">
                <button
                  type="button"
                  onClick={() => setPreviewGender("male")}
                  className={`px-3 py-0.5 rounded-full text-caption font-semibold transition-all ${previewGender === "male" ? "bg-primary text-text-inverse shadow-sm" : "text-text-muted hover:text-text-secondary"}`}
                >
                  ♂ Male
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewGender("female")}
                  className={`px-3 py-0.5 rounded-full text-caption font-semibold transition-all ${previewGender === "female" ? "bg-primary text-text-inverse shadow-sm" : "text-text-muted hover:text-text-secondary"}`}
                >
                  ♀ Female
                </button>
              </div>
            </div>
            <p className="px-4 py-3 text-small text-text-primary leading-relaxed italic min-h-[3.5rem]">
              {preview || <span className="text-text-muted not-italic">Preview will appear here as you type…</span>}
            </p>
          </div>

          {/* Helper note */}
          <div className="flex items-start gap-2 bg-info-bg border border-info rounded-lg px-3 py-2.5">
            <span className="text-info text-base shrink-0">ℹ</span>
            <p className="text-caption text-info leading-relaxed">
              The system replaces placeholders automatically based on each student&apos;s name, gender, and computed average. <strong>Name</strong> refers to first name only.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-border flex gap-3 justify-end">
          <Button variant="ghost" type="button" onClick={onClose}>Cancel</Button>
          <Button type="button" onClick={() => { onSave(template); onClose(); }}>Save Remark</Button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────────────
function AssessmentSeparatedPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  
  const currentTab = (searchParams.get("tab") as TabType) || "components";
  
  // Redirect academic_levels tab to dedicated page
  useEffect(() => {
    if (currentTab === "academic_levels") router.push("/school-admin/academic-levels");
  }, [currentTab]);
  
  const tab = currentTab === "academic_levels" ? "components" : currentTab;
  
  const setTab = (newTab: TabType) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", newTab);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };
  const [gradingSubTab, setGradingSubTab] = useState<GradingSubTab>("grade_config");
  const [classes, setClasses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [templates, setTemplates] = useState<{ [key in TabType]: any[] }>({
    components: [],
    grading: [],
    psychomotor: [],
    affective: [],
    academic_levels: [],
  });

  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Form State
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [selectedClasses, setSelectedClasses] = useState<string[]>([]);
  const [rows, setRows] = useState<any[]>([]);

  // Remark editor modal
  const [editingRemarkIndex, setEditingRemarkIndex] = useState<number | null>(null);

  // Confirm
  const [confirm, setConfirm] = useState({ open: false, id: "" });

  const endpoints: Record<TabType, string> = {
    components: "/api/school-admin/assessment-components",
    grading: "/api/school-admin/grading-scales",
    psychomotor: "/api/school-admin/psychomotor",
    affective: "/api/school-admin/affective",
    academic_levels: "/api/school-admin/academic-levels",
  };

  const flash = (type: "success" | "error", text: string) => {
    setMsg({ type, text });
    setTimeout(() => setMsg(null), 4000);
  };

  const loadAll = async () => {
    setLoading(true);
    try {
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
        academic_levels: [],
      });
      setClasses(Array.isArray(cls) ? cls : []);
    } catch {
      flash("error", "Failed to load assessment data. Please refresh.");
    }
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
    setGradingSubTab("grade_config");
    setEditingRemarkIndex(null);
  };

  const openAdd = () => {
    resetForm();
    setIsFormOpen(true);
  };

  const openEdit = (t: any) => {
    setEditId(t.id);
    setName(t.name);
    const relKey = `class_${tab}_templates`;
    setSelectedClasses(t[relKey]?.map((c: any) => c.class_id) || []);
    const rowKey =
      tab === "components" ? "components_rows" :
      tab === "grading" ? "grading_rows" :
      tab === "psychomotor" ? "psychomotor_rows" : "affective_rows";
    setRows(t[rowKey] || []);
    setIsFormOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return flash("error", "Template name is required.");
    setIsSubmitting(true);
    const res = await fetch(endpoints[tab], {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: editId, name, class_ids: selectedClasses, rows }),
    });
    setIsSubmitting(false);
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

  const updateRow = (index: number, field: string, value: any) => {
    setRows((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };
  const addRow = (defaultValues: any) => setRows((prev) => [...prev, defaultValues]);
  const removeRow = (index: number) => setRows((prev) => prev.filter((_, i) => i !== index));

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
    </div>
  );

  const currentTemplates = templates[tab];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-h1 font-bold">Assessment Configuration</h1>
        <p className="text-text-secondary text-small mt-1">
          Create templates for score components, grading scales, and behavioural traits, and assign them to classes.
        </p>
      </div>

      {/* Flash message */}
      {msg && (
        <div className={`px-4 py-3 rounded-lg text-small font-medium ${msg.type === "success" ? "bg-success-bg text-success border border-success" : "bg-error-bg text-error border border-error"}`}>
          {msg.text}
        </div>
      )}

      {/* TOP-LEVEL TABS */}
      <div className="flex gap-0 border-b border-border overflow-x-auto">
        {[
          { k: "components", l: "Components", tip: "Define CA1, CA2, Exam and their max scores" },
          { k: "grading", l: "Grading Scale", tip: "Map score ranges to letter grades (A, B, C...)" },
          { k: "psychomotor", l: "Psychomotor", tip: "Define trait names for skills assessment" },
          { k: "affective", l: "Affective", tip: "Define trait names for behaviour assessment" },
          { k: "academic_levels", l: "Academic Levels", tip: "Group classes and assign templates once" },
        ].map((t) => (
          <button
            key={t.k}
            onClick={() => {
              if (t.k === "academic_levels") { router.push("/school-admin/academic-levels"); return; }
              setTab(t.k as TabType); resetForm();
            }}
            title={t.tip}
            className={`px-4 py-2.5 text-small font-semibold border-b-2 whitespace-nowrap transition-colors ${tab === t.k ? "border-primary text-primary" : "border-transparent text-text-secondary hover:text-text-primary"}`}
          >
            {t.l}
          </button>
        ))}
      </div>

      {/* Section header row */}
      <div className="flex flex-wrap gap-3 justify-between items-center">
        <h2 className="text-h2 font-bold">
          {tab === "grading" ? "Grading Scale" : tab.charAt(0).toUpperCase() + tab.slice(1)} Templates
        </h2>
        {!isFormOpen && <Button onClick={openAdd}>Create Template</Button>}
      </div>

      {/* ─────────── FORM ─────────── */}
      {isFormOpen ? (
        <Card className="animate-fade-in shadow-lg border border-border-strong p-0 overflow-hidden">
          <form onSubmit={handleSave}>
            {/* Form header */}
            <div className="bg-surface p-5 border-b border-border">
              <h2 className="text-h3 font-bold mb-4">
                {editId ? "Edit" : "New"} {tab === "grading" ? "Grading Scale" : tab.charAt(0).toUpperCase() + tab.slice(1)} Template
              </h2>
              <Input
                label="Template Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Primary School Template"
                required
              />
            </div>

            <div className="p-5 bg-surface space-y-6">
              {/* CLASSES */}
              <div>
                <label className="block text-small font-semibold text-text-secondary mb-2">Assign Classes</label>
                {classes.length === 0 ? (
                  <p className="text-caption text-text-muted">No classes available.</p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                    {classes.map((c) => (
                      <label key={c.id} className="flex items-center gap-2 cursor-pointer p-2 border border-border rounded-lg hover:bg-bg transition-colors">
                        <input type="checkbox" checked={selectedClasses.includes(c.id)} onChange={() => toggleClass(c.id)} className="accent-primary w-4 h-4 shrink-0" />
                        <span className="text-small font-medium">{c.name}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              <hr className="border-border" />

              {/* ── GRADING: Sub-tabs ── */}
              {tab === "grading" ? (
                <div className="space-y-4">
                  {/* Sub-tab pill switcher */}
                  <div className="flex gap-1 bg-bg rounded-xl p-1 w-fit border border-border">
                    <button
                      type="button"
                      onClick={() => setGradingSubTab("grade_config")}
                      className={`px-4 py-1.5 rounded-lg text-small font-semibold transition-all ${gradingSubTab === "grade_config" ? "bg-surface shadow text-text-primary" : "text-text-muted hover:text-text-secondary"}`}
                    >
                      Grade Configuration
                    </button>
                    <button
                      type="button"
                      onClick={() => setGradingSubTab("principal_remarks")}
                      className={`px-4 py-1.5 rounded-lg text-small font-semibold transition-all ${gradingSubTab === "principal_remarks" ? "bg-surface shadow text-text-primary" : "text-text-muted hover:text-text-secondary"}`}
                    >
                      Principal Remarks ✨
                    </button>
                  </div>

                  {/* ── Grade Configuration ── */}
                  {gradingSubTab === "grade_config" && (
                    <div className="space-y-3">
                      {rows.length === 0 && (
                        <div className="flex justify-end mb-2">
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                              setRows(PLATFORM_DEFAULTS.grading.map(g => ({
                                grade: g.grade,
                                minimum_score: g.minimum_score,
                                maximum_score: g.maximum_score,
                                remark: g.remark,
                                principal_remark: g.principal_remark,
                              })));
                            }}
                          >
                            ✨ Load Platform Defaults
                          </Button>
                        </div>
                      )}
                      {rows.map((r, i) => (
                        <div key={i} className="flex flex-wrap gap-2 items-end p-3 border border-border rounded-xl bg-bg">
                          <div className="w-20">
                            <label className="text-caption font-semibold text-text-secondary">Grade</label>
                            <input type="text" className="w-full px-3 py-2 border border-border rounded-lg text-small mt-1 bg-surface focus:outline-none focus:border-primary" value={r.grade || ""} onChange={(e) => updateRow(i, "grade", e.target.value)} placeholder="A" required />
                          </div>
                          <div className="w-24">
                            <label className="text-caption font-semibold text-text-secondary">Min Score</label>
                            <input type="number" className="w-full px-3 py-2 border border-border rounded-lg text-small mt-1 bg-surface focus:outline-none focus:border-primary" value={r.minimum_score || ""} onChange={(e) => updateRow(i, "minimum_score", e.target.value)} required />
                          </div>
                          <div className="w-24">
                            <label className="text-caption font-semibold text-text-secondary">Max Score</label>
                            <input type="number" className="w-full px-3 py-2 border border-border rounded-lg text-small mt-1 bg-surface focus:outline-none focus:border-primary" value={r.maximum_score || ""} onChange={(e) => updateRow(i, "maximum_score", e.target.value)} required />
                          </div>
                          <div className="flex-1 min-w-[120px]">
                            <label className="text-caption font-semibold text-text-secondary">Remark</label>
                            <input type="text" className="w-full px-3 py-2 border border-border rounded-lg text-small mt-1 bg-surface focus:outline-none focus:border-primary" value={r.remark || ""} onChange={(e) => updateRow(i, "remark", e.target.value)} placeholder="Excellent" />
                          </div>
                          <Button variant="ghost" type="button" size="sm" className="text-error shrink-0" onClick={() => removeRow(i)}>✕</Button>
                        </div>
                      ))}
                      <Button type="button" variant="ghost" onClick={() => addRow({ grade: "", minimum_score: "", maximum_score: "", remark: "", principal_remark: "" })}>
                        + Add Grade Row
                      </Button>
                    </div>
                  )}

                  {/* ── Principal Remarks ── */}
                  {gradingSubTab === "principal_remarks" && (
                    <div className="space-y-4">
                      {rows.length === 0 ? (
                        <div className="py-12 text-center border border-dashed border-border rounded-xl">
                          <p className="text-text-muted text-small font-medium mb-1">No grade rows configured yet</p>
                          <p className="text-caption text-text-muted">
                            Switch to <strong>Grade Configuration</strong> to add grades first, then return here.
                          </p>
                          <button
                            type="button"
                            className="mt-3 text-small text-primary font-semibold hover:underline"
                            onClick={() => setGradingSubTab("grade_config")}
                          >
                            Go to Grade Configuration →
                          </button>
                        </div>
                      ) : (
                        <>
                          <p className="text-caption text-text-muted leading-relaxed">
                            Configure what the Principal&apos;s section will automatically say for each grade band. Use placeholders like <code className="bg-bg px-1 py-0.5 rounded text-primary font-mono">{"{name}"}</code>, <code className="bg-bg px-1 py-0.5 rounded text-primary font-mono">{"{average}"}</code>, <code className="bg-bg px-1 py-0.5 rounded text-primary font-mono">{"{He/She}"}</code> and more.
                          </p>

                          <div className="border border-border rounded-xl overflow-hidden">
                            <table className="w-full text-small">
                              <thead>
                                <tr className="bg-bg border-b border-border">
                                  <th className="px-4 py-3 text-left text-caption text-text-muted font-semibold uppercase tracking-wide w-16">Grade</th>
                                  <th className="px-4 py-3 text-left text-caption text-text-muted font-semibold uppercase tracking-wide hidden tablet:table-cell w-28">Range</th>
                                  <th className="px-4 py-3 text-left text-caption text-text-muted font-semibold uppercase tracking-wide">Principal Remark Template</th>
                                  <th className="px-4 py-3 text-right text-caption text-text-muted font-semibold uppercase tracking-wide w-20">Action</th>
                                </tr>
                              </thead>
                              <tbody>
                                {rows.map((r, i) => (
                                  <tr key={i} className="border-t border-border hover:bg-bg/60 transition-colors">
                                    <td className="px-4 py-3">
                                      <span className="font-bold text-text-primary">{r.grade || "—"}</span>
                                    </td>
                                    <td className="px-4 py-3 text-text-muted text-caption hidden tablet:table-cell">
                                      {r.minimum_score}–{r.maximum_score}
                                    </td>
                                    <td className="px-4 py-3">
                                      {r.principal_remark ? (
                                        <span className="text-caption text-text-secondary italic line-clamp-2">{r.principal_remark}</span>
                                      ) : (
                                        <span className="text-caption text-text-muted">
                                          No template yet — tap <strong>Edit</strong> to add.
                                        </span>
                                      )}
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setEditingRemarkIndex(i)}
                                      >
                                        {r.principal_remark ? "Edit" : "+ Add"}
                                      </Button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>

                          {/* completion status */}
                          <p className="text-caption text-text-muted">
                            {rows.filter((r) => r.principal_remark).length} of {rows.length} remark templates configured.
                          </p>
                        </>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                /* ── Non-grading rows ── */
                <div>
                  <label className="block text-small font-semibold text-text-secondary mb-3">Rows</label>

                  {tab === "components" && (
                    <div className="space-y-3">
                      {rows.map((r, i) => (
                        <div key={i} className="flex gap-3 items-end">
                          <div className="flex-1">
                            <label className="text-caption font-semibold text-text-secondary">Component Name</label>
                            <input type="text" className="w-full px-3 py-2 border border-border rounded-lg text-small mt-1 bg-bg focus:outline-none focus:border-primary" value={r.name || ""} onChange={(e) => updateRow(i, "name", e.target.value)} placeholder="e.g. Exam" required />
                          </div>
                          <div className="w-32">
                            <label className="text-caption font-semibold text-text-secondary">Max Score</label>
                            <input type="number" className="w-full px-3 py-2 border border-border rounded-lg text-small mt-1 bg-bg focus:outline-none focus:border-primary" value={r.maximum_score || ""} onChange={(e) => updateRow(i, "maximum_score", e.target.value)} required />
                          </div>
                          <Button variant="ghost" type="button" className="text-error" onClick={() => removeRow(i)}>✕</Button>
                        </div>
                      ))}
                      <Button type="button" variant="ghost" onClick={() => addRow({ name: "", maximum_score: "" })}>+ Add Component</Button>
                    </div>
                  )}

                  {(tab === "psychomotor" || tab === "affective") && (
                    <div className="space-y-3">
                      {rows.map((r, i) => (
                        <div key={i} className="flex gap-3 items-end">
                          <div className="flex-1">
                            <label className="text-caption font-semibold text-text-secondary">Trait Name</label>
                            <input type="text" className="w-full px-3 py-2 border border-border rounded-lg text-small mt-1 bg-bg focus:outline-none focus:border-primary" value={r.name || ""} onChange={(e) => updateRow(i, "name", e.target.value)} placeholder="e.g. Handwriting" required />
                          </div>
                          <Button variant="ghost" type="button" className="text-error" onClick={() => removeRow(i)}>✕</Button>
                        </div>
                      ))}
                      <Button type="button" variant="ghost" onClick={() => addRow({ name: "" })}>+ Add Trait</Button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Form Footer */}
            <div className="p-5 border-t border-border bg-surface flex justify-end gap-3">
              <Button type="button" variant="ghost" onClick={resetForm} disabled={isSubmitting}>Cancel</Button>
              <Button type="submit" loading={isSubmitting}>Save Template</Button>
            </div>
          </form>
        </Card>
      ) : (
        /* ─────────── TEMPLATE LIST ─────────── */
        <div className="grid gap-4">
          {currentTemplates.length === 0 ? (
            <Card variant="default" className="text-center py-12">
              <p className="text-text-muted text-body mb-4">
                No {tab === "grading" ? "Grading Scale" : tab} templates configured yet.
              </p>
              <Button onClick={openAdd}>Create First Template</Button>
            </Card>
          ) : (
            currentTemplates.map((t) => (
              <Card key={t.id} variant="default" className="shadow-sm">
                <div className="flex justify-between items-start">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-h3 font-bold text-text-primary">{t.name}</h3>
                    <p className="text-caption text-text-muted mt-0.5">
                      Assigned to {t[`class_${tab}_templates`]?.length || 0} class(es)
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0 ml-3">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(t)}>Edit</Button>
                    <Button variant="danger" size="sm" onClick={() => setConfirm({ open: true, id: t.id })}>Delete</Button>
                  </div>
                </div>

                {/* Grading rows summary with remark status badges */}
                {tab === "grading" && t.grading_rows && t.grading_rows.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-border">
                    <div className="flex flex-wrap gap-2 items-center">
                      {t.grading_rows
                        .slice()
                        .sort((a: any, b: any) => Number(b.minimum_score) - Number(a.minimum_score))
                        .map((gr: any, idx: number) => (
                          <span
                            key={idx}
                            className={`px-2.5 py-0.5 rounded-full text-caption font-semibold border ${gr.principal_remark ? "bg-success-bg text-success border-success" : "bg-bg text-text-muted border-border"}`}
                            title={gr.principal_remark ? gr.principal_remark : "No remark set"}
                          >
                            {gr.grade} {gr.principal_remark ? "✓" : ""}
                          </span>
                        ))}
                      <span className="text-caption text-text-muted">
                        {t.grading_rows.filter((g: any) => g.principal_remark).length}/{t.grading_rows.length} remarks configured
                      </span>
                    </div>
                  </div>
                )}

                {tab !== "grading" && (
                  <p className="text-caption text-text-secondary mt-2">
                    {t[tab === "components" ? "components_rows" : tab === "psychomotor" ? "psychomotor_rows" : "affective_rows"]?.length || 0} items configured
                  </p>
                )}
              </Card>
            ))
          )}
        </div>
      )}

      {/* ── Remark Editor Modal ── */}
      {editingRemarkIndex !== null && rows[editingRemarkIndex] && (
        <RemarkEditorModal
          row={rows[editingRemarkIndex]}
          onSave={(remark) => updateRow(editingRemarkIndex, "principal_remark", remark)}
          onClose={() => setEditingRemarkIndex(null)}
        />
      )}

      <ConfirmDialog
        open={confirm.open}
        title="Delete Template"
        message="Are you sure you want to delete this template? All assigned classes will lose this configuration."
        onConfirm={handleDelete}
        onCancel={() => setConfirm({ open: false, id: "" })}
      />
    </div>
  );
}

export default function AssessmentSeparatedPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-text-muted animate-pulse">Loading...</div>}>
      <AssessmentSeparatedPageContent />
    </Suspense>
  );
}
