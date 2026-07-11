"use client";
import { useEffect, useState } from "react";
import { Button, Input, Card } from "@/components/ui";
import { SpreadsheetImporter } from "@/components/ui/SpreadsheetImporter";

export default function TeachersPage() {
  const [items, setItems] = useState<any[]>([]);
  const [show, setShow] = useState(false);
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [qualification, setQualification] = useState("");
  const [created, setCreated] = useState<any>(null);
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
    fetch("/api/school-admin/teachers")
      .then((r) => r.json())
      .then((d) => setItems(Array.isArray(d) ? d : []));
  useEffect(() => {
    load();
    fetch("/api/school-admin/school")
      .then((r) => r.json())
      .then((d) => {
        if (d?.name) setSchool(d);
      });
  }, []);

  const reset = () => {
    setFirst("");
    setLast("");
    setEmail("");
    setPhone("");
    setQualification("");
    setEditId(null);
  };
  const openAdd = () => {
    reset();
    setShow(true);
  };
  const openEdit = (t: any) => {
    setEditId(t.id);
    setFirst(t.profiles?.full_name?.split(" ")[0] || "");
    setLast(t.profiles?.full_name?.split(" ").slice(1).join(" ") || "");
    setEmail(t.profiles?.email || "");
    setPhone(t.phone || "");
    setQualification(t.qualification || "");
    setShow(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    const method = editId ? "PUT" : "POST";
    const body: Record<string, unknown> = {
      first_name: first,
      last_name: last,
      phone,
      qualification,
    };
    if (!editId) body.email = email;
    if (editId) body.id = editId;
    const r = await fetch("/api/school-admin/teachers", {
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
        text: editId ? "Teacher updated" : "Teacher created",
      });
      load();
    } else {
      setMsg({ type: "error", text: d.error });
    }
  };

  const handleImport = async (data: any[]) => {
    setImporting(true);
    const results: any[] = [];
    const errors: string[] = [];
    for (const r of data) {
      const res = await fetch("/api/school-admin/teachers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: r.first_name,
          last_name: r.last_name,
          email: r.email,
          phone: r.phone,
          qualification: r.qualification,
        }),
      });
      const d = await res.json();
      if (res.ok) results.push(d);
      else if (res.status === 409) errors.push(`Skipped: ${r.email}`);
      else errors.push(`Failed: ${d.error}`);
    }
    setImporting(false);
    load();
    setMsg({
      type: results.length > 0 ? "success" : "error",
      text: `${results.length} created${errors.length > 0 ? `, ${errors.length} skipped/failed` : ""}`,
    });
    if (results.length > 0) setCreated({ results, count: results.length });
  };

  const handleResetPassword = async (
    profileId: string,
    teacherName: string,
    teacherEmail: string,
  ) => {
    setResettingId(profileId);
    setMsg(null);
    setResetResult(null);
    try {
      const res = await fetch("/api/school-admin/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile_id: profileId, role: "teacher" }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Reset failed");
      setResetResult({
        name: teacherName,
        email: teacherEmail,
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
        <h1 className="text-h1 font-bold">Teachers</h1>
        <Button onClick={openAdd}>Add Teacher</Button>
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
                Editing teacher — Save to apply changes
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
            {!editId && (
              <Input
                label="Email (Optional)"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            )}
            <Input
              label="Phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <Input
              label="Qualification"
              value={qualification}
              onChange={(e) => setQualification(e.target.value)}
              placeholder="e.g. B.Sc Education"
            />
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
                  name: r.profiles?.full_name || r.email,
                  email: r.email,
                  password: r.password,
                }))
              : [
                  {
                    name: created.profiles?.full_name || created.email,
                    email: created.email,
                    password: created.password,
                  },
                ];
          return (
            <div className="bg-warning-bg border border-warning rounded-sm p-5 space-y-3">
              <p className="text-small font-bold text-warning">
                Save credentials — shown once only
                {created.count ? ` (${created.count} teachers)` : ""}
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
            Bulk Add Teachers
          </summary>
          <div className="p-3">
            <SpreadsheetImporter
              expectedColumns={[
                { key: "last_name", label: "Last Name", required: true },
                { key: "first_name", label: "First Name", required: true },
                { key: "email", label: "Email", required: false },
                { key: "phone", label: "Phone", required: false },
                {
                  key: "qualification",
                  label: "Qualification",
                  required: false,
                },
              ]}
              onImport={handleImport}
              isImporting={importing}
            />
          </div>
        </details>
      </Card>

      <Card variant="bordered" className="shadow-sm">
        <div className="grid gap-2">
          {items.map((t) => (
            <div
              key={t.id}
              className="flex justify-between items-center p-3 bg-bg rounded-sm"
            >
              <div>
                <p className="font-semibold">
                  {t.profiles?.full_name || t.employee_id}
                </p>
                <p className="text-caption text-text-muted">
                  {t.profiles?.email}
                </p>
              </div>
              <div className="flex gap-2 items-center">
                <Button variant="ghost" size="sm" onClick={() => openEdit(t)}>
                  Edit
                </Button>
                <Button
                  variant="warning"
                  size="sm"
                  loading={resettingId === t.profile_id}
                  onClick={() =>
                    handleResetPassword(
                      t.profile_id,
                      t.profiles?.full_name || t.employee_id,
                      t.profiles?.email || "",
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
