"use client";
import { useCallback, useEffect, useState } from "react";
import { Card, Badge, Button, Input, Modal, toast } from "@/components/ui";
import { splitStoredName } from "@/lib/students/teacher-editable";

/**
 * My Students — the class teacher's view.
 *
 * A teacher can LOOK and CORRECT here, and nothing else: the only write on this
 * page is the details form (names, date of birth, gender and the parent/guardian
 * WhatsApp number), and the API behind it enforces the same allow-list. There is
 * no register, delete, transfer or account control — registration stays an
 * administrative function.
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
  generated_password?: string | null;
  profiles?: {
    full_name?: string | null;
    email?: string | null;
    first_name?: string | null;
    middle_name?: string | null;
    last_name?: string | null;
  } | null;
};

type ClassOption = { id: string; name: string; role?: string | null };

export default function TeacherStudentsPage() {
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [classId, setClassId] = useState("");
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

  useEffect(() => {
    fetch("/api/teacher/dashboard")
      .then((r) => r.json())
      .then((d) => {
        setClasses(
          (Array.isArray(d.classes) ? d.classes : []).filter(
            (c: ClassOption) => c.role === "primary",
          ),
        );
      })
      .catch(() => {});
  }, []);

  const loadStudents = useCallback(async (forClass: string) => {
    if (!forClass) {
      setStudents([]);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/teacher/students?class_id=${forClass}`);
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
  }, []);

  useEffect(() => {
    void loadStudents(classId);
  }, [classId, loadStudents]);

  const sorted = [...students].sort((a, b) =>
    (a.profiles?.full_name || "").localeCompare(b.profiles?.full_name || ""),
  );

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
      await loadStudents(classId);
    } catch {
      setFormError("Could not reach the server.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex justify-between items-center">
        <h1 className="text-h1 font-bold">My Students</h1>
        {classId && <Badge variant="info">{sorted.length} students</Badge>}
      </div>

      <div>
        <label className="block text-caption text-text-muted mb-1">Class</label>
        <select
          value={classId}
          onChange={(e) => setClassId(e.target.value)}
          className="px-4 py-2.5 bg-surface border border-border-strong rounded-sm text-body tablet:min-w-[200px] w-full tablet:w-auto"
        >
          <option value="">Select your class</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

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

      {/* ── Table (All screens) ── */}
      {!loading && classId && sorted.length > 0 && (
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
                  <th className="text-left px-3 py-3 font-semibold text-xs tablet:text-sm">
                    Password
                  </th>
                  <th className="text-right px-3 py-3 font-semibold text-xs tablet:text-sm">
                    Details
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
                    <td className="px-3 py-3 font-mono text-xs tablet:text-sm break-all">
                      {s.generated_password || "Reset to view"}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <Button size="sm" variant="secondary" onClick={() => openEdit(s)}>
                        Edit details
                      </Button>
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
          <p className="text-small text-text-muted py-8 text-center">No students in this class.</p>
        </Card>
      )}

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
              The school uses this number to reach the parent on WhatsApp. Registering, deleting,
              transferring or re-classing a student is done by the school admin.
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}
