"use client";
import { useEffect, useState } from "react";
import { Button, Badge } from "@/components/ui";

export function TeacherProfileModal({
  teacherId,
  teacher,
  onClose,
}: {
  teacherId: string;
  teacher: any;
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
          fetch(`/api/school-admin/class-teachers`),
          fetch(`/api/school-admin/assignments`),
        ]);
        if (ctRes.ok) {
          const ct = await ctRes.json();
          setClassTeachers(ct.filter((c: any) => c.teacher_id === teacherId));
        }
        if (tsRes.ok) {
          const data = await tsRes.json();
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

  const profile = teacher?.profiles || {};
  const name = profile.full_name || teacher?.employee_id || "Teacher";
  const initials = name.split(" ").map((n: string) => n.charAt(0)).join("").toUpperCase().slice(0, 2);

  return (
    <div className="fixed inset-0 z-50 flex items-end tablet:items-center justify-center bg-black/50 tablet:p-4">
      <div className="bg-bg w-full max-w-lg rounded-t-xl tablet:rounded-md shadow-lg flex flex-col max-h-[92dvh] tablet:max-h-[90vh]">
        {/* Header */}
        <div className="p-4 border-b border-border flex justify-between items-center gap-3 shrink-0">
          <h2 className="text-lg font-bold truncate">Teacher Profile</h2>
          <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
        </div>

        <div className="p-5 overflow-y-auto space-y-5">
          {loading ? (
            <p className="text-text-muted text-center py-4">Loading...</p>
          ) : (
            <>
              {/* ── Profile Section ── */}
              <div className="flex items-start gap-4">
                {/* Avatar */}
                <div className="w-16 h-16 rounded-full bg-primary-light flex items-center justify-center shrink-0">
                  {profile.avatar_url ? (
                    <img src={profile.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
                  ) : (
                    <span className="text-primary font-bold text-xl">{initials}</span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-h3 font-bold truncate">{name}</h3>
                  <p className="text-small text-text-muted">{teacher?.designation || "Teacher"}</p>
                  {profile.email && (
                    <p className="text-caption text-text-secondary mt-1 font-mono">{profile.email}</p>
                  )}
                </div>
                <Badge variant={profile.is_active !== false ? "success" : "error"}>
                  {profile.is_active !== false ? "Active" : "Inactive"}
                </Badge>
              </div>

              {/* Profile Details Grid */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-3 bg-bg p-4 rounded-md border border-border">
                <ProfileField label="Staff ID" value={teacher?.employee_id} />
                <ProfileField label="Phone" value={profile.phone} />
                <ProfileField label="Gender" value={teacher?.gender} />
                <ProfileField label="Date of Birth" value={teacher?.date_of_birth} />
                <ProfileField label="Qualification" value={teacher?.qualification} />
                <ProfileField label="Specialization" value={teacher?.specialization} />
                <ProfileField label="Marital Status" value={teacher?.marital_status} />
                <ProfileField label="Address" value={teacher?.address} />
                <ProfileField label="Recovery Email" value={profile.recovery_email} className="col-span-2" />
                {teacher?.notes && <ProfileField label="Notes" value={teacher.notes} className="col-span-2" />}
              </div>

              <hr className="border-border" />

              {/* ── Form Teacher Assignments ── */}
              <section>
                <h3 className="text-small font-bold text-text-secondary mb-2 flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                  Classes Managed
                  {classTeachers.length > 0 && <Badge variant="info">{classTeachers.length}</Badge>}
                </h3>
                {classTeachers.length === 0 ? (
                  <p className="text-caption text-text-muted py-2">Not assigned as a form teacher.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {classTeachers.map(ct => (
                      <div key={ct.id} className="px-3 py-1.5 bg-surface border border-border rounded-full text-small font-medium">
                        {ct.classes?.name}
                        <span className="text-caption text-text-muted ml-1">({ct.role})</span>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* ── Subject Assignments ── */}
              <section>
                <h3 className="text-small font-bold text-text-secondary mb-2 flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                  </svg>
                  Subjects Taught
                  {teacherSubjects.length > 0 && <Badge variant="info">{teacherSubjects.length}</Badge>}
                </h3>
                {teacherSubjects.length === 0 ? (
                  <p className="text-caption text-text-muted py-2">Not assigned to any subjects.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {teacherSubjects.map(ts => (
                      <div key={ts.id} className="px-3 py-1.5 bg-surface border border-border rounded-full text-small font-medium">
                        {ts.subjects?.name}
                        <span className="text-caption text-text-muted ml-1">· {ts.classes?.name}</span>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ProfileField({ label, value, className = "" }: { label: string; value: any; className?: string }) {
  return (
    <div className={className}>
      <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider">{label}</p>
      <p className="text-small text-text-primary mt-0.5">{value || "—"}</p>
    </div>
  );
}
