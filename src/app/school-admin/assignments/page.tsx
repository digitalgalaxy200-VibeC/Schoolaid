"use client";
import { useEffect, useState, useCallback } from "react";
import { Button, Card, Badge } from "@/components/ui";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

type Tab = "class-teachers" | "subject-classes" | "subject-teachers";

export default function AssignmentsPage() {
  const [tab, setTab] = useState<Tab>("class-teachers");

  // ── Shared data ──
  const [teachers, setTeachers] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ── Tab 1: Class Teachers ──
  const [classTeachers, setClassTeachers] = useState<any[]>([]);
  const [ctClassId, setCtClassId] = useState("");
  const [ctTeacherId, setCtTeacherId] = useState("");
  const [ctRole, setCtRole] = useState("primary");
  const [showCtForm, setShowCtForm] = useState(false);

  // ── Tab 2: Subject → Classes ──
  const [classSubjects, setClassSubjects] = useState<any[]>([]);
  const [csSubjectId, setCsSubjectId] = useState("");
  const [csClassIds, setCsClassIds] = useState<string[]>([]);
  const [showCsForm, setShowCsForm] = useState(false);

  // ── Tab 3: Subject → Teacher (per class) ──
  const [subjectTeachers, setSubjectTeachers] = useState<any[]>([]);
  const [stClassId, setStClassId] = useState("");
  const [stSubjectId, setStSubjectId] = useState("");
  const [stTeacherId, setStTeacherId] = useState("");
  const [showStForm, setShowStForm] = useState(false);
  // subjects available in selected class (from class_subjects)
  const [classSubjectsForClass, setClassSubjectsForClass] = useState<any[]>([]);

  // ── Confirmation Dialog State ──
  const [confirmState, setConfirmState] = useState<{
    open: boolean;
    title: string;
    message: string;
    action: () => Promise<void>;
  }>({
    open: false,
    title: "",
    message: "",
    action: async () => {},
  });

  const confirmAction = (title: string, message: string, action: () => Promise<void>) => {
    setConfirmState({ open: true, title, message, action });
  };

  const handleConfirm = async () => {
    await confirmState.action();
    setConfirmState({ ...confirmState, open: false });
  };

  const flash = (type: "success" | "error", text: string) => {
    setMsg({ type, text });
    setTimeout(() => setMsg(null), 4000);
  };

  // ── Loaders ──
  const loadClassTeachers = useCallback(() =>
    fetch("/api/school-admin/class-teachers")
      .then((r) => r.json())
      .then((d) => setClassTeachers(Array.isArray(d) ? d : [])), []);

  const loadClassSubjects = useCallback(() =>
    fetch("/api/school-admin/class-subjects")
      .then((r) => r.json())
      .then((d) => setClassSubjects(Array.isArray(d) ? d : [])), []);

  const loadSubjectTeachers = useCallback(() =>
    fetch("/api/school-admin/assignments")
      .then((r) => r.json())
      .then((d) => setSubjectTeachers(Array.isArray(d) ? d : [])), []);

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
    loadClassTeachers();
    loadClassSubjects();
    loadSubjectTeachers();
  }, [loadClassTeachers, loadClassSubjects, loadSubjectTeachers]);

  // When class changes in Tab 3, fetch subjects for that class
  useEffect(() => {
    if (!stClassId) { setClassSubjectsForClass([]); return; }
    fetch(`/api/school-admin/class-subjects?class_id=${stClassId}`)
      .then((r) => r.json())
      .then((d) => setClassSubjectsForClass(Array.isArray(d) ? d : []));
  }, [stClassId]);

  // ────────────────────────────────────────────────────────────────────────────
  // TAB 1: Class Teacher actions
  // ────────────────────────────────────────────────────────────────────────────
  const assignClassTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    const res = await fetch("/api/school-admin/class-teachers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ class_id: ctClassId, teacher_id: ctTeacherId, role: ctRole }),
    });
    setIsSubmitting(false);
    if (res.ok) {
      flash("success", "Teacher assigned to class.");
      setShowCtForm(false);
      setCtClassId(""); setCtTeacherId(""); setCtRole("primary");
      loadClassTeachers();
    } else {
      const d = await res.json();
      flash("error", d.error || "Failed to assign");
    }
  };

  const updateClassTeacher = async (id: string, updates: Record<string, unknown>) => {
    await fetch("/api/school-admin/class-teachers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...updates }),
    });
    loadClassTeachers();
  };

  const removeClassTeacher = (id: string) => {
    confirmAction(
      "Remove Class Teacher",
      "Are you sure you want to remove this teacher from the class?",
      async () => {
        await fetch(`/api/school-admin/class-teachers?id=${id}`, { method: "DELETE" });
        loadClassTeachers();
      }
    );
  };

  // ────────────────────────────────────────────────────────────────────────────
  // TAB 2: Subject → Classes actions
  // ────────────────────────────────────────────────────────────────────────────
  const assignSubjectToClasses = async (e: React.FormEvent) => {
    e.preventDefault();
    if (csClassIds.length === 0) { flash("error", "Select at least one class."); return; }
    setIsSubmitting(true);
    const res = await fetch("/api/school-admin/class-subjects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject_id: csSubjectId, class_ids: csClassIds }),
    });
    setIsSubmitting(false);
    if (res.ok) {
      flash("success", `Subject assigned to ${csClassIds.length} class(es).`);
      setShowCsForm(false);
      setCsSubjectId(""); setCsClassIds([]);
      loadClassSubjects();
    } else {
      const d = await res.json();
      flash("error", d.error || "Failed to assign");
    }
  };

  const removeClassSubject = (id: string) => {
    confirmAction(
      "Remove Subject from Class",
      "Are you sure you want to remove this subject from the class?",
      async () => {
        await fetch(`/api/school-admin/class-subjects?id=${id}`, { method: "DELETE" });
        loadClassSubjects();
      }
    );
  };

  const toggleClassId = (id: string) =>
    setCsClassIds((prev) => prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]);

  // ────────────────────────────────────────────────────────────────────────────
  // TAB 3: Subject → Teacher (per class)
  // ────────────────────────────────────────────────────────────────────────────
  const assignSubjectTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stClassId || !stSubjectId) { flash("error", "Select class and subject."); return; }
    setIsSubmitting(true);
    const res = await fetch("/api/school-admin/assignments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        class_id: stClassId,
        subject_id: stSubjectId,
        teacher_id: stTeacherId || null,
      }),
    });
    setIsSubmitting(false);
    if (res.ok) {
      flash("success", "Subject teacher assigned.");
      setShowStForm(false);
      setStClassId(""); setStSubjectId(""); setStTeacherId("");
      loadSubjectTeachers();
    } else {
      const d = await res.json();
      flash("error", d.error || "Failed to assign");
    }
  };

  const removeSubjectTeacher = (id: string) => {
    confirmAction(
      "Remove Subject Teacher",
      "Are you sure you want to remove this subject teacher assignment?",
      async () => {
        await fetch(`/api/school-admin/assignments?id=${id}`, { method: "DELETE" });
        loadSubjectTeachers();
      }
    );
  };

  const reassignTeacher = async (id: string, teacher_id: string | null) => {
    await fetch("/api/school-admin/assignments", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, teacher_id }),
    });
    loadSubjectTeachers();
  };

  // ── Group helpers ──
  const groupedClassTeachers = classTeachers.reduce((acc: Record<string, any[]>, ct: any) => {
    const name = ct.classes?.name || "Unknown";
    if (!acc[name]) acc[name] = [];
    acc[name].push(ct);
    return acc;
  }, {});

  const groupedBySubject = classSubjects.reduce((acc: Record<string, any[]>, cs: any) => {
    const name = cs.subjects?.name || "Unknown";
    if (!acc[name]) acc[name] = [];
    acc[name].push(cs);
    return acc;
  }, {});

  const groupedStByClass = subjectTeachers.reduce((acc: Record<string, any[]>, st: any) => {
    const name = st.classes?.name || "Unknown";
    if (!acc[name]) acc[name] = [];
    acc[name].push(st);
    return acc;
  }, {});

  const tabs: { key: Tab; label: string }[] = [
    { key: "class-teachers", label: "Teachers → Classes" },
    { key: "subject-classes", label: "Subjects → Classes" },
    { key: "subject-teachers", label: "Teachers → Subjects" },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-h1 font-bold">Assignments</h1>

      <ConfirmDialog
        open={confirmState.open}
        title={confirmState.title}
        message={confirmState.message}
        onConfirm={handleConfirm}
        onCancel={() => setConfirmState({ ...confirmState, open: false })}
      />

      {msg && (
        <div className={`px-4 py-3 rounded-sm text-small font-medium ${
          msg.type === "success"
            ? "bg-success-bg text-success border border-success"
            : "bg-error-bg text-error border border-error"
        }`}>
          {msg.text}
        </div>
      )}

      {/* ── Tabs ── */}
      <div className="flex flex-wrap gap-2 border-b border-border pb-0">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => { setTab(t.key); setShowCtForm(false); setShowCsForm(false); setShowStForm(false); }}
            className={`px-4 py-2 text-small font-semibold border-b-2 transition-colors ${
              tab === t.key
                ? "border-primary text-primary"
                : "border-transparent text-text-secondary hover:text-text-primary"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          TAB 1 — Teachers → Classes
      ══════════════════════════════════════════════════════════════════ */}
      {tab === "class-teachers" && (
        <div className="space-y-4">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-small text-text-muted">
                Assign a <strong>Primary Teacher</strong> (class teacher responsible for report cards) or assistant teachers to each class.
              </p>
            </div>
            <Button onClick={() => setShowCtForm(!showCtForm)}>
              {showCtForm ? "Cancel" : "Assign Teacher"}
            </Button>
          </div>

          {showCtForm && (
            <Card variant="bordered">
              <form onSubmit={assignClassTeacher} className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div>
                    <label className="block text-small font-semibold text-text-secondary mb-2">Class</label>
                    <select
                      value={ctClassId}
                      onChange={(e) => setCtClassId(e.target.value)}
                      className="w-full px-4 py-2.5 bg-surface border border-border-strong rounded-sm text-body"
                      required
                    >
                      <option value="">Select class</option>
                      {classes.map((c) => (
                        <option key={c.id} value={c.id}>{c.name} {c.grade_level && `(${c.grade_level})`}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-small font-semibold text-text-secondary mb-2">Teacher</label>
                    <select
                      value={ctTeacherId}
                      onChange={(e) => setCtTeacherId(e.target.value)}
                      className="w-full px-4 py-2.5 bg-surface border border-border-strong rounded-sm text-body"
                      required
                    >
                      <option value="">Select teacher</option>
                      {teachers.map((t) => (
                        <option key={t.id} value={t.id}>{t.profiles?.full_name || t.employee_id}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-small font-semibold text-text-secondary mb-2">Role</label>
                    <select
                      value={ctRole}
                      onChange={(e) => setCtRole(e.target.value)}
                      className="w-full px-4 py-2.5 bg-surface border border-border-strong rounded-sm text-body"
                    >
                      <option value="primary">Primary (Class Teacher)</option>
                      <option value="assistant">Assistant Teacher</option>
                    </select>
                  </div>
                </div>
                <Button type="submit" loading={isSubmitting}>Assign</Button>
              </form>
            </Card>
          )}

          {Object.keys(groupedClassTeachers).length === 0 ? (
            <Card variant="bordered">
              <p className="text-small text-text-muted py-8 text-center">No class-teacher assignments yet.</p>
            </Card>
          ) : (
            Object.entries(groupedClassTeachers).sort(([a], [b]) => a.localeCompare(b)).map(([className, cts]) => (
              <Card key={className} variant="bordered" className="shadow-sm">
                <h3 className="text-h3 font-bold px-5 pt-5 pb-2">{className}</h3>
                <div className="divide-y divide-border">
                  {(cts as any[]).map((ct: any) => (
                    <div key={ct.id} className="flex justify-between items-center px-5 py-3">
                      <div>
                        <p className="font-semibold text-body">{ct.teachers?.profiles?.full_name || "—"}</p>
                        <div className="flex gap-2 mt-0.5">
                          <Badge variant={ct.role === "primary" ? "success" : "default"}>
                            {ct.role === "primary" ? "Primary / Class Teacher" : "Assistant"}
                          </Badge>
                          {!ct.is_active && <Badge variant="error">Inactive</Badge>}
                        </div>
                      </div>
                      <div className="flex gap-2 items-center flex-wrap">
                        {ct.role === "assistant" && (
                          <button onClick={() => updateClassTeacher(ct.id, { role: "primary" })}
                            className="text-caption text-primary hover:underline">Promote</button>
                        )}
                        {ct.role === "primary" && (
                          <button onClick={() => {
                            confirmAction(
                              "Demote Teacher",
                              "Are you sure you want to demote this primary teacher to an assistant?",
                              async () => {
                                await updateClassTeacher(ct.id, { role: "assistant" });
                              }
                            );
                          }}
                            className="text-caption text-text-muted hover:underline">Demote</button>
                        )}
                        <button onClick={() => updateClassTeacher(ct.id, { is_active: !ct.is_active })}
                          className="text-caption text-text-muted hover:underline">
                          {ct.is_active ? "Disable" : "Enable"}
                        </button>
                        <Button variant="danger" size="sm" onClick={() => removeClassTeacher(ct.id)}>Remove</Button>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            ))
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          TAB 2 — Subjects → Classes
      ══════════════════════════════════════════════════════════════════ */}
      {tab === "subject-classes" && (
        <div className="space-y-4">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-small text-text-muted">
                Assign a subject to one or many classes at once using checkboxes. E.g. assign <strong>English</strong> to JSS1, JSS2, JSS3 in one step.
              </p>
            </div>
            <Button onClick={() => setShowCsForm(!showCsForm)}>
              {showCsForm ? "Cancel" : "Assign Subject"}
            </Button>
          </div>

          {showCsForm && (
            <Card variant="bordered">
              <form onSubmit={assignSubjectToClasses} className="space-y-4">
                <div>
                  <label className="block text-small font-semibold text-text-secondary mb-2">Subject</label>
                  <select
                    value={csSubjectId}
                    onChange={(e) => setCsSubjectId(e.target.value)}
                    className="w-full px-4 py-2.5 bg-surface border border-border-strong rounded-sm text-body"
                    required
                  >
                    <option value="">Select subject</option>
                    {subjects.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}{s.code && ` (${s.code})`}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-small font-semibold text-text-secondary mb-2">
                    Classes <span className="text-text-muted font-normal">(tick all that apply)</span>
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 p-4 bg-surface border border-border-strong rounded-sm max-h-48 overflow-y-auto">
                    {classes.map((c) => (
                      <label key={c.id} className="flex items-center gap-2 cursor-pointer hover:bg-bg rounded p-1">
                        <input
                          type="checkbox"
                          checked={csClassIds.includes(c.id)}
                          onChange={() => toggleClassId(c.id)}
                          className="accent-primary w-4 h-4"
                        />
                        <span className="text-small">{c.name}</span>
                      </label>
                    ))}
                  </div>
                  {csClassIds.length > 0 && (
                    <p className="text-caption text-primary mt-1">{csClassIds.length} class(es) selected</p>
                  )}
                </div>

                <Button type="submit" loading={isSubmitting}>
                  Assign to {csClassIds.length > 0 ? `${csClassIds.length} Class(es)` : "Classes"}
                </Button>
              </form>
            </Card>
          )}

          {Object.keys(groupedBySubject).length === 0 ? (
            <Card variant="bordered">
              <p className="text-small text-text-muted py-8 text-center">No subjects assigned to classes yet.</p>
            </Card>
          ) : (
            Object.entries(groupedBySubject).sort(([a], [b]) => a.localeCompare(b)).map(([subjectName, assignments]) => (
              <Card key={subjectName} variant="bordered" className="shadow-sm">
                <div className="flex justify-between items-center px-5 pt-4 pb-2">
                  <h3 className="text-h3 font-bold">{subjectName}</h3>
                  <span className="text-caption text-text-muted">{(assignments as any[]).length} class(es)</span>
                </div>
                <div className="flex flex-wrap gap-2 px-5 pb-4">
                  {(assignments as any[]).map((cs: any) => (
                    <div key={cs.id} className="flex items-center gap-1.5 bg-bg border border-border rounded-full px-3 py-1">
                      <span className="text-small font-medium">{cs.classes?.name}</span>
                      <button
                        onClick={() => removeClassSubject(cs.id)}
                        className="text-text-muted hover:text-error transition-colors text-xs leading-none"
                        title="Remove"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </Card>
            ))
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          TAB 3 — Teachers → Subjects (per class)
      ══════════════════════════════════════════════════════════════════ */}
      {tab === "subject-teachers" && (
        <div className="space-y-4">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-small text-text-muted">
                Assign which teacher teaches which subject in each class. If a subject has <strong>no teacher assigned</strong>, the primary class teacher covers it automatically.
              </p>
            </div>
            <Button onClick={() => setShowStForm(!showStForm)}>
              {showStForm ? "Cancel" : "Assign"}
            </Button>
          </div>

          {showStForm && (
            <Card variant="bordered">
              <form onSubmit={assignSubjectTeacher} className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div>
                    <label className="block text-small font-semibold text-text-secondary mb-2">Class</label>
                    <select
                      value={stClassId}
                      onChange={(e) => { setStClassId(e.target.value); setStSubjectId(""); }}
                      className="w-full px-4 py-2.5 bg-surface border border-border-strong rounded-sm text-body"
                      required
                    >
                      <option value="">Select class</option>
                      {classes.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-small font-semibold text-text-secondary mb-2">
                      Subject
                      {stClassId && classSubjectsForClass.length === 0 && (
                        <span className="text-error font-normal ml-1">(no subjects assigned to this class yet)</span>
                      )}
                    </label>
                    <select
                      value={stSubjectId}
                      onChange={(e) => setStSubjectId(e.target.value)}
                      className="w-full px-4 py-2.5 bg-surface border border-border-strong rounded-sm text-body"
                      required
                      disabled={!stClassId}
                    >
                      <option value="">Select subject</option>
                      {classSubjectsForClass.map((cs) => (
                        <option key={cs.subject_id} value={cs.subject_id}>
                          {cs.subjects?.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-small font-semibold text-text-secondary mb-2">
                      Teacher
                      <span className="text-text-muted font-normal ml-1">(optional)</span>
                    </label>
                    <select
                      value={stTeacherId}
                      onChange={(e) => setStTeacherId(e.target.value)}
                      className="w-full px-4 py-2.5 bg-surface border border-border-strong rounded-sm text-body"
                    >
                      <option value="">— Falls back to class teacher —</option>
                      {teachers.map((t) => (
                        <option key={t.id} value={t.id}>{t.profiles?.full_name || t.employee_id}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <Button type="submit" loading={isSubmitting}>Save Assignment</Button>
              </form>
            </Card>
          )}

          {Object.keys(groupedStByClass).length === 0 ? (
            <Card variant="bordered">
              <p className="text-small text-text-muted py-8 text-center">No subject-teacher assignments yet.</p>
            </Card>
          ) : (
            Object.entries(groupedStByClass).sort(([a], [b]) => a.localeCompare(b)).map(([className, sts]) => (
              <Card key={className} variant="bordered" className="shadow-sm">
                <h3 className="text-h3 font-bold px-5 pt-4 pb-2">{className}</h3>
                <div className="divide-y divide-border">
                  {(sts as any[]).map((st: any) => {
                    const hasTeacher = !!st.teachers?.profiles?.full_name;
                    return (
                      <div key={st.id} className="flex justify-between items-center px-5 py-3 gap-4">
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-body truncate">{st.subjects?.name || "—"}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            {hasTeacher ? (
                              <Badge variant="success">{st.teachers.profiles.full_name}</Badge>
                            ) : (
                              <Badge variant="warning">Fallback → Class Teacher</Badge>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-2 items-center shrink-0">
                          {/* Quick-reassign inline select */}
                          <select
                            className="text-small px-2 py-1 bg-surface border border-border-strong rounded-sm"
                            defaultValue={st.teachers?.id || ""}
                            onChange={(e) => reassignTeacher(st.id, e.target.value || null)}
                          >
                            <option value="">— Class Teacher —</option>
                            {teachers.map((t) => (
                              <option key={t.id} value={t.id}>{t.profiles?.full_name || t.employee_id}</option>
                            ))}
                          </select>
                          <Button variant="danger" size="sm" onClick={() => removeSubjectTeacher(st.id)}>Remove</Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  );
}
