"use client";
import { useCallback, useEffect, useState } from "react";
import {
  ActionsMenu,
  Card,
  Badge,
  Button,
  ConfirmDialog,
  CredentialModal,
  Input,
  Modal,
  OncePasswordModal,
  toast,
} from "@/components/ui";
import type { ActionMenuGroup, ActionMenuItem } from "@/components/ui";
import {
  Archive,
  Eye,
  GraduationCap,
  KeyRound,
  Pencil,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import {
  StudentAccountStatusModal,
  StudentDetailsModal,
} from "@/components/students/StudentProfileModals";
import { AcademicRecordsModal } from "@/components/students/AcademicRecordsModal";
import { buildStudentMenu, type StudentMenuAction } from "@/lib/students/action-menu";
import { splitStoredName } from "@/lib/students/teacher-editable";
import type { DuplicateMatch } from "@/lib/students/duplicates";
import { AddStudentModal, EMPTY_ADD_FORM, type AddStudentForm } from "./AddStudentModal";
import { DuplicateStudentModal } from "./DuplicateStudentModal";

/**
 * My Students — the class teacher's roster.
 *
 * A teacher can:
 *   - ADD a student to a class they are the form teacher of (the class teacher
 *     role is what owns a roster; a subject teacher can still correct details);
 *   - correct a student's details (names, date of birth, gender and the
 *     parent/guardian WhatsApp number — the allow-list in teacher-editable.ts);
 *   - reset a student's password;
 *   - DELETE a student, which ARCHIVES them. The record and every result,
 *     report card, attendance row, payment and receipt stay in place; the child
 *     simply disappears from the active roster and can be restored later.
 *
 * "Archived" is the same `profiles.is_active = false` flag the school-admin
 * screen uses, so an admin sees — and can restore — anything a teacher archives.
 *
 * Registering a student checks for an existing record first, including archived
 * ones, and offers to restore that record instead of creating a duplicate
 * identity. Every action is re-checked server-side against the same class-scope
 * rule, so the page cannot be used to reach another class or school.
 */

type StudentRow = {
  id: string;
  class_id: string | null;
  student_id: string | null;
  date_of_birth: string | null;
  gender: string | null;
  parent_phone: string | null;
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
  can_restore?: boolean;
  nationality?: string | null;
  religion?: string | null;
  blood_group?: string | null;
  parent_occupation?: string | null;
  parent_location?: string | null;
  emergency_contact?: string | null;
  allergies?: string | null;
  health_notes?: string | null;
  status?: string | null;
  enrollment_date?: string | null;
  created_at?: string | null;
  must_change_password?: boolean | null;
  classes?: { name?: string | null } | null;
  profiles?: {
    full_name?: string | null;
    email?: string | null;
    phone?: string | null;
    recovery_email?: string | null;
    avatar_url?: string | null;
    is_active?: boolean | null;
    first_name?: string | null;
    middle_name?: string | null;
    last_name?: string | null;
  } | null;
};

type ClassOption = { id: string; name: string; role?: string | null };

type StudentView = "active" | "archived";

export default function TeacherStudentsPage() {
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [classesLoaded, setClassesLoaded] = useState(false);
  const [classId, setClassId] = useState("");
  const [view, setView] = useState<StudentView>("active");
  const [search, setSearch] = useState("");
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [editing, setEditing] = useState<StudentRow | null>(null);
  const [form, setForm] = useState({
    first: "",
    middle: "",
    last: "",
    dob: "",
    gender: "",
    phone: "",
  });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState<AddStudentForm>({ ...EMPTY_ADD_FORM });
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [duplicateMatches, setDuplicateMatches] = useState<DuplicateMatch[] | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [created, setCreated] = useState<{
    name: string;
    email: string;
    password: string;
  } | null>(null);

  const [confirmArchive, setConfirmArchive] = useState<StudentRow | null>(null);
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const [viewingDetails, setViewingDetails] = useState<StudentRow | null>(null);
  const [viewingStatus, setViewingStatus] = useState<StudentRow | null>(null);
  const [viewingRecords, setViewingRecords] = useState<StudentRow | null>(null);

  const [confirmReset, setConfirmReset] = useState<StudentRow | null>(null);
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [resetResult, setResetResult] = useState<{
    name: string;
    username: string;
    password: string;
  } | null>(null);

  useEffect(() => {
    fetch("/api/teacher/dashboard")
      .then((r) => r.json())
      .then((d) => {
        // Every class this teacher is attached to — as its class teacher OR as a
        // subject teacher in it. The `role` field is set only when the teacher
        // is on the class_teachers roster, which is what owns Add/Delete.
        const all: ClassOption[] = Array.isArray(d.classes) ? d.classes : [];
        setClasses(all);
        // Open on the class they are the CLASS teacher of, when there is one.
        const primary = all.find((c) => c.role === "primary");
        if (primary) setClassId((current) => current || primary.id);
      })
      .catch(() => {})
      .finally(() => setClassesLoaded(true));
  }, []);

  const loadStudents = useCallback(
    async (forClass: string, forView: StudentView, query: string) => {
      if (!forClass) {
        setStudents([]);
        return;
      }
      setLoading(true);
      setLoadError(null);
      try {
        const params = new URLSearchParams({ class_id: forClass, status: forView });
        if (forView === "archived" && query.trim()) params.set("search", query.trim());
        const res = await fetch(`/api/teacher/students?${params}`);
        const body = await res.json().catch(() => null);
        if (!res.ok) {
          setStudents([]);
          setLoadError(body?.error || `Could not load students (HTTP ${res.status})`);
          return;
        }
        setStudents(Array.isArray(body) ? body : []);
      } catch {
        setLoadError("Could not reach the server.");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    // Archived search is debounced so typing does not hammer the API.
    const handle = setTimeout(
      () => void loadStudents(classId, view, search),
      view === "archived" && search.trim() ? 300 : 0,
    );
    return () => clearTimeout(handle);
  }, [classId, view, search, loadStudents]);

  const selectClass = (next: string) => {
    setClassId(next);
    setSearch("");
  };

  const selectedClass = classes.find((c) => c.id === classId);
  // A form teacher (primary or assistant) owns the roster. Subject-only
  // assignments have no role, so they keep the existing view/edit rights but
  // do not see Add/Delete.
  const canManage = !!selectedClass?.role;

  const sorted = [...students].sort((a, b) => {
    if (view === "archived") {
      const byClass = (a.classes?.name || "").localeCompare(b.classes?.name || "");
      if (byClass !== 0) return byClass;
    }
    return (a.profiles?.full_name || "").localeCompare(b.profiles?.full_name || "");
  });

  const openEdit = (s: StudentRow) => {
    const parts = splitStoredName({
      first: s.first_name ?? s.profiles?.first_name ?? null,
      middle: s.middle_name ?? s.profiles?.middle_name ?? null,
      last: s.last_name ?? s.profiles?.last_name ?? null,
      fullName: s.profiles?.full_name ?? null,
    });
    setForm({
      first: parts.first,
      middle: parts.middle,
      last: parts.last,
      dob: s.date_of_birth ? String(s.date_of_birth).slice(0, 10) : "",
      gender: (s.gender ?? "").toLowerCase(),
      phone: s.parent_phone ?? "",
    });
    setFormError(null);
    setEditing(s);
  };

  const previewName =
    [form.first.trim(), form.middle.trim(), form.last.trim()].filter(Boolean).join(" ") || "—";

  const save = async () => {
    if (!editing) return;
    if (!form.first.trim() && !form.last.trim()) {
      setFormError("Enter at least a first or last name.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const res = await fetch(`/api/teacher/students/${editing.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          first_name: form.first,
          middle_name: form.middle,
          last_name: form.last,
          date_of_birth: form.dob,
          gender: form.gender,
          parent_phone: form.phone,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFormError(body.error || `Could not save (HTTP ${res.status})`);
        return;
      }
      toast.success("Student details saved");
      setEditing(null);
      await loadStudents(classId, view, search);
    } catch {
      setFormError("Could not reach the server.");
    } finally {
      setSaving(false);
    }
  };

  const closeAdd = () => {
    setAddOpen(false);
    setAddForm({ ...EMPTY_ADD_FORM });
    setAddError(null);
    setDuplicateMatches(null);
  };

  /**
   * Registers the student. A 409 means the server found likely duplicates and
   * nothing was written; the dialog then lets the teacher restore, cancel, or
   * resend with `allowDuplicate` for a genuinely different child.
   */
  const submitAdd = async (allowDuplicate = false) => {
    if (!classId) return;
    if (!addForm.first.trim() && !addForm.last.trim()) {
      setAddError("Enter at least a first or last name.");
      return;
    }
    setAddSaving(true);
    setAddError(null);
    try {
      const res = await fetch("/api/teacher/students", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          class_id: classId,
          first_name: addForm.first,
          middle_name: addForm.middle,
          last_name: addForm.last,
          date_of_birth: addForm.dob,
          gender: addForm.gender,
          parent_phone: addForm.phone,
          allow_duplicate: allowDuplicate,
        }),
      });
      const body = await res.json().catch(() => ({}));

      if (res.status === 409 && Array.isArray(body.matches)) {
        setDuplicateMatches(body.matches as DuplicateMatch[]);
        return;
      }
      if (!res.ok) {
        setAddError(body.error || `Could not add student (HTTP ${res.status})`);
        return;
      }

      const name =
        [addForm.first.trim(), addForm.middle.trim(), addForm.last.trim()]
          .filter(Boolean)
          .join(" ") || "this student";

      toast.success("Student added");
      if (body.email && body.password) {
        setCreated({ name, email: body.email, password: body.password });
      }
      closeAdd();
      if (view !== "active") setView("active");
      await loadStudents(classId, "active", "");
    } catch {
      setAddError("Could not reach the server.");
    } finally {
      setAddSaving(false);
    }
  };

  const restoreStudent = async (studentId: string, name: string) => {
    if (!classId) return;
    setRestoringId(studentId);
    try {
      const res = await fetch(`/api/teacher/students/${studentId}/restore`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ class_id: classId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("Could not restore student", body.error || `HTTP ${res.status}`);
        return;
      }
      toast.success(`${name} restored to the active list`);
      setDuplicateMatches(null);
      closeAdd();
      if (view !== "active") setView("active");
      await loadStudents(classId, "active", "");
    } catch {
      toast.error("Could not restore student", "Please check your connection and try again.");
    } finally {
      setRestoringId(null);
    }
  };

  const archiveStudent = async () => {
    if (!confirmArchive) return;
    const target = confirmArchive;
    setArchivingId(target.id);
    try {
      const res = await fetch(`/api/teacher/students/${target.id}`, { method: "DELETE" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("Could not archive student", body.error || `HTTP ${res.status}`);
        return;
      }
      toast.success("Student archived", "Their records are preserved and can be restored later.");
      setConfirmArchive(null);
      await loadStudents(classId, view, search);
    } catch {
      toast.error("Could not archive student", "Please check your connection and try again.");
    } finally {
      setArchivingId(null);
    }
  };

  const resetPassword = async (s: StudentRow) => {
    setResettingId(s.id);
    try {
      const res = await fetch(`/api/teacher/students/${s.id}/reset-password`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.error || `Could not reset the password (HTTP ${res.status}).`);
      }
      setResetResult({
        name: s.profiles?.full_name || "this student",
        username: s.profiles?.email || "",
        password: body.password,
      });
    } catch (err) {
      toast.error(
        "Password reset failed",
        err instanceof Error ? err.message : "Please try again.",
      );
    } finally {
      setResettingId(null);
      setConfirmReset(null);
    }
  };

  /**
   * The row menu for one student. The archived/active split, the archive and
   * restore rules, and the records scope all come from the shared
   * `buildStudentMenu` helper, so the admin and teacher tables agree.
   */
  const actionGroups = (s: StudentRow, archived: boolean): ActionMenuGroup[] => {
    const items: Partial<Record<StudentMenuAction, ActionMenuItem>> = {
      details: {
        key: "details",
        label: "View Details",
        icon: <Eye size={16} />,
        onSelect: () => setViewingDetails(s),
      },
      edit: {
        key: "edit",
        label: "Edit Student",
        icon: <Pencil size={16} />,
        onSelect: () => openEdit(s),
      },
      records: {
        key: "records",
        label: "View Academic Records",
        icon: <GraduationCap size={16} />,
        onSelect: () => setViewingRecords(s),
      },
      status: {
        key: "status",
        label: "View Account Status",
        icon: <ShieldCheck size={16} />,
        onSelect: () => setViewingStatus(s),
      },
      reset: {
        key: "reset",
        label: "Reset Password",
        icon: <KeyRound size={16} />,
        tone: "warning",
        onSelect: () => setConfirmReset(s),
      },
      archive: {
        key: "archive",
        label: "Archive Student",
        icon: <Archive size={16} />,
        tone: "danger",
        onSelect: () => setConfirmArchive(s),
      },
      restore: {
        key: "restore",
        label: "Restore Student",
        icon: <RotateCcw size={16} />,
        onSelect: () =>
          void restoreStudent(s.id, s.profiles?.full_name || "Student"),
      },
    };

    return buildStudentMenu({
      archived,
      canManage,
      // Academic history is scoped to a class this teacher actually teaches. A
      // school-wide archived search can show another class's record; that row
      // keeps the information-only actions.
      canViewRecords: !!s.class_id && s.class_id === classId,
      canRestore: !!s.can_restore,
    }).map((group) => ({
      label: group.label,
      items: group.actions.flatMap((action) => {
        const item = items[action];
        return item ? [item] : [];
      }),
    }));
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div className="flex items-center gap-2">
          <h1 className="text-h1 font-bold">My Students</h1>
          {classId && (
            <Badge variant="info">
              {sorted.length} {view === "archived" ? "archived" : "students"}
            </Badge>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={view === "active" ? "primary" : "ghost"}
            onClick={() => setView("active")}
          >
            Active
          </Button>
          <Button
            size="sm"
            variant={view === "archived" ? "primary" : "ghost"}
            onClick={() => setView("archived")}
          >
            Archived
          </Button>
          {classId && canManage && (
            <Button onClick={() => setAddOpen(true)}>+ Add Student</Button>
          )}
        </div>
      </div>

      {classesLoaded && classes.length === 0 ? (
        <Card variant="default" className="shadow-sm">
          <p className="text-small text-text-muted py-8 px-4 text-center">
            You are not assigned to any class yet. Ask your school admin to add you to a
            class — as its class teacher or as a subject teacher — and it will appear here.
          </p>
        </Card>
      ) : (
        <div className="flex flex-col tablet:flex-row tablet:items-end gap-3">
          <div>
            <label className="block text-caption text-text-muted mb-1">Class</label>
            <select
              value={classId}
              onChange={(e) => selectClass(e.target.value)}
              className="px-4 py-2.5 bg-surface border border-border-strong rounded-sm text-body tablet:min-w-[200px] w-full tablet:w-auto"
            >
              <option value="">Select your class</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.role === "primary" ? `${c.name} — class teacher` : c.name}
                </option>
              ))}
            </select>
          </div>
          {view === "archived" && classId && (
            <div className="flex-1 tablet:max-w-md">
              <Input
                label="Search archived students"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name across the school…"
              />
            </div>
          )}
        </div>
      )}

      {loadError && (
        <div className="rounded-lg border border-error bg-error-bg px-4 py-3 text-body text-error">
          {loadError}
        </div>
      )}

      {!classId && (
        <Card variant="default" className="shadow-sm">
          <p className="text-small text-text-muted py-8 text-center">
            Select a class to view your students.
          </p>
        </Card>
      )}

      {loading && (
        <div className="flex justify-center py-10">
          <div className="animate-spin h-6 w-6 border-2 border-accent border-t-transparent rounded-full" />
        </div>
      )}

      {/* ── Active roster ── */}
      {!loading && classId && view === "active" && sorted.length > 0 && (
        <div className="w-full overflow-x-auto pb-4">
          <Card variant="default" className="shadow-sm overflow-hidden p-0 min-w-[600px]">
            <table className="w-full text-small table-auto">
              <thead className="bg-primary text-text-inverse">
                <tr>
                  <th className="text-center px-3 py-3 font-semibold text-xs tablet:text-sm w-12">
                    S/N
                  </th>
                  <th className="text-left px-3 py-3 font-semibold text-xs tablet:text-sm">
                    Student
                  </th>
                  <th className="text-left px-3 py-3 font-semibold text-xs tablet:text-sm">
                    Username
                  </th>
                  <th className="text-right px-3 py-3 font-semibold text-xs tablet:text-sm">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((s, i) => (
                  <tr
                    key={s.id}
                    className={`border-b border-border ${i % 2 === 0 ? "bg-surface" : "bg-bg"}`}
                  >
                    <td className="text-center px-3 py-3 text-text-muted text-xs tablet:text-sm">
                      {i + 1}
                    </td>
                    <td className="px-3 py-3 font-medium text-xs tablet:text-sm break-words">
                      {s.profiles?.full_name || "—"}
                    </td>
                    <td className="px-3 py-3 font-mono text-xs tablet:text-sm break-all">
                      {s.profiles?.email || "—"}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <div className="flex justify-end">
                        <ActionsMenu
                          groups={actionGroups(s, false)}
                          ariaLabel={`Actions for ${s.profiles?.full_name || "student"}`}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      )}

      {/* ── Archived students ── */}
      {!loading && classId && view === "archived" && sorted.length > 0 && (
        <div className="w-full overflow-x-auto pb-4">
          <Card variant="default" className="shadow-sm overflow-hidden p-0 min-w-[620px]">
            <table className="w-full text-small table-auto">
              <thead className="bg-primary text-text-inverse">
                <tr>
                  <th className="text-center px-3 py-3 font-semibold text-xs tablet:text-sm w-12">
                    S/N
                  </th>
                  <th className="text-left px-3 py-3 font-semibold text-xs tablet:text-sm">
                    Student
                  </th>
                  <th className="text-left px-3 py-3 font-semibold text-xs tablet:text-sm">
                    Class
                  </th>
                  <th className="text-left px-3 py-3 font-semibold text-xs tablet:text-sm">
                    Admission No.
                  </th>
                  <th className="text-right px-3 py-3 font-semibold text-xs tablet:text-sm">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((s, i) => (
                  <tr
                    key={s.id}
                    className={`border-b border-border ${i % 2 === 0 ? "bg-surface" : "bg-bg"}`}
                  >
                    <td className="text-center px-3 py-3 text-text-muted text-xs tablet:text-sm">
                      {i + 1}
                    </td>
                    <td className="px-3 py-3 font-medium text-xs tablet:text-sm break-words">
                      <span className="inline-flex flex-wrap items-center gap-2">
                        {s.profiles?.full_name || "—"}
                        <Badge variant="warning">Archived</Badge>
                      </span>
                    </td>
                    <td className="px-3 py-3 text-xs tablet:text-sm">
                      {s.classes?.name || "Not assigned"}
                    </td>
                    <td className="px-3 py-3 font-mono text-xs tablet:text-sm">
                      {s.student_id || "—"}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <div className="flex flex-col items-end gap-1">
                        <ActionsMenu
                          groups={actionGroups(s, true)}
                          ariaLabel={`Actions for ${s.profiles?.full_name || "student"}`}
                        />
                        {!s.can_restore && (
                          <span className="text-caption text-text-muted">
                            Archived in another class
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      )}

      {!loading && classId && sorted.length === 0 && !loadError && (
        <Card variant="default" className="shadow-sm">
          <p className="text-small text-text-muted py-8 text-center">
            {view === "archived"
              ? search.trim()
                ? "No archived students match that search."
                : "No archived students for this class."
              : "No students in this class yet."}
          </p>
        </Card>
      )}

      {/* ── Add a student ── */}
      <AddStudentModal
        isOpen={addOpen && duplicateMatches === null}
        className={selectedClass?.name}
        form={addForm}
        onChange={(patch) => setAddForm((f) => ({ ...f, ...patch }))}
        onClose={closeAdd}
        onSubmit={() => void submitAdd(false)}
        saving={addSaving}
        error={addError}
      />

      <DuplicateStudentModal
        open={duplicateMatches !== null}
        matches={duplicateMatches ?? []}
        destinationClass={selectedClass?.name}
        onCancel={() => {
          setDuplicateMatches(null);
          closeAdd();
        }}
        onRegisterAnyway={() => {
          setDuplicateMatches(null);
          void submitAdd(true);
        }}
        onRestore={(match) => void restoreStudent(match.id, match.full_name)}
        saving={addSaving}
        restoringId={restoringId}
      />

      <StudentDetailsModal
        open={viewingDetails !== null}
        onClose={() => setViewingDetails(null)}
        student={viewingDetails}
        className={viewingDetails?.classes?.name ?? selectedClass?.name}
      />

      <StudentAccountStatusModal
        open={viewingStatus !== null}
        onClose={() => setViewingStatus(null)}
        student={viewingStatus}
        className={viewingStatus?.classes?.name ?? selectedClass?.name}
      />

      <AcademicRecordsModal
        key={viewingRecords?.id ?? "none"}
        open={viewingRecords !== null}
        onClose={() => setViewingRecords(null)}
        studentId={viewingRecords?.id ?? null}
        studentName={viewingRecords?.profiles?.full_name}
        endpoint={
          viewingRecords
            ? `/api/teacher/students/${viewingRecords.id}/academic-records`
            : null
        }
        reportCardEndpointBase={
          viewingRecords
            ? `/api/teacher/students/${viewingRecords.id}/report-card`
            : null
        }
      />

      {/* ── Correct a student's details ── */}
      <Modal
        isOpen={editing !== null}
        onClose={() => setEditing(null)}
        title="Student details"
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button variant="primary" loading={saving} onClick={() => void save()}>
              Save details
            </Button>
          </div>
        }
      >
        {editing && (
          <div className="space-y-4">
            {formError && (
              <div className="rounded-lg border border-error bg-error-bg px-4 py-3 text-body text-error">
                {formError}
              </div>
            )}

            <div className="rounded-lg border border-border bg-clay px-3 py-2 space-y-0.5">
              <p className="text-caption text-text-secondary">
                Admission number:{" "}
                <span className="font-mono text-text-primary">{editing.student_id || "—"}</span>
              </p>
              <p className="text-caption text-text-secondary">
                Username:{" "}
                <span className="font-mono text-text-primary">
                  {editing.profiles?.email || "—"}
                </span>
              </p>
              <p className="text-caption text-text-secondary">
                Class:{" "}
                <span className="text-text-primary">
                  {classes.find((c) => c.id === editing.class_id)?.name ?? "—"}
                </span>
              </p>
            </div>

            <div className="grid grid-cols-1 tablet:grid-cols-3 gap-3">
              <Input
                label="First name"
                value={form.first}
                onChange={(e) => setForm((f) => ({ ...f, first: e.target.value }))}
              />
              <Input
                label="Middle name"
                value={form.middle}
                onChange={(e) => setForm((f) => ({ ...f, middle: e.target.value }))}
              />
              <Input
                label="Last name"
                value={form.last}
                onChange={(e) => setForm((f) => ({ ...f, last: e.target.value }))}
              />
            </div>

            <p className="text-caption text-text-secondary">
              Saved as: <span className="text-text-primary font-medium">{previewName}</span>
            </p>

            <div className="grid grid-cols-1 tablet:grid-cols-2 gap-3">
              <Input
                label="Date of birth"
                type="date"
                value={form.dob}
                onChange={(e) => setForm((f) => ({ ...f, dob: e.target.value }))}
              />
              <div>
                <label className="text-caption font-semibold text-text-secondary">Gender</label>
                <select
                  value={form.gender}
                  onChange={(e) => setForm((f) => ({ ...f, gender: e.target.value }))}
                  className="w-full mt-1 px-3 py-2.5 border border-border rounded-lg text-body bg-surface focus:outline-none focus:border-primary transition-colors"
                >
                  <option value="">Not set</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                </select>
              </div>
            </div>

            <Input
              label="Parent/Guardian WhatsApp Number"
              value={form.phone}
              placeholder="e.g. 0803 123 4567"
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            />

            <p className="text-caption text-text-secondary">
              The school uses this number to reach the parent on WhatsApp. Moving a
              student to another class or changing an admission number is done by the
              school admin.
            </p>
          </div>
        )}
      </Modal>

      {/* ── Archive (shown as Delete, never physical) ── */}
      <ConfirmDialog
        open={confirmArchive !== null}
        title={`Archive ${confirmArchive?.profiles?.full_name || "this student"}?`}
        message={
          "The student will be removed from the active class list. Their results, report cards, attendance, payments and receipts are kept, and the record can be restored later."
        }
        confirmLabel="Archive student"
        variant="danger"
        loading={confirmArchive !== null && archivingId === confirmArchive.id}
        onConfirm={() => void archiveStudent()}
        onCancel={() => setConfirmArchive(null)}
      />

      {/* ── Reset a student's password ── */}
      <ConfirmDialog
        open={confirmReset !== null}
        title={`Reset the password for ${confirmReset?.profiles?.full_name || "this student"}?`}
        message={
          "This replaces the student's current password immediately. A new temporary password will appear once, right after you confirm — closing it wipes the password from the screen."
        }
        confirmLabel="Reset password"
        variant="warning"
        loading={confirmReset !== null && resettingId === confirmReset.id}
        onConfirm={() => {
          if (confirmReset) void resetPassword(confirmReset);
        }}
        onCancel={() => setConfirmReset(null)}
      />

      <CredentialModal
        isOpen={created !== null}
        onClose={() => setCreated(null)}
        credentials={
          created
            ? [{ name: created.name, email: created.email, password: created.password }]
            : []
        }
        entityLabel="Student"
      />

      <OncePasswordModal
        open={resetResult !== null}
        onClose={() => setResetResult(null)}
        name={resetResult?.name ?? ""}
        username={resetResult?.username ?? ""}
        password={resetResult?.password ?? ""}
      />
    </div>
  );
}
