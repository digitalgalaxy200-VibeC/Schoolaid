"use client";
import { useEffect, useState, useCallback } from "react";
import { Button, Input, Card } from "@/components/ui";
import { Table } from "@/components/ui/Table";
import { Modal } from "@/components/ui/Modal";
import { SpreadsheetImporter } from "@/components/ui/SpreadsheetImporter";

const PAGE_SIZE = 25;

export default function StudentsPage() {
  // Data
  const [items, setItems] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [school, setSchool] = useState<{ name: string; slug: string } | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [filterClass, setFilterClass] = useState("");
  const [viewMode, setViewMode] = useState<"active" | "archived">("active");
  const [page, setPage] = useState(1);

  // Form state
  const [show, setShow] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [studentId, setStudentId] = useState("");
  const [classId, setClassId] = useState("");
  const [gender, setGender] = useState("");
  const [dob, setDob] = useState("");
  const [parentPhone, setParentPhone] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Bulk import
  const [bulkClassId, setBulkClassId] = useState("");
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
    if (filterClass) params.set("class_id", filterClass);

    fetch(`/api/school-admin/students?${params}`)
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
  }, [viewMode, page, search, filterClass]);

  useEffect(() => {
    fetch("/api/school-admin/classes")
      .then((r) => r.json())
      .then((d) => setClasses(Array.isArray(d) ? d : []));
    fetch("/api/school-admin/school")
      .then((r) => r.json())
      .then((d) => { if (d?.name) setSchool(d); });
  }, []);

  useEffect(() => {
    setPage(1);
  }, [search, filterClass, viewMode]);

  useEffect(() => {
    load();
  }, [load]);

  const resetForm = () => {
    setFirst(""); setLast(""); setClassId("");
    setGender(""); setDob(""); setParentPhone(""); setStudentId("");
    setAvatarFile(null); setAvatarPreview(null); setEditId(null); setRecoveryEmail("");
  };

  const openAdd = () => { resetForm(); setShow(true); };
  const openEdit = (s: any) => {
    setEditId(s.id);
    setFirst(s.profiles?.full_name?.split(" ")[0] || "");
    setLast(s.profiles?.full_name?.split(" ").slice(1).join(" ") || "");
    setClassId(s.class_id || "");
    setGender(s.gender || "");
    setDob(s.date_of_birth ? new Date(s.date_of_birth).toISOString().split("T")[0] : "");
    setParentPhone(s.parent_phone || "");
    setStudentId(s.student_id || "");
    setAvatarPreview(s.profiles?.avatar_url || null);
    setRecoveryEmail(s.profiles?.recovery_email || "");
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
      student_id: studentId, class_id: classId,
      gender, date_of_birth: dob, parent_phone: parentPhone,
    };
    if (editId) body.id = editId;
    if (avatarUrl) body.avatar_url = avatarUrl;

    const r = await fetch("/api/school-admin/students", {
      method, headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setIsSubmitting(false);
    const d = await r.json();
    if (r.ok) {
      if (!editId) setCreated(d);
      setShow(false); resetForm();
      setMsg({ type: "success", text: editId ? "Student updated" : "Student created" });
      load();
    } else {
      setMsg({ type: "error", text: d.error });
    }
  };

  const handleArchive = async (s: any, isActive: boolean) => {
    setArchivingId(s.id);
    const r = await fetch("/api/school-admin/students", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: s.id, is_active: isActive }),
    });
    setArchivingId(null);
    if (r.ok) {
      setMsg({ type: "success", text: isActive ? "Student restored to active" : "Student archived" });
      load();
    } else {
      const d = await r.json();
      setMsg({ type: "error", text: d.error });
    }
  };

  const handleImport = async (data: any[]) => {
    if (!bulkClassId) { setMsg({ type: "error", text: "Please select a class first." }); return; }
    setImporting(true);
    let c = 0; const errors: string[] = []; const results: any[] = [];
    for (const r of data) {
      const res = await fetch("/api/school-admin/students", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: r.first_name, last_name: r.last_name,
          class_id: bulkClassId, gender: r.gender, date_of_birth: r.date_of_birth,
        }),
      });
      const d = await res.json();
      if (res.ok) { c++; results.push(d); }
      else if (res.status === 409) errors.push(`Skipped: ${r.first_name} ${r.last_name}`);
      else errors.push(`Failed: ${d.error}`);
    }
    setImporting(false); load();
    setMsg({ type: c > 0 ? "success" : "error", text: `${c} created${errors.length > 0 ? `, ${errors.length} skipped/failed` : ""}` });
    if (results.length > 0) setCreated({ results, count: results.length });
  };

  const handleResetPassword = async (profileId: string, name: string, email: string) => {
    setResettingId(profileId); setMsg(null); setResetResult(null);
    try {
      const res = await fetch("/api/school-admin/reset-password", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile_id: profileId, role: "student" }),
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
        <h1 className="text-h1 font-bold">Students</h1>
        <div className="flex gap-2">
          <Button
            variant={viewMode === "active" ? "primary" : "ghost"}
            size="sm"
            onClick={() => setViewMode("active")}
          >
            Active
          </Button>
          <Button
            variant={viewMode === "archived" ? "danger" : "ghost"}
            size="sm"
            onClick={() => setViewMode("archived")}
          >
            Archived
          </Button>
          <Button onClick={openAdd}>+ Add Student</Button>
        </div>
      </div>

      {/* Feedback */}
      {msg && (
        <div className={`px-4 py-3 rounded-sm text-small font-medium ${msg.type === "success" ? "bg-success-bg text-success border border-success" : "bg-error-bg text-error border border-error"}`}>
          {msg.text}
        </div>
      )}

      {/* Add / Edit Modal */}
      <Modal isOpen={show} onClose={() => { setShow(false); resetForm(); }} title={editId ? "Edit Student" : "Add Student"} size="lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Avatar upload */}
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-primary/10 text-primary flex items-center justify-center overflow-hidden border-2 border-border flex-shrink-0">
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
                className="text-sm text-text-muted file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:bg-primary file:text-white file:text-sm file:cursor-pointer cursor-pointer"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input label="First Name" value={first} onChange={(e) => setFirst(e.target.value)} />
            <Input label="Last Name" value={last} onChange={(e) => setLast(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-small font-semibold text-text-secondary mb-2">Class</label>
              <select value={classId} onChange={(e) => setClassId(e.target.value)} className={selectClass}>
                <option value="">— Not Assigned —</option>
                {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <Input label="Parent / Guardian Phone" type="tel" value={parentPhone} onChange={(e) => setParentPhone(e.target.value)} placeholder="+234 800 000 0000" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input label="Date of Birth" type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
            <div className="space-y-1">
              <label className="text-small font-semibold text-text-secondary">Gender</label>
              <select className={selectClass} value={gender} onChange={(e) => setGender(e.target.value)}>
                <option value="">Select Gender</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
              </select>
            </div>
          </div>

          {!editId && (
            <div className="grid grid-cols-2 gap-4">
              <Input label="Admission Number" value={studentId} onChange={(e) => setStudentId(e.target.value)} placeholder="Auto-generated if blank" />
              <Input label="Recovery Email (Optional)" type="email" value={recoveryEmail} onChange={(e) => setRecoveryEmail(e.target.value)} placeholder="For password resets" />
            </div>
          )}
          
          {editId && (
            <div className="grid grid-cols-2 gap-4">
              <Input label="Admission Number" value={studentId} onChange={(e) => setStudentId(e.target.value)} />
              <Input label="Recovery Email (Optional)" type="email" value={recoveryEmail} onChange={(e) => setRecoveryEmail(e.target.value)} placeholder="For password resets" />
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <Button type="submit" loading={isSubmitting}>{editId ? "Save Changes" : "Create Student"}</Button>
            <Button variant="ghost" onClick={() => { setShow(false); resetForm(); }} disabled={isSubmitting}>Cancel</Button>
          </div>
        </form>
      </Modal>

      {/* New credentials display */}
      {created && (() => {
        const baseUrl = typeof window !== "undefined" ? `${window.location.protocol}//${window.location.host}` : "";
        const loginUrl = school?.slug ? `${baseUrl}/school/${school.slug}/login` : `${baseUrl}/login`;
        const creds: { name: string; email: string; password: string }[] = created.results
          ? created.results.map((r: any) => ({ name: r.profiles?.full_name || "", email: r.email, password: r.password }))
          : [{ name: created.profiles?.full_name || "", email: created.email, password: created.password }];
        return (
          <div className="bg-warning-bg border border-warning rounded-sm p-5 space-y-3">
            <p className="text-small font-bold text-warning">Save credentials — shown once only{created.count ? ` (${created.count} students)` : ""}</p>
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

      {/* Search & Filters */}
      <Card variant="bordered" className="shadow-sm">
        <div className="flex flex-wrap gap-3 items-end p-1">
          <div className="flex-1 min-w-48">
            <Input
              label="Search Students"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Type a name to filter…"
            />
          </div>
          <div className="min-w-40">
            <label className="block text-small font-semibold text-text-secondary mb-2">Filter by Class</label>
            <select value={filterClass} onChange={(e) => setFilterClass(e.target.value)} className={selectClass}>
              <option value="">All Classes</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          {(search || filterClass) && (
            <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setFilterClass(""); }}>
              Clear Filters
            </Button>
          )}
        </div>
      </Card>

      {/* Bulk Import */}
      <Card variant="bordered" className="shadow-sm">
        <details>
          <summary className="text-small font-semibold text-text-secondary p-3 cursor-pointer">Bulk Add Students</summary>
          <div className="p-3 space-y-3">
            <select value={bulkClassId} onChange={(e) => setBulkClassId(e.target.value)} className={`${selectClass} max-w-xs`}>
              <option value="">-- Select Class --</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            {bulkClassId ? (
              <SpreadsheetImporter
                expectedColumns={[
                  { key: "last_name", label: "Last Name", required: true },
                  { key: "first_name", label: "First Name", required: true },
                  { key: "gender", label: "Gender", required: false },
                  { key: "date_of_birth", label: "Date of Birth", required: false },
                ]}
                onImport={handleImport}
                isImporting={importing}
              />
            ) : (
              <p className="text-small text-text-muted p-3">Select a class above before importing.</p>
            )}
          </div>
        </details>
      </Card>

      {/* Table */}
      <Card variant="bordered" className="shadow-sm">
        <Table
          columns={[
            {
              key: "student",
              header: "Student",
              render: (s: any) => (
                <div className="flex items-center gap-3">
                  {s.profiles?.avatar_url
                    ? <img src={s.profiles.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover border border-border" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                    : <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs">{(s.profiles?.full_name || "?").charAt(0).toUpperCase()}</div>
                  }
                  <div>
                    <p className="font-semibold">{s.profiles?.full_name}</p>
                    <p className="text-xs text-text-muted font-mono">{s.profiles?.email}</p>
                    {s.profiles?.recovery_email && (
                      <p className="text-[10px] text-success">✉ {s.profiles.recovery_email}</p>
                    )}
                  </div>
                </div>
              )
            },
            {
              key: "details",
              header: "Class / Details",
              render: (s: any) => (
                <div>
                  <p className="text-sm font-medium">{s.classes?.name || "—"}</p>
                  <p className="text-xs text-text-muted">
                    {s.student_id ? `ID: ${s.student_id}` : "—"}
                    {s.gender ? ` · ${s.gender}` : ""}
                  </p>
                </div>
              )
            },
            {
              key: "contact",
              header: "Parent Contact",
              render: (s: any) => <span className="text-sm">{s.parent_phone || "—"}</span>
            },
            {
              key: "actions",
              header: "Actions",
              render: (s: any) => (
                <div className="flex flex-wrap gap-1.5 items-center">
                  <Button variant="ghost" size="sm" onClick={() => openEdit(s)}>Edit</Button>
                  {viewMode === "active"
                    ? <Button variant="danger" size="sm" loading={archivingId === s.id} onClick={() => handleArchive(s, false)}>Archive</Button>
                    : <Button variant="secondary" size="sm" loading={archivingId === s.id} onClick={() => handleArchive(s, true)}>Restore</Button>
                  }
                  <Button variant="warning" size="sm" loading={resettingId === s.profile_id} onClick={() => handleResetPassword(s.profile_id, s.profiles?.full_name || s.student_id, s.profiles?.email || "")}>
                    Reset Password
                  </Button>
                </div>
              )
            }
          ]}
          data={items}
          keyExtractor={(s) => s.id}
          emptyMessage={viewMode === "archived" ? "No archived students." : "No students found. Try a different filter or add one."}
        />
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-small text-text-muted">
            Showing {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, total)} of {total} students
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>← Prev</Button>
            <span className="text-small text-text-secondary px-3 py-1.5 border border-border rounded-sm">
              Page {page} of {totalPages}
            </span>
            <Button variant="ghost" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>Next →</Button>
          </div>
        </div>
      )}
    </div>
  );
}
