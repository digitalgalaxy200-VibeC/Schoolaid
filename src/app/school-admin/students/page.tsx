"use client";
import { useEffect, useState } from "react";
import { Button, Input, Card } from "@/components/ui";
import { SpreadsheetImporter } from "@/components/ui/SpreadsheetImporter";

export default function StudentsPage() {
  const [items, setItems] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [show, setShow] = useState(false);
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [classId, setClassId] = useState("");
  const [gender, setGender] = useState("");
  const [dob, setDob] = useState("");
  const [created, setCreated] = useState<any>(null);
  const [bulkClassId, setBulkClassId] = useState("");
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [resetResult, setResetResult] = useState<{
    name: string;
    email: string;
    password: string;
  } | null>(null);
  const [school, setSchool] = useState<{ name: string; slug: string } | null>(
    null,
  );
  const [msg, setMsg] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  const load = () =>
    fetch("/api/school-admin/students")
      .then((r) => r.json())
      .then((d) => setItems(Array.isArray(d) ? d : []));
  useEffect(() => {
    fetch("/api/school-admin/classes")
      .then((r) => r.json())
      .then((d) => setClasses(Array.isArray(d) ? d : []));
    fetch("/api/school-admin/school")
      .then((r) => r.json())
      .then((d) => {
        if (d?.name) setSchool(d);
      });
    load();
  }, []);

  const reset = () => {
    setFirst("");
    setLast("");
    setClassId("");
    setGender("");
    setDob("");
    setEditId(null);
  };

  const openAdd = () => {
    reset();
    setShow(true);
  };
  const openEdit = (s: any) => {
    setEditId(s.id);
    setFirst(s.profiles?.full_name?.split(" ")[0] || "");
    setLast(s.profiles?.full_name?.split(" ").slice(1).join(" ") || "");
    setClassId(s.class_id || "");
    setGender(s.gender || "");
    setDob(s.date_of_birth || "");
    setShow(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    const method = editId ? "PUT" : "POST";
    const body: Record<string, unknown> = {
      first_name: first,
      last_name: last,
      class_id: classId,
      gender,
      date_of_birth: dob,
    };
    if (editId) body.id = editId;
    const r = await fetch("/api/school-admin/students", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setIsSubmitting(false);
    const d = await r.json();
    if (r.ok) {
      if (!editId) setCreated(d);
      setShow(false);
      reset();
      setMsg({
        type: "success",
        text: editId ? "Student updated" : "Student created",
      });
      load();
    } else {
      setMsg({ type: "error", text: d.error });
    }
  };

  const handleImport = async (data: any[]) => {
    if (!bulkClassId) {
      setMsg({ type: "error", text: "Please select a class first." });
      return;
    }
    setImporting(true);
    let c = 0;
    const errors: string[] = [];
    const results: any[] = [];
    for (const r of data) {
      const res = await fetch("/api/school-admin/students", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: r.first_name,
          last_name: r.last_name,
          class_id: bulkClassId,
          gender: r.gender,
          date_of_birth: r.date_of_birth,
        }),
      });
      const d = await res.json();
      if (res.ok) {
        c++;
        results.push(d);
      } else if (res.status === 409)
        errors.push(`Skipped: ${r.first_name} ${r.last_name}`);
      else errors.push(`Failed: ${d.error}`);
    }
    setImporting(false);
    load();
    setMsg({
      type: c > 0 ? "success" : "error",
      text: `${c} created${errors.length > 0 ? `, ${errors.length} skipped/failed` : ""}`,
    });
    if (results.length > 0) setCreated({ results, count: results.length });
  };

  const handleResetPassword = async (
    profileId: string,
    studentName: string,
    studentEmail: string,
  ) => {
    setResettingId(profileId);
    setMsg(null);
    setResetResult(null);
    try {
      const res = await fetch("/api/school-admin/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile_id: profileId, role: "student" }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Reset failed");
      setResetResult({
        name: studentName,
        email: studentEmail,
        password: d.password,
      });
      setMsg({ type: "success", text: "Password reset" });
    } catch (err: any) {
      setMsg({ type: "error", text: err.message });
    } finally {
      setResettingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between">
        <h1 className="text-h1 font-bold">Students</h1>
        <Button onClick={openAdd}>Add Student</Button>
      </div>
      {msg && (
        <div
          className={`px-4 py-3 rounded-sm text-small font-medium ${msg.type === "success" ? "bg-success-bg text-success border border-success" : "bg-error-bg text-error border border-error"}`}
        >
          {msg.text}
        </div>
      )}

      {show && (
        <Card variant="bordered">
          <form onSubmit={handleSubmit} className="space-y-4">
            {editId && (
              <p className="text-caption text-primary font-medium">
                Editing student — Save to apply changes
              </p>
            )}
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="First Name"
                value={first}
                onChange={(e) => setFirst(e.target.value)}
                required
              />
              <Input
                label="Last Name"
                value={last}
                onChange={(e) => setLast(e.target.value)}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-small font-semibold text-text-secondary mb-2">
                  Gender (Optional)
                </label>
                <select
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                  className="w-full px-4 py-2.5 bg-surface border border-border-strong rounded-sm text-body"
                >
                  <option value="">Select</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                </select>
              </div>
              <Input
                label="Date of Birth"
                type="date"
                value={dob}
                onChange={(e) => setDob(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-small font-semibold text-text-secondary mb-2">
                Class
              </label>
              <select
                value={classId}
                onChange={(e) => setClassId(e.target.value)}
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
              <Button type="submit" loading={isSubmitting}>
                {editId ? "Save Changes" : "Create"}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setShow(false);
                  reset();
                }}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      )}

      {created &&
        (() => {
          const baseUrl =
            typeof window !== "undefined"
              ? `${window.location.protocol}//${window.location.host}`
              : "";
          const loginUrl = school?.slug
            ? `${baseUrl}/school/${school.slug}/login`
            : `${baseUrl}/login`;
          const items: { name: string; email: string; password: string }[] =
            created.results
              ? created.results.map((r: any) => ({
                  name: r.profiles?.full_name || "",
                  email: r.email,
                  password: r.password,
                }))
              : [
                  {
                    name: created.profiles?.full_name || "",
                    email: created.email,
                    password: created.password,
                  },
                ];
          return (
            <div className="bg-warning-bg border border-warning rounded-sm p-5 space-y-3">
              <p className="text-small font-bold text-warning">
                Save credentials — shown once only
                {created.count ? ` (${created.count} students)` : ""}
              </p>
              {items.map((item, i) => (
                <div
                  key={i}
                  className="border border-warning/40 bg-white rounded-sm p-3"
                >
                  {item.name && (
                    <p className="text-small font-semibold">👤 {item.name}</p>
                  )}
                  <p className="text-small">
                    Email: <span className="font-mono">{item.email}</span>
                  </p>
                  <p className="text-small">
                    Password:{" "}
                    <span className="font-mono font-bold text-warning">
                      {item.password}
                    </span>
                  </p>
                </div>
              ))}
            </div>
          );
        })()}

      {resetResult && (
        <div className="bg-warning-bg border border-warning rounded-sm p-4">
          <p className="text-small font-bold text-warning">
            🔑 New Password — Save This
          </p>
          <p className="text-small">
            <strong>{resetResult.name}</strong>
          </p>
          <p className="text-small">Email: {resetResult.email}</p>
          <p className="text-small font-mono text-warning font-bold mt-1">
            Password: {resetResult.password}
          </p>
        </div>
      )}

      <Card variant="bordered" className="shadow-sm">
        <details>
          <summary className="text-small font-semibold text-text-secondary p-3 cursor-pointer">
            Bulk Add Students
          </summary>
          <div className="p-3 space-y-3">
            <select
              value={bulkClassId}
              onChange={(e) => setBulkClassId(e.target.value)}
              className="w-full px-4 py-2 bg-surface border border-border-strong rounded-sm text-body"
            >
              <option value="">-- Select Class --</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {bulkClassId ? (
              <SpreadsheetImporter
                expectedColumns={[
                  { key: "last_name", label: "Last Name", required: true },
                  { key: "first_name", label: "First Name", required: true },
                  { key: "gender", label: "Gender", required: false },
                  {
                    key: "date_of_birth",
                    label: "Date of Birth",
                    required: false,
                  },
                ]}
                onImport={handleImport}
                isImporting={importing}
              />
            ) : (
              <p className="text-small text-text-muted p-3">
                Select a class above before importing.
              </p>
            )}
          </div>
        </details>
      </Card>

      <Card variant="bordered" className="shadow-sm">
        <div className="grid gap-2">
          {items.map((s) => (
            <div
              key={s.id}
              className="flex justify-between items-center p-3 bg-bg rounded-sm"
            >
              <div>
                <p className="font-semibold">{s.profiles?.full_name}</p>
                <p className="text-caption text-text-muted">{s.student_id}</p>
              </div>
              <div className="flex gap-2 items-center">
                <Button variant="ghost" size="sm" onClick={() => openEdit(s)}>
                  Edit
                </Button>
                <Button
                  variant="warning"
                  size="sm"
                  loading={resettingId === s.profile_id}
                  onClick={() =>
                    handleResetPassword(
                      s.profile_id,
                      s.profiles?.full_name || s.student_id,
                      s.profiles?.email || "",
                    )
                  }
                >
                  Reset Password
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
