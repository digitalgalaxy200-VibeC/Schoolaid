"use client";
import { useEffect, useState } from "react";
import { Button, Card, Badge } from "@/components/ui";

export default function AssignmentsPage() {
  const [tab, setTab] = useState<"subjects" | "classes">("classes");

  // Subject assignment state
  const [items, setItems] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [showSubj, setShowSubj] = useState(false);
  const [teacherId, setTeacherId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [cId, setCId] = useState("");

  // Class-teacher state
  const [classTeachers, setClassTeachers] = useState<any[]>([]);
  const [showClass, setShowClass] = useState(false);
  const [ctClassId, setCtClassId] = useState("");
  const [ctTeacherId, setCtTeacherId] = useState("");
  const [ctRole, setCtRole] = useState("assistant");

  useEffect(() => {
    Promise.all([
      fetch("/api/school-admin/teachers").then((r) => r.json()),
      fetch("/api/school-admin/classes").then((r) => r.json()),
      fetch("/api/school-admin/subjects").then((r) => r.json()),
    ]).then(([t, c, s]) => {
      setTeachers(Array.isArray(t) ? t : []);
      setClasses(Array.isArray(c) ? c : []);
      setSubjects(Array.isArray(s) ? s : []);
    });
    loadSubjectAssignments();
    loadClassTeachers();
  }, []);

  // ── Subject Assignments ──
  const loadSubjectAssignments = () =>
    fetch("/api/school-admin/assignments")
      .then((r) => r.json())
      .then((d) => setItems(Array.isArray(d) ? d : []));

  const assignSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    await fetch("/api/school-admin/assignments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        teacher_id: teacherId,
        subject_id: subjectId,
        class_id: cId,
      }),
    });
    setShowSubj(false);
    loadSubjectAssignments();
  };

  const removeSubject = async (id: string) => {
    await fetch(`/api/school-admin/assignments?id=${id}`, { method: "DELETE" });
    loadSubjectAssignments();
  };

  const togglePublish = async (id: string, val: boolean) => {
    await fetch("/api/school-admin/assignments", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, can_publish: val }),
    });
    loadSubjectAssignments();
  };

  // ── Class-Teacher Assignments ──
  const loadClassTeachers = () =>
    fetch("/api/school-admin/class-teachers")
      .then((r) => r.json())
      .then((d) => setClassTeachers(Array.isArray(d) ? d : []));

  const assignClassTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    await fetch("/api/school-admin/class-teachers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        class_id: ctClassId,
        teacher_id: ctTeacherId,
        role: ctRole,
      }),
    });
    setShowClass(false);
    setCtRole("assistant");
    loadClassTeachers();
  };

  const updateClassTeacher = async (
    id: string,
    updates: Record<string, unknown>,
  ) => {
    await fetch("/api/school-admin/class-teachers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...updates }),
    });
    loadClassTeachers();
  };

  const removeClassTeacher = async (id: string) => {
    await fetch(`/api/school-admin/class-teachers?id=${id}`, {
      method: "DELETE",
    });
    loadClassTeachers();
  };

  // Group class teachers by class for display
  const groupedByClass = classTeachers.reduce(
    (acc: Record<string, any[]>, ct: any) => {
      const name = ct.classes?.name || "Unknown";
      if (!acc[name]) acc[name] = [];
      acc[name].push(ct);
      return acc;
    },
    {},
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-h1 font-bold">Teacher Assignments</h1>
        {tab === "subjects" ? (
          <Button onClick={() => setShowSubj(true)}>Assign Subject</Button>
        ) : (
          <Button onClick={() => setShowClass(true)}>Assign to Class</Button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        <button
          onClick={() => setTab("classes")}
          className={`px-4 py-2 rounded-sm text-small font-semibold ${
            tab === "classes"
              ? "bg-primary text-text-inverse"
              : "bg-surface text-text-secondary border border-border"
          }`}
        >
          Class Teachers
        </button>
        <button
          onClick={() => setTab("subjects")}
          className={`px-4 py-2 rounded-sm text-small font-semibold ${
            tab === "subjects"
              ? "bg-primary text-text-inverse"
              : "bg-surface text-text-secondary border border-border"
          }`}
        >
          Subject Assignments
        </button>
      </div>

      {/* ── Class-Teacher Form ── */}
      {showClass && (
        <Card variant="bordered">
          <form onSubmit={assignClassTeacher} className="space-y-4">
            <div>
              <label className="block text-small font-semibold text-text-secondary mb-2">
                Class
              </label>
              <select
                value={ctClassId}
                onChange={(e) => setCtClassId(e.target.value)}
                className="w-full px-4 py-2.5 bg-surface border border-border-strong rounded-sm text-body"
                required
              >
                <option value="">Select class</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-small font-semibold text-text-secondary mb-2">
                Teacher
              </label>
              <select
                value={ctTeacherId}
                onChange={(e) => setCtTeacherId(e.target.value)}
                className="w-full px-4 py-2.5 bg-surface border border-border-strong rounded-sm text-body"
                required
              >
                <option value="">Select teacher</option>
                {teachers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.profiles?.full_name || t.employee_id}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-small font-semibold text-text-secondary mb-2">
                Role
              </label>
              <select
                value={ctRole}
                onChange={(e) => setCtRole(e.target.value)}
                className="w-full px-4 py-2.5 bg-surface border border-border-strong rounded-sm text-body"
              >
                <option value="primary">Primary Teacher</option>
                <option value="assistant">Assistant Teacher</option>
              </select>
            </div>
            <div className="flex gap-3">
              <Button type="submit">Assign</Button>
              <Button variant="ghost" onClick={() => setShowClass(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* ── Subject Assignment Form ── */}
      {showSubj && (
        <Card variant="bordered">
          <form onSubmit={assignSubject} className="space-y-4">
            <div>
              <label className="block text-small font-semibold text-text-secondary mb-2">
                Teacher
              </label>
              <select
                value={teacherId}
                onChange={(e) => setTeacherId(e.target.value)}
                className="w-full px-4 py-2.5 bg-surface border border-border-strong rounded-sm text-body"
                required
              >
                <option value="">Select</option>
                {teachers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.profiles?.full_name || t.employee_id}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-small font-semibold text-text-secondary mb-2">
                Subject
              </label>
              <select
                value={subjectId}
                onChange={(e) => setSubjectId(e.target.value)}
                className="w-full px-4 py-2.5 bg-surface border border-border-strong rounded-sm text-body"
                required
              >
                <option value="">Select</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-small font-semibold text-text-secondary mb-2">
                Class
              </label>
              <select
                value={cId}
                onChange={(e) => setCId(e.target.value)}
                className="w-full px-4 py-2.5 bg-surface border border-border-strong rounded-sm text-body"
                required
              >
                <option value="">Select</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-3">
              <Button type="submit">Assign</Button>
              <Button variant="ghost" onClick={() => setShowSubj(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* ── Class Teachers View ── */}
      {tab === "classes" && (
        <div className="space-y-4">
          {Object.keys(groupedByClass).length === 0 && (
            <Card variant="bordered" className="shadow-sm">
              <p className="text-small text-text-muted py-8 text-center">
                No class-teacher assignments yet.
              </p>
            </Card>
          )}
          {Object.entries(groupedByClass).map(([className, teachers]) => (
            <Card key={className} variant="bordered" className="shadow-sm">
              <h3 className="text-h3 font-bold px-5 pt-5 pb-3">{className}</h3>
              <div className="divide-y divide-border">
                {teachers.map((ct: any) => (
                  <div
                    key={ct.id}
                    className="flex justify-between items-center px-5 py-3"
                  >
                    <div>
                      <p className="font-semibold text-body">
                        {ct.teachers?.profiles?.full_name || "—"}
                      </p>
                      <div className="flex gap-2 mt-0.5">
                        <Badge
                          variant={
                            ct.role === "primary" ? "success" : "default"
                          }
                        >
                          {ct.role === "primary" ? "Primary" : "Assistant"}
                        </Badge>
                        {!ct.is_active && (
                          <Badge variant="error">Inactive</Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2 items-center">
                      {ct.role === "assistant" && (
                        <button
                          onClick={() =>
                            updateClassTeacher(ct.id, { role: "primary" })
                          }
                          className="text-caption text-primary hover:underline"
                        >
                          Promote
                        </button>
                      )}
                      {ct.role === "primary" && (
                        <button
                          onClick={() =>
                            updateClassTeacher(ct.id, { role: "assistant" })
                          }
                          className="text-caption text-text-muted hover:underline"
                        >
                          Demote
                        </button>
                      )}
                      <button
                        onClick={() =>
                          updateClassTeacher(ct.id, {
                            is_active: !ct.is_active,
                          })
                        }
                        className="text-caption text-text-muted hover:underline"
                      >
                        {ct.is_active ? "Disable" : "Enable"}
                      </button>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => removeClassTeacher(ct.id)}
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* ── Subject Assignments View ── */}
      {tab === "subjects" && (
        <Card variant="bordered" className="shadow-sm">
          <div className="grid gap-2">
            {items.map((a) => (
              <div
                key={a.id}
                className="flex justify-between items-center p-3 bg-bg rounded-sm"
              >
                <div>
                  <p className="font-semibold text-small">
                    {a.teachers?.profiles?.full_name || "—"}{" "}
                    <Badge variant={a.can_publish ? "success" : "default"}>
                      {a.can_publish ? "Can Publish" : "No Publish"}
                    </Badge>
                  </p>
                  <p className="text-caption text-text-muted">
                    {a.subjects?.name || "—"} → {a.classes?.name || "—"}
                  </p>
                </div>
                <div className="flex gap-2 items-center">
                  <button
                    onClick={() => togglePublish(a.id, !a.can_publish)}
                    className="text-caption underline text-text-muted hover:text-primary"
                  >
                    {a.can_publish ? "Revoke" : "Allow"} Publish
                  </button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => removeSubject(a.id)}
                  >
                    Remove
                  </Button>
                </div>
              </div>
            ))}
            {items.length === 0 && (
              <p className="text-small text-text-muted py-4 text-center">
                No subject assignments yet.
              </p>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
