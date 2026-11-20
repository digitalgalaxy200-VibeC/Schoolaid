"use client";
import { useEffect, useState } from "react";
import { Button, Card, toast } from "@/components/ui";

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
      // teachers API now returns paginated {data, total, totalPages} — fetch all with large limit
      const [tRes, ctRes, csRes] = await Promise.all([
        fetch("/api/school-admin/teachers?status=active&limit=500"),
        fetch(`/api/school-admin/class-teachers?class_id=${classId}`),
        fetch(`/api/school-admin/class-subjects?class_id=${classId}`),
      ]);
      if (tRes.ok) {
        const td = await tRes.json();
        setTeachers(Array.isArray(td) ? td : (td.data ?? []));
      }
      if (ctRes.ok) {
        const ctd = await ctRes.json();
        setClassTeachers(Array.isArray(ctd) ? ctd : (ctd.data ?? []));
      }
      if (csRes.ok) {
        const csd = await csRes.json();
        setClassSubjects(Array.isArray(csd) ? csd : (csd.data ?? []));
      }
      if (!tRes.ok || !ctRes.ok || !csRes.ok) {
        toast.error("Could not load some staff data", "Please close and reopen this dialog.");
      }

      const tsRes = await fetch(`/api/school-admin/assignments`);
      if (tsRes.ok) {
        const data = await tsRes.json();
        const ts = Array.isArray(data)
          ? data
          : (data.subjectTeachers ?? data.data ?? []);
        setTeacherSubjects(ts.filter((st: any) => st.class_id === classId));
      } else {
        toast.error("Could not load subject teacher assignments", "Please close and reopen this dialog.");
      }
    } catch (e) {
      console.error(e);
      toast.error("Could not load staff assignments", "Please close and reopen this dialog.");
    }
  };

  useEffect(() => {
    if (classId) loadData();
  }, [classId]);

  const handleAssignClassTeacher = async (teacherId: string, role: string) => {
    const r = await fetch("/api/school-admin/class-teachers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ class_id: classId, teacher_id: teacherId, role }),
    });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      toast.error("Could not assign class teacher", d.error || `Server error (${r.status}). Please try again.`);
      loadData();
      return;
    }
    toast.success("Class teacher assigned");
    loadData();
  };

  const handleRemoveClassTeacher = async (id: string) => {
    const r = await fetch(`/api/school-admin/class-teachers?id=${id}`, {
      method: "DELETE",
    });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      toast.error("Could not remove class teacher", d.error || `Server error (${r.status}). Please try again.`);
      loadData();
      return;
    }
    toast.success("Class teacher removed");
    loadData();
  };

  /**
   * A subject in a class can have MORE THAN ONE teacher (the unique key is
   * teacher+subject+class+term), so this adds rather than replaces, and removal
   * is per row. The old single dropdown silently swapped whoever was there.
   */
  const addSubjectTeacher = async (subjectId: string, teacherId: string) => {
    const r = await fetch("/api/school-admin/assignments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ class_id: classId, subject_id: subjectId, teacher_id: teacherId }),
    });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      toast.error("Could not assign subject teacher", d.error || `Server error (${r.status}). Please try again.`);
    } else {
      toast.success("Subject teacher assigned");
    }
    await loadData();
  };

  const removeSubjectTeacher = async (id: string) => {
    const r = await fetch(`/api/school-admin/assignments?id=${id}`, { method: "DELETE" });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      toast.error("Could not remove subject teacher", d.error || `Server error (${r.status}). Please try again.`);
    } else {
      toast.success("Subject teacher removed");
    }
    await loadData();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end tablet:items-center justify-center bg-black/50 tablet:p-4">
      <div className="bg-bg w-full max-w-2xl rounded-t-xl tablet:rounded-md shadow-lg flex flex-col sheet-max-height safe-area-bottom">
        <div className="p-4 border-b border-border flex justify-between items-center gap-3">
          <h2 className="text-h2 font-bold truncate">Manage Staff: {className}</h2>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>

        <div className="p-4 overflow-y-auto min-h-0 flex-1 space-y-6">
          {/* Form Teachers Section */}
          <section>
            <h3 className="text-h3 font-bold mb-3">
              Class Teachers (Form Tutors)
            </h3>
            <div className="space-y-3">
              {Array.isArray(classTeachers) &&
                classTeachers.map((ct) => (
                  <div
                    key={ct.id}
                    className="flex items-center justify-between bg-surface p-3 border border-border rounded-sm"
                  >
                    <div>
                      <p className="font-semibold">
                        {ct.teachers?.profiles?.full_name}
                      </p>
                      <span className="text-caption text-text-muted capitalize">
                        {ct.role} Teacher
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveClassTeacher(ct.id)}
                    >
                      Remove
                    </Button>
                  </div>
                ))}

              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <label className="text-caption font-semibold mb-1 block">
                    Assign Teacher
                  </label>
                  <select
                    id="new-ct-teacher"
                    className="w-full px-3 py-2 border border-border rounded-sm bg-surface text-small"
                  >
                    <option value="">Select teacher...</option>
                    {Array.isArray(teachers) &&
                      teachers.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.profiles?.full_name}
                        </option>
                      ))}
                  </select>
                </div>
                <div className="w-32">
                  <label className="text-caption font-semibold mb-1 block">
                    Role
                  </label>
                  <select
                    id="new-ct-role"
                    className="w-full px-3 py-2 border border-border rounded-sm bg-surface text-small"
                  >
                    <option value="primary">Primary</option>
                    <option value="assistant">Assistant</option>
                  </select>
                </div>
                <Button
                  onClick={() => {
                    const t = (
                      document.getElementById(
                        "new-ct-teacher",
                      ) as HTMLSelectElement
                    ).value;
                    const r = (
                      document.getElementById(
                        "new-ct-role",
                      ) as HTMLSelectElement
                    ).value;
                    if (t) handleAssignClassTeacher(t, r);
                  }}
                >
                  Assign
                </Button>
              </div>
            </div>
          </section>

          {/* Subject Teachers Section */}
          <section>
            <h3 className="text-h3 font-bold mb-3">Subject Teachers</h3>
            {classSubjects.length === 0 ? (
              <p className="text-small text-text-muted">
                No subjects assigned to this class yet. Go to Subjects to add
                them.
              </p>
            ) : (
              <div className="space-y-2">
                {classSubjects.map((cs) => {
                  const assigned = teacherSubjects.filter(
                    (ts) => ts.subject_id === cs.subject_id && ts.teacher_id,
                  );
                  const assignedIds = new Set(assigned.map((ts) => ts.teacher_id));
                  const available = Array.isArray(teachers)
                    ? teachers.filter((t) => !assignedIds.has(t.id))
                    : [];
                  return (
                    <div
                      key={cs.id}
                      className="space-y-2 p-3 border border-border rounded-sm bg-surface"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-semibold text-small flex-1">{cs.subjects?.name}</p>
                        <span className="text-caption text-text-muted">
                          {assigned.length === 0
                            ? "Class teacher covers this"
                            : `${assigned.length} teacher${assigned.length === 1 ? "" : "s"}`}
                        </span>
                      </div>

                      {assigned.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {assigned.map((ts) => (
                            <span
                              key={ts.id}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-border bg-bg text-caption"
                            >
                              {ts.teachers?.profiles?.full_name ?? "Teacher"}
                              <button
                                type="button"
                                onClick={() => void removeSubjectTeacher(ts.id)}
                                className="text-text-muted hover:text-error font-bold leading-none px-0.5"
                                aria-label={`Remove ${ts.teachers?.profiles?.full_name ?? "this teacher"} from ${cs.subjects?.name}`}
                              >
                                ✕
                              </button>
                            </span>
                          ))}
                        </div>
                      )}

                      <select
                        value=""
                        disabled={available.length === 0}
                        onChange={(e) => {
                          const tId = e.target.value;
                          if (tId) void addSubjectTeacher(cs.subject_id, tId);
                        }}
                        className="w-full px-3 py-1.5 border border-border rounded-sm bg-bg text-small disabled:opacity-60"
                      >
                        <option value="">
                          {available.length === 0
                            ? "Every teacher is already assigned"
                            : "Add a teacher…"}
                        </option>
                        {available.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.profiles?.full_name}
                          </option>
                        ))}
                      </select>
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
