"use client";

import { useEffect, useState } from "react";
import { Card, Button } from "@/components/ui";

type Template = { id: string; name: string; description: string | null; version: number };
type Assignment = { id: string; grade_level: string; template_id: string };
type Config = { template_id: string; section_key: string; is_enabled: boolean; custom_label: string | null };

export default function SchoolTemplateSettingsPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [configs, setConfigs] = useState<Config[]>([]);
  const [gradeLevels, setGradeLevels] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [expandedLevel, setExpandedLevel] = useState<string | null>(null);
  const [sectionData, setSectionData] = useState<any[]>([]);
  const [loadingSections, setLoadingSections] = useState(false);
  const [editConfigs, setEditConfigs] = useState<Record<string, { enabled: boolean; label: string }>>({});

  const load = () => {
    setLoading(true);
    fetch("/api/school-admin/templates")
      .then((r) => r.json())
      .then((d) => {
        setTemplates(d.templates || []);
        setAssignments(d.assignments || []);
        setConfigs(d.configs || []);
        setGradeLevels(d.gradeLevels || []);
      })
      .catch(() => setMsg({ type: "error", text: "Failed to load templates. Please refresh." }))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const assignTemplate = async (gradeLevel: string, templateId: string) => {
    const res = await fetch("/api/school-admin/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ grade_level: gradeLevel, template_id: templateId }),
    });
    if (res.ok) {
      setMsg({ type: "success", text: "Template assigned" });
      setTimeout(() => setMsg(null), 2000);
      load();
    }
  };

  const loadSections = async (templateId: string) => {
    setLoadingSections(true);
    const sRes = await fetch(`/api/school-admin/templates?template_id=${templateId}`);
    if (sRes.ok) {
      const sData = await sRes.json();
      setSectionData(sData.sections || []);
      const existingConfigs: Config[] = sData.configs || [];
      const ec: Record<string, { enabled: boolean; label: string }> = {};
      for (const s of sData.sections || []) {
        const cfg = existingConfigs.find((c: Config) => c.section_key === s.section_key);
        ec[s.section_key] = {
          enabled: cfg ? cfg.is_enabled : s.is_enabled,
          label: cfg?.custom_label || s.label,
        };
      }
      setEditConfigs(ec);
    }
    setLoadingSections(false);
  };

  const expandLevel = (gradeLevel: string) => {
    const assignment = assignments.find((a) => a.grade_level === gradeLevel);
    if (!assignment) return;
    if (expandedLevel === gradeLevel) { setExpandedLevel(null); return; }
    setExpandedLevel(gradeLevel);
    loadSections(assignment.template_id);
  };

  const saveConfigs = async (templateId: string) => {
    const configPayload = Object.entries(editConfigs).map(([section_key, val]) => ({
      section_key,
      is_enabled: val.enabled,
      custom_label: val.label !== sectionData.find((s) => s.section_key === section_key)?.label ? val.label : null,
    }));

    const res = await fetch("/api/school-admin/templates", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ template_id: templateId, configs: configPayload }),
    });

    if (res.ok) {
      setMsg({ type: "success", text: "Settings saved" });
      setTimeout(() => setMsg(null), 2000);
      load();
    }
  };

  if (loading) return <p className="text-text-muted text-small py-8 text-center">Loading…</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-h1 font-bold">Report Card Settings</h1>
        <p className="text-small text-text-muted">Choose templates for each academic section and customize which sections appear.</p>
      </div>

      {msg && (
        <div className={`px-4 py-2 rounded-sm text-small font-medium ${msg.type === "success" ? "bg-success-bg text-success" : "bg-error-bg text-error"}`}>
          {msg.text}
        </div>
      )}

      {gradeLevels.length === 0 ? (
        <Card variant="default" className="text-center py-10">
          <p className="text-small text-text-muted">No classes configured yet. Set up classes first.</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {gradeLevels.map((gl) => {
            const assignment = assignments.find((a) => a.grade_level === gl);
            const isExpanded = expandedLevel === gl;

            return (
              <Card key={gl} variant="default">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <h3 className="text-h3 font-bold">{gl}</h3>
                    <p className="text-caption text-text-muted">
                      {assignment
                        ? `Using: ${templates.find((t) => t.id === assignment.template_id)?.name || "Unknown"}`
                        : "No template selected"}
                    </p>
                  </div>
                  <div className="flex gap-2 items-center">
                    <select
                      value={assignment?.template_id || ""}
                      onChange={(e) => assignTemplate(gl, e.target.value)}
                      className="border border-border rounded-sm px-3 py-1.5 text-small bg-surface"
                    >
                      <option value="">Select template</option>
                      {templates.map((t) => (
                        <option key={t.id} value={t.id}>{t.name} (v{t.version})</option>
                      ))}
                    </select>
                    {assignment && (
                      <Button variant="ghost" size="sm" onClick={() => expandLevel(gl)}>
                        {isExpanded ? "Collapse" : "Customize"}
                      </Button>
                    )}
                  </div>
                </div>

                {isExpanded && assignment && (
                  <div className="mt-4 pt-4 border-t border-border">
                    {loadingSections ? (
                      <p className="text-caption text-text-muted">Loading sections…</p>
                    ) : (
                      <div className="space-y-3">
                        {sectionData.map((s: any) => (
                          <div key={s.section_key} className="flex items-center gap-3 flex-wrap">
                            <label className="flex items-center gap-2 cursor-pointer min-w-[200px]">
                              <input
                                type="checkbox"
                                checked={editConfigs[s.section_key]?.enabled ?? true}
                                onChange={(e) => setEditConfigs((prev) => ({
                                  ...prev,
                                  [s.section_key]: { ...prev[s.section_key], enabled: e.target.checked },
                                }))}
                                className="w-4 h-4"
                              />
                              <span className="text-small">{editConfigs[s.section_key]?.label || s.label}</span>
                            </label>
                            <input
                              value={editConfigs[s.section_key]?.label || s.label}
                              onChange={(e) => setEditConfigs((prev) => ({
                                ...prev,
                                [s.section_key]: { ...prev[s.section_key], label: e.target.value },
                              }))}
                              className="border border-border rounded-sm px-2 py-1 text-small bg-surface flex-1 max-w-xs"
                              placeholder="Custom label"
                              disabled={!editConfigs[s.section_key]?.enabled}
                            />
                          </div>
                        ))}
                        <Button size="sm" onClick={() => saveConfigs(assignment.template_id)}>Save Settings</Button>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
