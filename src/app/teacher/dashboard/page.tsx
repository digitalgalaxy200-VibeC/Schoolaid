"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Badge } from "@/components/ui";

interface TeacherSubject {
  id: string;
  subjects: { id: string; subject_name: string } | null;
  classes: { id: string; class_name: string } | null;
}

export default function TeacherDashboard() {
  const router = useRouter();
  const [data, setData] = useState<TeacherSubject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/teacher/classes")
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load");
        return r.json();
      })
      .then((d) => setData(Array.isArray(d) ? d : []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error) {
    return (
      <Card variant="bordered" className="text-center py-10">
        <p className="text-error text-small">{error}</p>
      </Card>
    );
  }

  // Group by class
  const grouped: Record<
    string,
    { class_name: string; subjects: TeacherSubject[] }
  > = {};
  for (const ts of data) {
    const cls = ts.classes;
    if (!cls) continue;
    if (!grouped[cls.id])
      grouped[cls.id] = { class_name: cls.class_name, subjects: [] };
    grouped[cls.id].subjects.push(ts);
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-h1 font-bold">Teacher Dashboard</h1>
        <p className="text-small text-text-secondary mt-1">
          Your assigned classes and subjects
        </p>
      </div>

      {Object.keys(grouped).length === 0 ? (
        <Card variant="bordered" className="text-center py-10">
          <p className="text-small text-text-muted">No assigned classes yet.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 tablet:grid-cols-2 gap-4">
          {Object.entries(grouped).map(([classId, group]) => (
            <Card key={classId} variant="default" className="shadow-sm">
              <h2 className="text-h3 font-semibold text-primary mb-3">
                {group.class_name}
              </h2>
              <div className="space-y-2">
                {group.subjects.map((ts) => {
                  const sub = ts.subjects;
                  const subjectId = sub?.id;
                  const subjectName = sub?.subject_name || "Unknown Subject";
                  return (
                    <button
                      key={ts.id}
                      onClick={() =>
                        router.push(
                          `/teacher/scores?class_id=${classId}&subject_id=${subjectId}`,
                        )
                      }
                      className="w-full text-left flex items-center justify-between px-4 py-3 bg-bg rounded-sm hover:bg-primary-light transition-colors"
                    >
                      <span className="text-small font-medium text-text-primary">
                        {subjectName}
                      </span>
                      <Badge variant="info">Enter Scores</Badge>
                    </button>
                  );
                })}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
