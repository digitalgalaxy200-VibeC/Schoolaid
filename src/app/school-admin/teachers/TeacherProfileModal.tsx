"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui";

export function TeacherProfileModal({
  teacherId,
  teacherName,
  onClose,
}: {
  teacherId: string;
  teacherName: string;
  onClose: () => void;
}) {
  const [classTeachers, setClassTeachers] = useState<any[]>([]);
  const [teacherSubjects, setTeacherSubjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!teacherId) return;
    
    const loadData = async () => {
      setLoading(true);
      try {
        const [ctRes, tsRes] = await Promise.all([
          // To get the classes they are a form teacher for:
          // Since our API only filters by class_id natively, we might have to fetch all and filter client-side for simplicity.
          // In a real production app we'd add `?teacher_id=` support.
          fetch(`/api/school-admin/class-teachers`),
          fetch(`/api/school-admin/assignments`) // assignments API returns { subjectTeachers } without filter, or we can just fetch all assignments and filter
        ]);
        
        if (ctRes.ok) {
          const ct = await ctRes.json();
          setClassTeachers(ct.filter((c: any) => c.teacher_id === teacherId));
        }
        
        if (tsRes.ok) {
          const data = await tsRes.json();
          // The assignments API GET returns all teacher_subjects directly
          const ts = Array.isArray(data) ? data : (data.subjectTeachers || []);
          setTeacherSubjects(ts.filter((t: any) => t.teacher_id === teacherId));
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    
    loadData();
  }, [teacherId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-bg w-full max-w-2xl rounded-md shadow-lg flex flex-col max-h-[90vh]">
        <div className="p-4 border-b border-border flex justify-between items-center">
          <h2 className="text-h2 font-bold">Teaching Profile: {teacherName}</h2>
          <Button variant="ghost" onClick={onClose}>Close</Button>
        </div>
        
        <div className="p-6 overflow-y-auto space-y-6">
          {loading ? (
            <p className="text-text-muted text-center py-4">Loading profile...</p>
          ) : (
            <>
              {/* Form Teachers Section */}
              <section>
                <h3 className="text-h3 font-bold mb-3 border-b border-border pb-2">Form Teacher Assignments</h3>
                {classTeachers.length === 0 ? (
                  <p className="text-small text-text-muted">Not assigned as a form teacher for any class.</p>
                ) : (
                  <div className="space-y-2">
                    {classTeachers.map(ct => (
                      <div key={ct.id} className="flex justify-between p-3 bg-surface border border-border rounded-sm">
                        <span className="font-semibold">{ct.classes?.name}</span>
                        <span className="text-caption text-text-muted capitalize">{ct.role} Teacher</span>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Subject Teachers Section */}
              <section>
                <h3 className="text-h3 font-bold mb-3 border-b border-border pb-2">Subject Assignments</h3>
                {teacherSubjects.length === 0 ? (
                  <p className="text-small text-text-muted">Not assigned to teach any subjects.</p>
                ) : (
                  <div className="grid sm:grid-cols-2 gap-3">
                    {teacherSubjects.map(ts => (
                      <div key={ts.id} className="p-3 bg-surface border border-border rounded-sm">
                        <p className="font-semibold text-small">{ts.subjects?.name}</p>
                        <p className="text-caption text-text-muted">Class: {ts.classes?.name}</p>
                      </div>
                    ))}
                  </div>
                )}
              </section>
              
              <div className="bg-primary-light/10 p-4 rounded-md mt-6">
                <p className="text-small text-text-secondary text-center">
                  To assign this teacher to more classes or subjects, visit the <strong>Classes</strong> page and click &quot;Manage Staff&quot;.
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
