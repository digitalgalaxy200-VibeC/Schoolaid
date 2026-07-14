"use client";
import { useEffect, useState } from "react";
import { Card, Badge } from "@/components/ui";

export default function TeacherStudentsPage() {
  const [classes, setClasses] = useState<any[]>([]);
  const [classId, setClassId] = useState("");
  const [students, setStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/teacher/dashboard").then((r) => r.json()).then((d) => {
      setClasses((d.classes || []).filter((c: any) => c.role === "primary"));
    });
  }, []);

  useEffect(() => {
    if (!classId) { setStudents([]); return; }
    setLoading(true);
    fetch(`/api/teacher/students?class_id=${classId}`)
      .then((r) => r.json())
      .then((d) => { setStudents(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [classId]);

  const sorted = [...students].sort((a, b) =>
    (a.profiles?.full_name || "").localeCompare(b.profiles?.full_name || "")
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex justify-between items-center">
        <h1 className="text-h1 font-bold">My Students</h1>
        {classId && <Badge variant="info">{sorted.length} students</Badge>}
      </div>

      <div>
        <label className="block text-caption text-text-muted mb-1">Class</label>
        <select value={classId} onChange={(e) => setClassId(e.target.value)}
          className="px-4 py-2.5 bg-surface border border-border-strong rounded-sm text-body min-w-[200px]">
          <option value="">Select your class</option>
          {classes.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {!classId && (
        <Card variant="bordered" className="shadow-sm">
          <p className="text-small text-text-muted py-8 text-center">Select a class to view your students.</p>
        </Card>
      )}

      {loading && (
        <div className="flex justify-center py-10">
          <div className="animate-spin h-6 w-6 border-2 border-accent border-t-transparent rounded-full" />
        </div>
      )}

      {!loading && classId && sorted.length > 0 && (
        <Card variant="bordered" className="shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-small">
              <thead className="bg-primary text-text-inverse">
                <tr>
                  <th className="text-center px-4 py-3 font-semibold w-12">S/N</th>
                  <th className="text-left px-4 py-3 font-semibold">Student Name</th>
                  <th className="text-left px-4 py-3 font-semibold">Username</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((s: any, i: number) => (
                  <tr key={s.id} className={`border-b border-border ${i % 2 === 0 ? "bg-surface" : "bg-bg"}`}>
                    <td className="text-center px-4 py-2 text-text-muted">{i + 1}</td>
                    <td className="px-4 py-2 font-medium">{s.profiles?.full_name || "—"}</td>
                    <td className="px-4 py-2 font-mono text-caption">{s.profiles?.email || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {!loading && classId && sorted.length === 0 && (
        <Card variant="bordered" className="shadow-sm">
          <p className="text-small text-text-muted py-8 text-center">No students in this class.</p>
        </Card>
      )}
    </div>
  );
}
