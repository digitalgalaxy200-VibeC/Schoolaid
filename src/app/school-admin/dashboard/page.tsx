"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui";

export default function SchoolAdminDashboard() {
  const [stats, setStats] = useState<any>(null);
  useEffect(() => {
    Promise.all([
      fetch("/api/school-admin/classes").then((r) => r.json()),
      fetch("/api/school-admin/teachers").then((r) => r.json()),
      fetch("/api/school-admin/students").then((r) => r.json()),
    ]).then(([classes, teachers, students]) =>
      setStats({
        classes: Array.isArray(classes) ? classes.length : 0,
        teachers: Array.isArray(teachers) ? teachers.length : 0,
        students: Array.isArray(students) ? students.length : 0,
      }),
    );
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-h1 font-bold">School Dashboard</h1>
      <div className="grid grid-cols-1 tablet:grid-cols-3 gap-4">
        <Card variant="default" className="shadow-sm text-center py-6">
          <p className="text-display font-extrabold text-primary">
            {stats?.classes ?? "—"}
          </p>
          <p className="text-caption text-text-muted uppercase font-mono mt-1">
            Classes
          </p>
        </Card>
        <Card variant="default" className="shadow-sm text-center py-6">
          <p className="text-display font-extrabold text-accent">
            {stats?.teachers ?? "—"}
          </p>
          <p className="text-caption text-text-muted uppercase font-mono mt-1">
            Teachers
          </p>
        </Card>
        <Card variant="default" className="shadow-sm text-center py-6">
          <p className="text-display font-extrabold text-success">
            {stats?.students ?? "—"}
          </p>
          <p className="text-caption text-text-muted uppercase font-mono mt-1">
            Students
          </p>
        </Card>
      </div>
    </div>
  );
}
