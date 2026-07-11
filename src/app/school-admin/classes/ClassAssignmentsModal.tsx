"use client";
import { useEffect, useState } from "react";
import { Button, Card } from "@/components/ui";

export function ClassAssignmentsModal({
  classId,
  className,
  onClose,
}: {
  classId: string;
  className: string;
  onClose: () => void;
}) {
  const [teachers, setTeachers] = useState<any[]>([]);
  const [classTeachers, setClassTeachers] = useState<any[]>([]);
  const [classSubjects, setClassSubjects] = useState<any[]>([]);
  const [teacherSubjects, setTeacherSubjects] = useState<any[]>([]);

  const loadData = async () => {
    try {
      const [tRes, ctRes, csRes] = await Promise.all([
        fetch("/api/school-admin/teachers"),
        fetch(`/api/school-admin/class-teachers?class_id=${classId}`),
        fetch(`/api/school-admin/class-subjects?class_id=${classId}`),
      ]);
      if (tRes.ok) setTeachers(await tRes.json());
      if (ctRes.ok) setClassTeachers(await ctRes.json());
      if (csRes.ok) setClassSubjects(await csRes.json());
      
      // Need a custom fetch for teacher subjects since the API doesn't filter by class out of the box nicely, 
      // but let's see if we can just fetch assignments
      const tsRes = await fetch(`/api/school-admin/assignments`); // Or we need to add a teacher-subjects endpoint
      if (tsRes.ok) {
        // Assignments api returned multiple things? Wait, we deleted assignments API folder? No, we kept the API.
        // Let's just fetch from the assignments API which returns { classTeachers, classSubjects, subjectTeachers }
        const data = await tsRes.json();
        setTeacherSubjects(data.subjectTeachers?.filter((st: any) => st.class_id === classId) || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (classId) loadData();
  }, [classId]);

  const handleAssignClassTeacher = async (teacherId: string, role: string) => {
    await fetch("/api/school-admin/class-teachers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ class_id: classId, teacher_id: teacherId, role }),
    });
    loadData();
  };

  const handleRemoveClassTeacher = async (id: string) => {
    await fetch(`/api/school-admin/class-teachers?id=${id}`, { method: "DELETE" });
    loadData();
  };

  // Wait, if I need to assign a subject teacher, I need `POST /api/school-admin/teacher-subjects`?
  // We don't have a dedicated API route for that. We have `assignments` API but it might not handle POST properly for subjects.
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-bg w-full max-w-2xl rounded-md shadow-lg flex flex-col max-h-[90vh]">
        <div className="p-4 border-b border-border flex justify-between items-center">
          <h2 className="text-h2 font-bold">Manage Staff: {className}</h2>
          <Button variant="ghost" onClick={onClose}>Close</Button>
        </div>
        
        <div className="p-4 overflow-y-auto space-y-6">
          {/* Form Teachers Section */}
          <section>
            <h3 className="text-h3 font-bold mb-3">Class Teachers (Form Tutors)</h3>
            <div className="space-y-3">
              {classTeachers.map(ct => (
                <div key={ct.id} className="flex items-center justify-between bg-surface p-3 border border-border rounded-sm">
                  <div>
                    <p className="font-semibold">{ct.teachers?.profiles?.full_name}</p>
                    <span className="text-caption text-text-muted capitalize">{ct.role} Teacher</span>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => handleRemoveClassTeacher(ct.id)}>Remove</Button>
                </div>
              ))}
              
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <label className="text-caption font-semibold mb-1 block">Assign Teacher</label>
                  <select id="new-ct-teacher" className="w-full px-3 py-2 border border-border rounded-sm bg-surface text-small">
                    <option value="">Select teacher...</option>
                    {teachers.map(t => <option key={t.id} value={t.id}>{t.profiles?.full_name}</option>)}
                  </select>
                </div>
                <div className="w-32">
                  <label className="text-caption font-semibold mb-1 block">Role</label>
                  <select id="new-ct-role" className="w-full px-3 py-2 border border-border rounded-sm bg-surface text-small">
                    <option value="primary">Primary</option>
                    <option value="assistant">Assistant</option>
                  </select>
                </div>
                <Button onClick={() => {
                  const t = (document.getElementById('new-ct-teacher') as HTMLSelectElement).value;
                  const r = (document.getElementById('new-ct-role') as HTMLSelectElement).value;
                  if (t) handleAssignClassTeacher(t, r);
                }}>Assign</Button>
              </div>
            </div>
          </section>

          {/* Subject Teachers Section */}
          <section>
            <h3 className="text-h3 font-bold mb-3">Subject Teachers</h3>
            {classSubjects.length === 0 ? (
              <p className="text-small text-text-muted">No subjects assigned to this class yet. Go to Subjects to add them.</p>
            ) : (
              <div className="space-y-2">
                {classSubjects.map(cs => {
                  const assignment = teacherSubjects.find(ts => ts.subject_id === cs.subject_id);
                  return (
                    <div key={cs.id} className="flex items-center justify-between p-3 border border-border rounded-sm bg-surface">
                      <p className="font-semibold text-small flex-1">{cs.subjects?.name}</p>
                      <div className="flex-1">
                        <select 
                          className="w-full px-3 py-1.5 border border-border rounded-sm bg-bg text-small"
                          value={assignment?.teacher_id || ""}
                          onChange={async (e) => {
                            const tId = e.target.value;
                            await fetch("/api/school-admin/assignments", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                class_id: classId,
                                subject_id: cs.subject_id,
                                teacher_id: tId || null,
                              }),
                            });
                            loadData();
                          }}
                        >
                          <option value="">-- No Teacher Assigned --</option>
                          {teachers.map(t => <option key={t.id} value={t.id}>{t.profiles?.full_name}</option>)}
                        </select>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
