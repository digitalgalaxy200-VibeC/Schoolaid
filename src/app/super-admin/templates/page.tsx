"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Badge, Button } from "@/components/ui";

type Template = {
  id: string;
  name: string;
  description: string | null;
  status: "draft" | "published" | "archived";
  version: number;
  created_at: string;
  sections: [{ count: number }];
};

export default function TemplateLibraryPage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const load = () => {
    setLoading(true);
    fetch("/api/super-admin/templates")
      .then((r) => r.json())
      .then((d) => setTemplates(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const createTemplate = async () => {
    setCreating(true);
    const res = await fetch("/api/super-admin/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "New Template",
        description: "",
        sections: [
          { section_key: "header", label: "School Header", display_order: 0 },
          { section_key: "student_info", label: "Student Information", display_order: 1 },
          { section_key: "attendance", label: "Attendance", display_order: 2 },
          { section_key: "academic", label: "Academic Performance", display_order: 3 },
          { section_key: "grading_key", label: "Grading System", display_order: 4 },
          { section_key: "teacher_comment", label: "Teacher's Comment", display_order: 5 },
          { section_key: "principal_comment", label: "Principal's Remark", display_order: 6 },
          { section_key: "footer", label: "Footer", display_order: 7 },
        ],
      }),
    });
    if (res.ok) {
      const t = await res.json();
      router.push(`/super-admin/templates/${t.id}`);
    }
    setCreating(false);
  };

  const statusVariant = (s: string) => {
    if (s === "published") return "success" as const;
    if (s === "draft") return "warning" as const;
    return "default" as const;
  };

  if (loading) return <p className="text-text-muted text-small py-8 text-center">Loading…</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-h1 font-bold">Report Card Templates</h1>
          <p className="text-small text-text-muted">Manage the platform template library. Schools pick from published templates.</p>
        </div>
        <Button onClick={createTemplate} loading={creating}>+ New Template</Button>
      </div>

      {templates.length === 0 ? (
        <Card variant="bordered" className="text-center py-10">
          <p className="text-small text-text-muted">No templates yet. Create your first template to get started.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 tablet:grid-cols-2 gap-4">
          {templates.map((t) => (
            <Card key={t.id} variant="bordered" className="hover:border-primary cursor-pointer transition-colors" onClick={() => router.push(`/super-admin/templates/${t.id}`)}>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-h3 font-bold">{t.name}</h3>
                <Badge variant={statusVariant(t.status)}>{t.status}</Badge>
              </div>
              {t.description && <p className="text-small text-text-muted mb-2">{t.description}</p>}
              <div className="flex items-center gap-4 text-caption text-text-muted">
                <span>v{t.version}</span>
                <span>{t.sections?.[0]?.count ?? 0} sections</span>
                <span>{new Date(t.created_at).toLocaleDateString()}</span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
