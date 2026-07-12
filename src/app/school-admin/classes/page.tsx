"use client";
import { useEffect, useState } from "react";
import { Button, Input, Card } from "@/components/ui";
import { Modal } from "@/components/ui/Modal";
import { SpreadsheetImporter } from "@/components/ui/SpreadsheetImporter";
import { ClassAssignmentsModal } from "./ClassAssignmentsModal";

const GRADE_LEVELS = ["Play school", "Nursery", "Primary", "Secondary"];

export default function ClassesPage() {
  const [items, setItems] = useState<any[]>([]);
  const [show, setShow] = useState(false);
  const [activeClass, setActiveClass] = useState<any>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [grade, setGrade] = useState("");
  const [bulkText, setBulkText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [msg, setMsg] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const load = () =>
    fetch("/api/school-admin/classes")
      .then((r) => r.json())
      .then((d) => setItems(Array.isArray(d) ? d : []))
      .catch(() => setItems([]));
  useEffect(() => {
    load();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    if (editId) {
      const r = await fetch(`/api/school-admin/classes`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editId, name, grade_level: grade }),
      });
      setIsSubmitting(false);
      if (r.ok) {
        setMsg({ type: "success", text: "Updated" });
        reset();
        load();
      } else {
        const d = await r.json();
        setMsg({ type: "error", text: d.error });
      }
    } else {
      const r = await fetch("/api/school-admin/classes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, grade_level: grade }),
      });
      setIsSubmitting(false);
      if (r.ok) {
        setMsg({ type: "success", text: "Created" });
        reset();
        load();
      } else {
        const d = await r.json();
        setMsg({ type: "error", text: d.error });
      }
    }
  };

  const [importing, setImporting] = useState(false);

  const handleImport = async (data: any[]) => {
    setImporting(true);
    let created = 0;
    const errors: string[] = [];

    for (const r of data) {
      const res = await fetch("/api/school-admin/classes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: r.name,
          grade_level: r.grade_level || "",
        }),
      });
      const d = await res.json();
      if (res.ok) {
        created++;
      } else if (res.status === 409) {
        errors.push(`Skipped (duplicate): ${r.name}`);
      } else {
        errors.push(`Failed for ${r.name}: ${d.error}`);
      }
    }
    setImporting(false);
    load();
    const summary = `${created} classes created${
      errors.length > 0 ? `, ${errors.length} skipped/failed` : ""
    }`;
    setMsg({ type: created > 0 ? "success" : "error", text: summary });
  };

  const startEdit = (c: any) => {
    setEditId(c.id);
    setName(c.name);
    setGrade(c.grade_level || "");
    setShow(true);
  };
  const reset = () => {
    setShow(false);
    setEditId(null);
    setName("");
    setGrade("");
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between">
        <h1 className="text-h1 font-bold">Classes</h1>
        <Button
          onClick={() => {
            reset();
            setShow(true);
          }}
        >
          Add Class
        </Button>
      </div>
      {msg && (
        <div
          className={`px-4 py-3 rounded-sm text-small font-medium ${msg.type === "success" ? "bg-success-bg text-success border border-success" : "bg-error-bg text-error border border-error"}`}
        >
          {msg.text}
        </div>
      )}
      <Modal
        isOpen={show}
        onClose={reset}
        title={editId ? "Edit Class" : "Add Class"}
      >
        <form onSubmit={submit} className="space-y-4">
          <Input
            label="Class Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="JSS 1"
            required
          />
          <div>
            <label className="block text-small font-semibold text-text-secondary mb-2">
              Grade Level
            </label>
            <select
              value={grade}
              onChange={(e) => setGrade(e.target.value)}
              className="w-full px-4 py-2.5 bg-surface border border-border-strong rounded-sm text-body"
            >
              <option value="">Select grade level</option>
              {GRADE_LEVELS.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-3 pt-4">
            <Button type="submit" loading={isSubmitting}>
              {editId ? "Update" : "Create"}
            </Button>
            <Button variant="ghost" onClick={reset} disabled={isSubmitting}>
              Cancel
            </Button>
          </div>
        </form>
      </Modal>

      {/* Bulk create */}
      <Card variant="bordered" className="shadow-sm">
        <details className="cursor-pointer">
          <summary className="text-small font-semibold text-text-secondary p-3">
            Bulk Add Classes (paste list)
          </summary>
          <div className="p-3">
            <SpreadsheetImporter
              expectedColumns={[
                { key: "name", label: "Class Name", required: true },
                { key: "grade_level", label: "Grade Level", required: false },
              ]}
              onImport={handleImport}
              isImporting={importing}
            />
          </div>
        </details>
      </Card>

      <Card variant="bordered" className="shadow-sm">
        <div className="grid gap-2">
          {(Array.isArray(items) ? items : []).map((c) => (
            <div
              key={c.id}
              className="flex justify-between items-center p-3 bg-bg rounded-sm"
            >
              <div>
                <p className="font-semibold">{c.name}</p>
                <p className="text-caption text-text-muted">
                  {c.grade_level || "—"}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setActiveClass(c)}
                >
                  Manage Staff
                </Button>
                <Button variant="ghost" size="sm" onClick={() => startEdit(c)}>
                  Edit
                </Button>
              </div>
            </div>
          ))}
          {items.length === 0 && (
            <p className="text-small text-text-muted py-4 text-center">
              No classes yet.
            </p>
          )}
        </div>
      </Card>

      {activeClass && (
        <ClassAssignmentsModal
          classId={activeClass.id}
          className={activeClass.name}
          onClose={() => setActiveClass(null)}
        />
      )}
    </div>
  );
}
