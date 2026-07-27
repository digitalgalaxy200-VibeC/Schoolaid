"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { showToast } from "@/components/ui/Toast";

interface ReportCardSettings {
  show_position: boolean;
  show_average: boolean;
  show_attendance: boolean;
  show_psychomotor: boolean;
  show_affective: boolean;
  show_teacher_remark: boolean;
  show_admin_remark: boolean;
  show_grading_key: boolean;
  show_photo: boolean;
  show_gender: boolean;
  show_dob: boolean;
  show_component_scores: boolean;
}

const defaultSettings: ReportCardSettings = {
  show_position: true,
  show_average: true,
  show_attendance: true,
  show_psychomotor: true,
  show_affective: true,
  show_teacher_remark: true,
  show_admin_remark: true,
  show_grading_key: true,
  show_photo: true,
  show_gender: true,
  show_dob: true,
  show_component_scores: true,
};

export default function ReportCardSettingsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<ReportCardSettings>(defaultSettings);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const res = await fetch("/api/school-admin/report-card-settings");
      if (!res.ok) throw new Error("Failed to load settings");
      const data = await res.json();
      if (Object.keys(data).length > 0) {
        setSettings(data as ReportCardSettings);
      }
    } catch (err: any) {
      showToast({ type: "error", title: "Error", message: err.message || "Error loading settings" });
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = (key: keyof ReportCardSettings) => {
    setSettings(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/school-admin/report-card-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to save settings");
      }
      
      showToast({ type: "success", title: "Success", message: "Settings saved successfully" });
      router.refresh();
    } catch (err: any) {
      showToast({ type: "error", title: "Error", message: err.message || "Error saving settings" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-[400px] items-center justify-center">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  const toggleItems: { key: keyof ReportCardSettings; label: string; description: string }[] = [
    { key: "show_position", label: "Show Position", description: "Display the student's position/rank in the class." },
    { key: "show_average", label: "Show Average", description: "Display the student's overall average score." },
    { key: "show_attendance", label: "Show Attendance", description: "Include attendance records on the report card." },
    { key: "show_psychomotor", label: "Show Psychomotor Traits", description: "Display psychomotor evaluations." },
    { key: "show_affective", label: "Show Affective Traits", description: "Display affective traits/behavioral evaluations." },
    { key: "show_teacher_remark", label: "Show Teacher Remarks", description: "Include the class teacher's comment." },
    { key: "show_admin_remark", label: "Show Admin Remarks", description: "Include the school admin/principal's comment." },
    { key: "show_grading_key", label: "Show Grading Key", description: "Display the grading scale legend at the bottom." },
    { key: "show_photo", label: "Show Student Photo", description: "Display the student's passport photograph." },
    { key: "show_gender", label: "Show Gender", description: "Display the student's gender." },
    { key: "show_dob", label: "Show Date of Birth", description: "Display the student's date of birth." },
    { key: "show_component_scores", label: "Show Component Scores", description: "Show breakdown of CA1, CA2, Exam instead of just total score." },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Report Card Settings</h1>
          <p className="text-muted-foreground">Configure what information appears on student report cards.</p>
        </div>
        <Button onClick={handleSave} disabled={saving} loading={saving}>
          Save Changes
        </Button>
      </div>

      <div className="grid gap-6">
        <div className="rounded-lg border bg-card text-card-foreground shadow-sm">
          <div className="p-6 space-y-8">
            <div className="grid gap-6 sm:grid-cols-2">
              {toggleItems.map((item) => (
                <div key={item.key} className="flex flex-row items-center justify-between rounded-lg border p-4 hover:bg-accent/50 transition-colors">
                  <div className="space-y-0.5">
                    <label htmlFor={item.key} className="text-base font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer">
                      {item.label}
                    </label>
                    <p className="text-sm text-muted-foreground">
                      {item.description}
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    id={item.key}
                    checked={settings[item.key]}
                    onChange={() => handleToggle(item.key)}
                    className="h-5 w-5 rounded border-gray-300 text-primary focus:ring-primary"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
