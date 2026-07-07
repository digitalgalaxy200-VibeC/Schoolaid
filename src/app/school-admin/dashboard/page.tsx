"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Card, Badge } from "@/components/ui";

type Stats = {
  teachers: number;
  students: number;
  classes: number;
  subjects: number;
  activeterm: string;
};

export default function SchoolAdminDashboard() {
  const router = useRouter();
  const [stats,   setStats]   = useState<Stats | null>(null);
  const [school,  setSchool]  = useState<{ school_name: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const supabase  = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/auth/login"); return; }

      const schoolId = user.app_metadata?.school_id as string;

      const [schoolRes, teachersRes, studentsRes, classesRes, subjectsRes, termRes] =
        await Promise.all([
          supabase.from("schools").select("school_name").eq("id", schoolId).single(),
          supabase.from("teachers").select("id", { count: "exact", head: true }).eq("school_id", schoolId).eq("status", "active"),
          supabase.from("students").select("id", { count: "exact", head: true }).eq("school_id", schoolId).eq("status", "active"),
          supabase.from("classes").select("id",   { count: "exact", head: true }).eq("school_id", schoolId),
          supabase.from("subjects").select("id",  { count: "exact", head: true }).eq("school_id", schoolId),
          supabase.from("terms").select("term_name").eq("school_id", schoolId).eq("is_active", true).single(),
        ]);

      setSchool(schoolRes.data);
      setStats({
        teachers:   teachersRes.count  ?? 0,
        students:   studentsRes.count  ?? 0,
        classes:    classesRes.count   ?? 0,
        subjects:   subjectsRes.count  ?? 0,
        activeterm: termRes.data?.term_name ?? "No active term",
      });
      setLoading(false);
    };
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  const statCards = [
    { label: "Teachers",  value: stats?.teachers,  color: "text-primary" },
    { label: "Students",  value: stats?.students,  color: "text-success" },
    { label: "Classes",   value: stats?.classes,   color: "text-primary" },
    { label: "Subjects",  value: stats?.subjects,  color: "text-accent"  },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-h1 font-bold">{school?.school_name ?? "Dashboard"}</h1>
          <p className="text-small text-text-muted mt-1">School overview</p>
        </div>
        <Badge variant="success">{stats?.activeterm}</Badge>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 tablet:grid-cols-4 gap-4">
        {statCards.map((s) => (
          <Card key={s.label} variant="default" className="shadow-sm text-center">
            <p className={`text-display font-extrabold ${s.color}`}>{s.value ?? 0}</p>
            <p className="text-caption text-text-muted uppercase tracking-wider font-mono mt-1">{s.label}</p>
          </Card>
        ))}
      </div>

      {/* Quick Actions */}
      <Card variant="bordered" className="shadow-sm">
        <h2 className="text-h3 font-bold mb-4">Quick Actions</h2>
        <div className="grid grid-cols-2 tablet:grid-cols-3 gap-3">
          {[
            { label: "Add Teacher",   href: "/school-admin/teachers" },
            { label: "Add Student",   href: "/school-admin/students" },
            { label: "Manage Classes",href: "/school-admin/classes"  },
            { label: "Set Grading",   href: "/school-admin/grading"  },
            { label: "Assessment",    href: "/school-admin/assessment"},
            { label: "View Reports",  href: "/school-admin/reports"  },
          ].map((a) => (
            <button
              key={a.href}
              onClick={() => router.push(a.href)}
              className="px-4 py-3 bg-bg border border-border rounded-sm text-small font-medium text-text-secondary hover:bg-primary-light hover:text-primary hover:border-primary transition-colors text-left"
            >
              {a.label}
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}
