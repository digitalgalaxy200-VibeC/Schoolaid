"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Badge, Button } from "@/components/ui";
import { ReportCardUI } from "@/components/report-card/ReportCardUI";
import { ReportCardData } from "@/lib/types/report-card";

const DUMMY_DATA: ReportCardData = {
  school: { name: "Sample Academy", logo_url: null, address: "123 Learning Lane, Lagos", phone: "+234 800 000 0000", email: "info@sample.edu", motto: "Excellence in Learning" },
  student: { name: "John Doe", admission_no: "ADM-2026-001", photo_url: null, gender: "Male", dob: "2015-03-12" },
  classInfo: { className: "Basic 4", position: 3, totalStudents: 25 },
  termInfo: { session: "2025/2026", term: "Second Term" },
  academic: {
    assessmentComponents: [
      { id: "c1", name: "Test 1", max_score: 20, order: 1 },
      { id: "c2", name: "Test 2", max_score: 20, order: 2 },
      { id: "c3", name: "Exam", max_score: 60, order: 3 },
    ],
    subjects: [
      { id: "1", name: "Mathematics", total_score: 85, grade: "A", remark: "Excellent", component_scores: { c1: 18, c2: 17, c3: 50 } },
      { id: "2", name: "English Language", total_score: 72, grade: "B", remark: "Very Good", component_scores: { c1: 15, c2: 14, c3: 43 } },
      { id: "3", name: "Basic Science", total_score: 68, grade: "B", remark: "Good", component_scores: { c1: 14, c2: 13, c3: 41 } },
      { id: "4", name: "Social Studies", total_score: 90, grade: "A", remark: "Excellent", component_scores: { c1: 19, c2: 18, c3: 53 } },
    ],
    grandTotal: 315, average: 78.75, overallGrade: "B", maxPossibleTotal: 400,
  },
  attendance: { daysOpened: 65, daysPresent: 62, daysAbsent: 3 },
  traits: {
    psychomotor: [{ name: "Handwriting", score: "4" }, { name: "Drawing", score: "3" }, { name: "Sports", score: "5" }],
    affective: [{ name: "Punctuality", score: "5" }, { name: "Neatness", score: "4" }, { name: "Honesty", score: "5" }],
  },
  remarks: { teacher: "A dedicated student who shows great enthusiasm for learning.", admin: "Keep up the excellent work!" },
  gradingScales: [
    { grade: "A", minimum_score: 70, maximum_score: 100, remark: "Excellent" },
    { grade: "B", minimum_score: 60, maximum_score: 69, remark: "Very Good" },
    { grade: "C", minimum_score: 50, maximum_score: 59, remark: "Good" },
    { grade: "D", minimum_score: 40, maximum_score: 49, remark: "Fair" },
    { grade: "F", minimum_score: 0, maximum_score: 39, remark: "Fail" },
  ],
  settings: { show_position: true, show_average: true, show_attendance: true, show_psychomotor: true, show_affective: true, show_teacher_remark: true, show_admin_remark: true, show_grading_key: true, show_photo: true, show_gender: true, show_dob: true, show_component_scores: true },
};

type Template = {
  id: string; name: string; description: string | null;
  status: "draft" | "published" | "archived"; version: number;
  created_at: string; sections: [{ count: number }];
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
    if (res.ok) { const t = await res.json(); router.push(`/super-admin/templates/${t.id}`); }
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
          <h1 className="text-h1 font-bold">Report Card Design Library</h1>
          <p className="text-small text-text-muted">Design and manage report card templates. Schools pick from published designs.</p>
        </div>
        <Button onClick={createTemplate} loading={creating}>+ New Design</Button>
      </div>

      {templates.length === 0 ? (
        <Card variant="default" className="text-center py-16">
          <div className="text-5xl mb-4">📄</div>
          <p className="text-h3 font-bold mb-2">No Templates Yet</p>
          <p className="text-small text-text-muted mb-4">Create your first report card design to build the platform's template library.</p>
          <Button onClick={createTemplate} loading={creating}>Create First Template</Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 desktop:grid-cols-2 gap-6">
          {templates.map((t) => (
            <Card key={t.id} variant="default" className="overflow-hidden hover:shadow-lg transition-shadow">
              {/* Visual Preview */}
              <div
                className="bg-gray-100 border-b border-border overflow-hidden cursor-pointer"
                style={{ height: "260px" }}
                onClick={() => router.push(`/super-admin/templates/${t.id}`)}
              >
                <div
                  className="origin-top-left"
                  style={{ transform: "scale(0.28)", width: "357%", height: "357%" }}
                >
                  <ReportCardUI data={DUMMY_DATA} />
                </div>
              </div>

              {/* Info */}
              <div className="p-4">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-h3 font-bold">{t.name}</h3>
                  <Badge variant={statusVariant(t.status)}>{t.status}</Badge>
                </div>
                {t.description && <p className="text-small text-text-muted mb-2">{t.description}</p>}
                <div className="flex items-center justify-between text-caption text-text-muted">
                  <div className="flex gap-3">
                    <span>v{t.version}</span>
                    <span>{t.sections?.[0]?.count ?? 0} sections</span>
                  </div>
                  <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); router.push(`/super-admin/templates/${t.id}`); }}>
                    Edit Design
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
