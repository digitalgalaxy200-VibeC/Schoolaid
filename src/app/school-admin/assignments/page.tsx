"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, toast } from "@/components/ui";

/**
 * Teacher assignments — one screen for "who teaches what, where".
 *
 * WHY THIS EXISTS
 * ---------------
 * The per-class dialog (Classes → Manage Staff) is the right shape when you are
 * thinking about one class. It is the wrong shape when you are thinking about a
 * subject — "who teaches Mathematics this term?" — because you have to open four
 * classes to answer it, and a subject teacher is then entered four times.
 *
 * THE THREE QUESTIONS, IN ORDER: subject → teacher → classes. Answering them
 * here writes the same `teacher_subjects` rows the class dialog writes; nothing
 * new is stored, so both screens agree by construction.
 *
 * Two people may teach the same subject in the same class (the unique key is
 * teacher+subject+class+term), so this ADDS an assignment rather than replacing
 * one. Existing teachers for a class stay listed and are removable individually.
 *
 * Only classes that already OFFER the subject can be ticked. Assigning a teacher
 * to a subject a class does not run would create marks with nowhere to go, so
 * those rows are shown disabled with the reason instead of being hidden.
 */

type Subject = { id: string; name: string; code?: string | null };
type Teacher = { id: string; profiles?: { full_name?: string | null } | null };
type ClassRow = { id: string; name: string };
type ClassSubject = { id: string; class_id: string; subject_id: string };
type Assignment = {
  id: string;
  class_id: string;
  subject_id: string;
  teacher_id: string | null;
  teachers?: { profiles?: { full_name?: string | null } | null } | null;
};

const SELECT =
  "w-full px-3 py-2.5 border border-border rounded-lg text-body bg-surface focus:outline-none focus:border-primary transition-colors";

export default function AssignmentsPage() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [classes, setClasses] = useState<ClassRow[]>([]);

  const [subjectId, setSubjectId] = useState("");
  const [teacherId, setTeacherId] = useState("");
  const [selected, setSelected] = useState<string[]>([]);

  const [links, setLinks] = useState<ClassSubject[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingSubject, setLoadingSubject] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [sRes, tRes, cRes] = await Promise.all([
          fetch("/api/school-admin/subjects"),
          fetch("/api/school-admin/teachers?status=active&limit=500"),
          fetch("/api/school-admin/classes"),
        ]);
        if (sRes.ok) {
          const d = await sRes.json().catch(() => []);
          setSubjects(Array.isArray(d) ? d : (d.data ?? []));
        }
        if (tRes.ok) {
          const d = await tRes.json().catch(() => []);
          setTeachers(Array.isArray(d) ? d : (d.data ?? []));
        }
        if (cRes.ok) {
          const d = await cRes.json().catch(() => []);
          setClasses(Array.isArray(d) ? d : (d.data ?? []));
        }
      } catch {
        toast.error("Could not load the school's subjects and staff", "Please reload the page.");
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  const loadSubject = useCallback(async (id: string) => {
    if (!id) {
      setLinks([]);
      setAssignments([]);
      return;
    }
    setLoadingSubject(true);
    try {
      const [linkRes, assignRes] = await Promise.all([
        fetch(`/api/school-admin/class-subjects?subject_id=${id}`),
        fetch(`/api/school-admin/assignments?subject_id=${id}`),
      ]);
      if (linkRes.ok) {
        const d = await linkRes.json().catch(() => []);
        setLinks(Array.isArray(d) ? d : []);
      } else {
        setLinks([]);
      }
      if (assignRes.ok) {
        const d = await assignRes.json().catch(() => []);
        setAssignments(Array.isArray(d) ? d.filter((a: Assignment) => a.teacher_id) : []);
      } else {
        setAssignments([]);
      }
    } catch {
      toast.error("Could not load this subject's assignments", "Please try again.");
    } finally {
      setLoadingSubject(false);
    }
  }, []);

  useEffect(() => {
    // Deferred a microtask, like the other data-loading screens here: the rule
    // against synchronous setState in an effect cannot then see the load start.
    void Promise.resolve().then(() => loadSubject(subjectId));
  }, [subjectId, loadSubject]);

  const offeredClassIds = useMemo(() => new Set(links.map((l) => l.class_id)), [links]);

  /** class_id → the teachers already assigned to this subject in that class. */
  const teachersByClass = useMemo(() => {
    const map = new Map<string, Assignment[]>();
    for (const a of assignments) {
      const list = map.get(a.class_id) ?? [];
      list.push(a);
      map.set(a.class_id, list);
    }
    return map;
  }, [assignments]);

  const toggleClass = (classId: string) => {
    setSelected((current) =>
      current.includes(classId) ? current.filter((id) => id !== classId) : [...current, classId],
    );
  };

  const assign = async () => {
    if (!subjectId || !teacherId || selected.length === 0) return;
    setSaving(true);
    try {
      const res = await fetch("/api/school-admin/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject_id: subjectId, teacher_id: teacherId, class_ids: selected }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("Could not assign the teacher", body.error || `Server error (${res.status}).`);
        return;
      }
      const count = typeof body.assigned === "number" ? body.assigned : 1;
      toast.success(`Assigned to ${count} class${count === 1 ? "" : "es"}`);
      setSelected([]);
      await loadSubject(subjectId);
    } catch {
      toast.error("Could not reach the server", "Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    try {
      const res = await fetch(`/api/school-admin/assignments?id=${id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error("Could not remove the assignment", body.error || `Server error (${res.status}).`);
        return;
      }
      toast.success("Assignment removed");
      await loadSubject(subjectId);
    } catch {
      toast.error("Could not reach the server", "Check your connection and try again.");
    }
  };

  const subject = subjects.find((s) => s.id === subjectId) ?? null;
  const teacherLabel = (a: Assignment) => a.teachers?.profiles?.full_name ?? "Teacher";
  const chosenTeacher = teachers.find((t) => t.id === teacherId);

  return (
    <div className="p-4 tablet:p-8 space-y-6">
      <div>
        <h1 className="text-h1 font-bold text-text-primary">Teacher assignments</h1>
        <p className="text-body text-text-secondary mt-1">
          Pick a subject, pick the teacher, tick the classes they teach. One place, whatever the
          subject.
        </p>
      </div>

      <Card variant="default" className="space-y-5">
        <div className="grid grid-cols-1 gap-4 tablet:grid-cols-2">
          <div>
            <label className="text-caption font-semibold text-text-secondary">Subject</label>
            <select
              value={subjectId}
              onChange={(e) => {
                setSubjectId(e.target.value);
                // Ticked classes belong to the previous subject; carrying them
                // over would assign a teacher to the wrong subject's classes.
                setSelected([]);
              }}
              className={`${SELECT} mt-1`}
              disabled={loading}
            >
              <option value="">{loading ? "Loading subjects…" : "Select a subject…"}</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.code ? ` (${s.code})` : ""}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-caption font-semibold text-text-secondary">Teacher</label>
            <select
              value={teacherId}
              onChange={(e) => setTeacherId(e.target.value)}
              className={`${SELECT} mt-1`}
              disabled={!subjectId}
            >
              <option value="">Select a teacher…</option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.profiles?.full_name ?? "Teacher"}
                </option>
              ))}
            </select>
          </div>
        </div>

        {!subjectId ? (
          <p className="text-body text-text-secondary">
            Choose a subject to see which classes run it and who teaches it today.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-small font-semibold text-text-secondary">
                Classes offering {subject?.name ?? "this subject"}
              </p>
              {loadingSubject && <span className="text-caption text-text-muted">Loading…</span>}
            </div>

            {classes.length === 0 ? (
              <p className="text-body text-text-secondary">No classes have been created yet.</p>
            ) : (
              <div className="space-y-2">
                {classes.map((c) => {
                  const offered = offeredClassIds.has(c.id);
                  const current = teachersByClass.get(c.id) ?? [];
                  const checked = selected.includes(c.id);
                  return (
                    <div
                      key={c.id}
                      className={`flex flex-wrap items-center gap-3 p-3 rounded-lg border ${
                        offered ? "border-border bg-surface" : "border-dashed border-border bg-clay/60"
                      }`}
                    >
                      <label
                        className={`flex min-w-[140px] flex-1 items-center gap-3 ${
                          offered ? "cursor-pointer" : "cursor-not-allowed opacity-70"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={!offered}
                          onChange={() => toggleClass(c.id)}
                          className="h-4 w-4 rounded border-border text-primary"
                        />
                        <span className="text-body font-medium text-text-primary">{c.name}</span>
                      </label>

                      <div className="flex flex-wrap items-center gap-1.5">
                        {!offered ? (
                          <span className="text-caption text-text-muted">
                            Not offered — add it under Subjects
                          </span>
                        ) : current.length === 0 ? (
                          <span className="text-caption text-text-muted">
                            Class teacher covers it
                          </span>
                        ) : (
                          current.map((a) => (
                            <span
                              key={a.id}
                              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-bg px-2.5 py-1 text-caption"
                            >
                              {teacherLabel(a)}
                              <button
                                type="button"
                                onClick={() => void remove(a.id)}
                                className="px-0.5 font-bold leading-none text-text-muted hover:text-error"
                                aria-label={`Remove ${teacherLabel(a)} from ${c.name}`}
                              >
                                ✕
                              </button>
                            </span>
                          ))
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <p className="text-caption text-text-secondary">
                {selected.length === 0
                  ? "Tick the classes this teacher takes."
                  : `${selected.length} class${selected.length === 1 ? "" : "es"} selected`}
              </p>
              <Button
                variant="primary"
                loading={saving}
                disabled={!teacherId || selected.length === 0}
                onClick={() => void assign()}
                className="w-full tablet:w-auto"
              >
                Assign {chosenTeacher?.profiles?.full_name ?? "teacher"}
              </Button>
            </div>
          </div>
        )}
      </Card>

      {subjectId && (
        <Card variant="default" className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-h2 font-semibold text-text-primary">
              Who teaches {subject?.name ?? "this subject"}
            </h2>
            <Badge variant="info">{assignments.length} assignment(s)</Badge>
          </div>
          {assignments.length === 0 ? (
            <p className="text-body text-text-secondary">
              Nobody is named yet — each class teacher covers it by default.
            </p>
          ) : (
            <div className="space-y-2">
              {classes.map((c) => {
                const current = teachersByClass.get(c.id) ?? [];
                if (current.length === 0) return null;
                return (
                  <div
                    key={c.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-bg p-3"
                  >
                    <span className="text-body font-medium text-text-primary">{c.name}</span>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {current.map((a) => (
                        <span
                          key={a.id}
                          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-caption"
                        >
                          {teacherLabel(a)}
                          <button
                            type="button"
                            onClick={() => void remove(a.id)}
                            className="px-0.5 font-bold leading-none text-text-muted hover:text-error"
                            aria-label={`Remove ${teacherLabel(a)} from ${c.name}`}
                          >
                            ✕
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
