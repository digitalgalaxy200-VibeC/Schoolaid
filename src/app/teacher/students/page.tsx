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
          className="px-4 py-2.5 bg-surface border border-border-strong rounded-sm text-body tablet:min-w-[200px] w-full tablet:w-auto">
          <option value="">Select your class</option>
          {classes.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {!classId && (
        <Card variant="bordered" className="shadow-sm"><p className="text-small text-text-muted py-8 text-center">Select a class to view your students.</p></Card>
      )}

      {loading && (
        <div className="flex justify-center py-10">
          <div className="animate-spin h-6 w-6 border-2 border-accent border-t-transparent rounded-full" />
        </div>
      )}

      {/* ── Table (All screens) ── */}
      {!loading && classId && sorted.length > 0 && (
        <div>
          <Card variant="bordered" className="shadow-sm overflow-hidden">
            <table className="w-full text-small table-fixed">
              <thead className="bg-primary text-text-inverse">
                <tr>
                  <th className="text-center px-1 tablet:px-4 py-3 font-semibold w-8 tablet:w-12">S/N</th>
                  <th className="text-left px-2 tablet:px-4 py-3 font-semibold w-[40%]">Student Name</th>
                  <th className="text-left px-2 tablet:px-4 py-3 font-semibold w-[30%]">Username</th>
                  <th className="text-left px-2 tablet:px-4 py-3 font-semibold w-[30%]">Password</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((s: any, i: number) => (
                  <tr key={s.id} className={`border-b border-border ${i % 2 === 0 ? "bg-surface" : "bg-bg"}`}>
                    <td className="text-center px-1 tablet:px-4 py-2 text-text-muted">{i + 1}</td>
                    <td className="px-2 tablet:px-4 py-2 font-medium break-words">{s.profiles?.full_name || "—"}</td>
                    <td className="px-2 tablet:px-4 py-2 font-mono text-[10px] tablet:text-caption break-all">{s.profiles?.email || "—"}</td>
                    <td className="px-2 tablet:px-4 py-2 font-mono text-[10px] tablet:text-caption break-all">{s.generated_password || "Reset to view"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      )}

      {!loading && classId && sorted.length === 0 && (
        <Card variant="bordered" className="shadow-sm"><p className="text-small text-text-muted py-8 text-center">No students in this class.</p></Card>
      )}
    </div>
  );
}
