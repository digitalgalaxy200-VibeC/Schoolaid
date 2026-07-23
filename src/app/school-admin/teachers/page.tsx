"use client";
import { useEffect, useState, useCallback } from "react";
import { Button, Input, Card } from "@/components/ui";
import { Table } from "@/components/ui/Table";
import { Modal } from "@/components/ui/Modal";
import { SpreadsheetImporter } from "@/components/ui/SpreadsheetImporter";
import { TeacherProfileModal } from "./TeacherProfileModal";

const PAGE_SIZE = 25;

async function downloadAsPDF(url: string, filename: string) {
  try {
    const res = await fetch(url);
    const html = await res.text();
    const blob = new Blob([html], { type: "text/html" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  } catch (e) {
    window.open(url, "_blank");
  }
}

export default function TeachersPage() {
  // Data
  const [items, setItems] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [school, setSchool] = useState<{ name: string; slug: string } | null>(null);
  const [activeTeacher, setActiveTeacher] = useState<any>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<"active" | "archived">("active");
  const [page, setPage] = useState(1);

  // Form state
  const [show, setShow] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [qualification, setQualification] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [specialization, setSpecialization] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Bulk import
  const [importing, setImporting] = useState(false);

  // Feedback
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [created, setCreated] = useState<any>(null);
  const [resetResult, setResetResult] = useState<{ name: string; email: string; password: string } | null>(null);
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [archivingId, setArchivingId] = useState<string | null>(null);

  const load = useCallback(() => {
    const params = new URLSearchParams({
      status: viewMode,
      page: String(page),
      limit: String(PAGE_SIZE),
    });
    if (search) params.set("search", search);

    fetch(`/api/school-admin/teachers?${params}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.data) {
          setItems(d.data);
          setTotal(d.total);
          setTotalPages(d.totalPages || 1);
        } else {
          setItems(Array.isArray(d) ? d : []);
        }
      });
  }, [viewMode, page, search]);

  useEffect(() => {
    load();
    fetch("/api/school-admin/school")
      .then((r) => r.json())
      .then((d) => { if (d?.name) setSchool(d); });
  }, []);

  useEffect(() => {
    setPage(1);
  }, [search, viewMode]);

  useEffect(() => {
    load();
  }, [load]);

  const resetForm = () => {
    setFirst(""); setLast(""); setEmail(""); setPhone("");
    setQualification(""); setEmployeeId(""); setSpecialization("");
    setAvatarFile(null); setAvatarPreview(null); setEditId(null); setRecoveryEmail("");
  };

  const openAdd = () => { resetForm(); setShow(true); };
  const openEdit = (t: any) => {
    setEditId(t.id);
    setFirst(t.profiles?.full_name?.split(" ")[0] || "");
    setLast(t.profiles?.full_name?.split(" ").slice(1).join(" ") || "");
    setEmail(t.profiles?.email || "");
    setPhone(t.profiles?.phone || "");
    setQualification(t.qualification || "");
    setEmployeeId(t.employee_id || "");
    setSpecialization(t.specialization || "");
    setAvatarPreview(t.profiles?.avatar_url || null);
    setRecoveryEmail(t.profiles?.recovery_email || "");
    setAvatarFile(null);
    setShow(true);
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setMsg(null);

    let avatarUrl: string | undefined;
    if (avatarFile) {
      const formData = new FormData();
      formData.append("file", avatarFile);
      const upRes = await fetch("/api/school-admin/upload-avatar", {
        method: "POST", body: formData,
      });
      if (upRes.ok) {
        const upData = await upRes.json();
        avatarUrl = upData.url;
      }
    }

    const method = editId ? "PUT" : "POST";
    const body: Record<string, unknown> = {
      first_name: first, last_name: last,
      phone, qualification, employee_id: employeeId, specialization, recovery_email: recoveryEmail
    };
    if (!editId) body.email = email;
    if (editId) body.id = editId;
    if (avatarUrl) body.avatar_url = avatarUrl;

    const r = await fetch("/api/school-admin/teachers", {
      method, headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setIsSubmitting(false);
    const d = await r.json();
    if (r.ok) {
      if (!editId) setCreated(d);
      setShow(false); resetForm();
      setMsg({ type: "success", text: editId ? "Teacher updated" : "Teacher created" });
      load();
    } else {
      setMsg({ type: "error", text: d.error });
    }
  };

  const handleArchive = async (t: any, isActive: boolean) => {
    setArchivingId(t.id);
    const r = await fetch("/api/school-admin/teachers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: t.id, is_active: isActive }),
    });
    setArchivingId(null);
    if (r.ok) {
      setMsg({ type: "success", text: isActive ? "Teacher restored to active" : "Teacher archived" });
      load();
    } else {
      const d = await r.json();
      setMsg({ type: "error", text: d.error });
    }
  };

  const handleImport = async (data: any[]) => {
    setImporting(true);
    const results: any[] = []; const errors: string[] = [];
    for (const r of data) {
      const res = await fetch("/api/school-admin/teachers", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ first_name: r.first_name, last_name: r.last_name, email: r.email, phone: r.phone, qualification: r.qualification }),
      });
      const d = await res.json();
      if (res.ok) results.push(d);
      else if (res.status === 409) errors.push(`Skipped: ${r.email}`);
      else errors.push(`Failed: ${d.error}`);
    }
    setImporting(false); load();
    setMsg({ type: results.length > 0 ? "success" : "error", text: `${results.length} created${errors.length > 0 ? `, ${errors.length} skipped/failed` : ""}` });
    if (results.length > 0) setCreated({ results, count: results.length });
  };

  const handleResetPassword = async (profileId: string, name: string, email: string) => {
    setResettingId(profileId); setMsg(null); setResetResult(null);
    try {
      const res = await fetch("/api/school-admin/reset-password", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile_id: profileId, role: "teacher" }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Reset failed");
      setResetResult({ name, email, password: d.password });
      setMsg({ type: "success", text: "Password reset" });
    } catch (err: any) { setMsg({ type: "error", text: err.message }); }
    finally { setResettingId(null); }
  };

  const selectClass = "w-full px-4 py-2.5 bg-surface border border-border-strong rounded-sm text-body";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <h1 className="text-h1 font-bold">Teachers</h1>
        <div className="flex gap-2">
          <Button variant={viewMode === "active" ? "primary" : "ghost"} size="sm" onClick={() => setViewMode("active")}>Active</Button>
          <Button variant={viewMode === "archived" ? "danger" : "ghost"} size="sm" onClick={() => setViewMode("archived")}>Archived</Button>
          <Button onClick={openAdd}>+ Add Teacher</Button>
          <Button variant="secondary" onClick={() => downloadAsPDF("/api/school-admin/teachers/credentials", "teacher-credentials.html")}>Download Credentials</Button>
        </div>
      </div>

      {/* Feedback */}
      {msg && (
        <div className={`px-4 py-3 rounded-sm text-small font-medium ${msg.type === "success" ? "bg-success-bg text-success border border-success" : "bg-error-bg text-error border border-error"}`}>
          {msg.text}
        </div>
      )}

      {/* Add / Edit Modal */}
      <Modal isOpen={show} onClose={() => { setShow(false); resetForm(); }} title={editId ? "Edit Teacher" : "Add Teacher"} size="lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Avatar upload */}
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-accent/10 text-accent flex items-center justify-center overflow-hidden border-2 border-border flex-shrink-0">
              {avatarPreview
                ? <img src={avatarPreview} alt="preview" className="w-full h-full object-cover" />
                : <span className="text-2xl font-bold">{(first || "?").charAt(0).toUpperCase()}</span>
              }
            </div>
            <div>
              <label className="block text-small font-semibold text-text-secondary mb-1">Profile Photo</label>
              <input
                type="file"
                accept="image/*"
                onChange={handleAvatarChange}
                className="text-sm text-text-muted file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:bg-accent file:text-white file:text-sm file:cursor-pointer cursor-pointer"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input label="First Name" value={first} onChange={(e) => setFirst(e.target.value)} />
            <Input label="Last Name" value={last} onChange={(e) => setLast(e.target.value)} />
          </div>

          {/* Username is always auto-generated; show readonly info when editing */}
          {editId ? (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-small font-semibold text-text-secondary mb-1.5">Username (Login)</label>
                <div className="px-4 py-2.5 bg-black/5 border border-border rounded-sm font-mono text-sm text-text-muted">{email || "—"}</div>
              </div>
              <Input label="Recovery Email (Optional)" type="email" value={recoveryEmail} onChange={(e) => setRecoveryEmail(e.target.value)} placeholder="Real email for password resets" />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-small font-semibold text-text-secondary mb-1.5">Username (Login)</label>
                <div className="px-4 py-2.5 bg-black/5 border border-border rounded-sm text-sm text-text-muted italic">Auto-generated from name + school</div>
              </div>
              <Input label="Recovery Email (Optional)" type="email" value={recoveryEmail} onChange={(e) => setRecoveryEmail(e.target.value)} placeholder="Real email for password resets" />
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <Input label="Employee ID / Staff Number" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} placeholder="Auto-generated if blank" readOnly={!!editId} />
            <Input label="Phone Number" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+234 800 000 0000" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input label="Qualification" value={qualification} onChange={(e) => setQualification(e.target.value)} placeholder="e.g. B.Sc Education" />
            <Input label="Specialization / Subject Area" value={specialization} onChange={(e) => setSpecialization(e.target.value)} placeholder="e.g. Mathematics" />
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="submit" loading={isSubmitting}>{editId ? "Save Changes" : "Create Teacher"}</Button>
            <Button variant="ghost" onClick={() => { setShow(false); resetForm(); }} disabled={isSubmitting}>Cancel</Button>
          </div>
        </form>
      </Modal>

      {/* New credentials */}
      {created && (() => {
        const baseUrl = typeof window !== "undefined" ? `${window.location.protocol}//${window.location.host}` : "";
        const loginUrl = school?.slug ? `${baseUrl}/school/${school.slug}/login` : `${baseUrl}/login`;
        const creds: { name: string; email: string; password: string }[] = created.results
          ? created.results.map((r: any) => ({ name: r.profiles?.full_name || r.email, email: r.email, password: r.password }))
          : [{ name: created.profiles?.full_name || created.email, email: created.email, password: created.password }];
        return (
          <div className="bg-warning-bg border border-warning rounded-sm p-5 space-y-3">
            <p className="text-small font-bold text-warning">Save credentials — shown once only{created.count ? ` (${created.count} teachers)` : ""}</p>
            <p className="text-xs text-text-muted">Login URL: <a href={loginUrl} className="underline">{loginUrl}</a></p>
            {creds.map((item, i) => (
              <div key={i} className="border border-warning/40 bg-white rounded-sm p-3">
                {item.name && <p className="text-small font-semibold">👤 {item.name}</p>}
                <p className="text-small">Username: <span className="font-mono">{item.email}</span></p>
                <p className="text-small">Password: <span className="font-mono font-bold text-warning">{item.password}</span></p>
              </div>
            ))}
          </div>
        );
      })()}

      {resetResult && (
        <div className="bg-warning-bg border border-warning rounded-sm p-4">
          <p className="text-small font-bold text-warning">🔑 New Password — Save This</p>
          <p className="text-small"><strong>{resetResult.name}</strong></p>
          <p className="text-small">Username: <span className="font-mono">{resetResult.email}</span></p>
          <p className="text-small font-mono text-warning font-bold mt-1">Password: {resetResult.password}</p>
        </div>
      )}

      {/* Search */}
      <Card variant="bordered" className="shadow-sm">
        <div className="flex flex-wrap gap-3 items-end p-1">
          <div className="flex-1 min-w-48">
            <Input
              label="Search Teachers"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, ID or specialization…"
            />
          </div>
          {search && (
            <Button variant="ghost" size="sm" onClick={() => setSearch("")}>Clear</Button>
          )}
        </div>
      </Card>

      {/* Bulk Import */}
      <Card variant="bordered" className="shadow-sm">
        <details>
          <summary className="text-small font-semibold text-text-secondary p-3 cursor-pointer">Bulk Add Teachers</summary>
          <div className="p-3">
            <SpreadsheetImporter
              expectedColumns={[
                { key: "last_name", label: "Last Name", required: true },
                { key: "first_name", label: "First Name", required: true },
                { key: "email", label: "Email", required: false },
                { key: "phone", label: "Phone", required: false },
                { key: "qualification", label: "Qualification", required: false },
              ]}
              onImport={handleImport}
              isImporting={importing}
            />
          </div>
        </details>
      </Card>

      {/* Table */}
      <Card variant="bordered" className="shadow-sm">
        <Table
          columns={[
            {
              key: "sn",
              header: "S/N",
              className: "w-16 text-center",
              render: (_, index) => (
                <span className="text-text-muted text-small">
                  {(page - 1) * PAGE_SIZE + index + 1}
                </span>
              )
            },
            {
              key: "teacher",
              header: "Teacher",
              render: (t: any) => (
                <div className="flex items-center gap-3">
                  {t.profiles?.avatar_url
                    ? <img src={t.profiles.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover border border-border" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                    : <div className="w-8 h-8 rounded-full bg-accent/10 text-accent flex items-center justify-center font-bold text-xs">{(t.profiles?.full_name || "?").charAt(0).toUpperCase()}</div>
                  }
                  <div>
                    <p className="font-semibold">{t.profiles?.full_name || t.employee_id}</p>
                    <p className="text-xs text-text-muted font-mono">{t.profiles?.email}</p>
                    {t.profiles?.recovery_email && (
                      <p className="text-[10px] text-success">✉ {t.profiles.recovery_email}</p>
                    )}
                  </div>
                </div>
              )
            },
            {
              key: "details",
              header: "Details",
              render: (t: any) => (
                <div>
                  <p className="text-sm">{t.specialization || "—"}</p>
                  <p className="text-xs text-text-muted">{t.qualification || ""}{t.employee_id ? ` · ID: ${t.employee_id}` : ""}</p>
                </div>
              )
            },
            {
              key: "contact",
              header: "Phone",
              render: (t: any) => <span className="text-sm">{t.profiles?.phone || "—"}</span>
            },
            {
              key: "actions",
              header: "Actions",
              render: (t: any) => (
                <div className="flex flex-wrap gap-1.5 items-center">
                  <Button variant="secondary" size="sm" onClick={() => setActiveTeacher(t)}>View Profile</Button>
                  <Button variant="ghost" size="sm" onClick={() => openEdit(t)}>Edit</Button>
                  {viewMode === "active"
                    ? <Button variant="danger" size="sm" loading={archivingId === t.id} onClick={() => handleArchive(t, false)}>Archive</Button>
                    : <Button variant="secondary" size="sm" loading={archivingId === t.id} onClick={() => handleArchive(t, true)}>Restore</Button>
                  }
                  <Button variant="warning" size="sm" loading={resettingId === t.profile_id} onClick={() => handleResetPassword(t.profile_id, t.profiles?.full_name || t.employee_id, t.profiles?.email || "")}>
                    Reset Password
                  </Button>
                </div>
              )
            }
          ]}
          data={items}
          keyExtractor={(t) => t.id}
          emptyMessage={viewMode === "archived" ? "No archived teachers." : "No teachers found."}
        />
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-small text-text-muted">
            Showing {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, total)} of {total} teachers
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>← Prev</Button>
            <span className="text-small text-text-secondary px-3 py-1.5 border border-border rounded-sm">Page {page} of {totalPages}</span>
            <Button variant="ghost" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>Next →</Button>
          </div>
        </div>
      )}

      {activeTeacher && (
        <TeacherProfileModal
          teacherId={activeTeacher.id}
          teacherName={activeTeacher.profiles?.full_name || activeTeacher.employee_id}
          onClose={() => setActiveTeacher(null)}
        />
      )}
    </div>
  );
}
