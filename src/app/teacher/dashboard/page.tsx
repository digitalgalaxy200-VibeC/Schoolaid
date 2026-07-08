"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui";
import { Card } from "@/components/ui";

export default function TeacherDashboard() {
  const [classes, setClasses] = useState<any[]>([]);
  const [email, setEmail] = useState("");

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setEmail(d.email || ""));
    fetch("/api/teacher/classes")
      .then((r) => r.json())
      .then((d) => setClasses(Array.isArray(d) ? d : []));
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-h1 font-bold">My Classes</h1>
      <div className="grid grid-cols-1 tablet:grid-cols-2 desktop:grid-cols-3 gap-4">
        {classes.map((c) => (
          <Card
            key={c.id}
            variant="bordered"
            className="shadow-sm hover:shadow-md transition-shadow"
          >
            <h3 className="text-h3 font-bold">
              {c.subjects?.name || "Subject"}
            </h3>
            <p className="text-small text-text-secondary mt-1">
              {c.classes?.name} • {c.classes?.grade_level}
            </p>
            <div className="mt-4 flex gap-2">
              <Button
                size="sm"
                variant="primary"
                onClick={() => {
                  const search = new URLSearchParams({
                    class_id: c.class_id,
                    subject_id: c.subject_id,
                    assignment_id: c.id,
                  });
                  window.location.href = `/teacher/scores?${search}`;
                }}
              >
                Enter Scores
              </Button>
            </div>
          </Card>
        ))}
        {classes.length === 0 && (
          <p className="text-text-muted">No classes assigned yet.</p>
        )}
      </div>
    </div>
  );
}
