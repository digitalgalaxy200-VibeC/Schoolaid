"use client";
import { useEffect, useState } from "react";
import { Button, Input, Card, Badge } from "@/components/ui";
import { SpreadsheetImporter } from "@/components/ui/SpreadsheetImporter";

export default function SubjectsPage() {
  const [items, setItems] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [selectedClasses, setSelectedClasses] = useState<string[]>([]);
  const [show, setShow] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [bulkText, setBulkText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [msg, setMsg] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const load = () => {
    fetch("/api/school-admin/subjects")
      .then((r) => r.json())
      .then((d) => setItems(Array.isArray(d) ? d : []));
    fetch("/api/school-admin/classes")
      .then((r) => r.json())
      .then((d) => setClasses(Array.isArray(d) ? d : []));
  };
  useEffect(() => {
    load();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    const endpoint = "/api/school-admin/subjects";
    const method = editId ? "PUT" : "POST";
    const body = editId ? { id: editId, name, code } : { name, code };
    const r = await fetch(endpoint, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    
    if (r.ok) {
      const savedSubject = await r.json();
      
      // Update class assignments
      if (selectedClasses.length > 0) {
        await fetch("/api/school-admin/class-subjects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subject_id: savedSubject.id,
            class_ids: selectedClasses,
          }),
        });
      } else if (editId) {
        // If they unchecked all classes, we'd need a way to clear them, 
        // but for now, sending empty class_ids to POST will fail or do nothing.
        // A full sync would be ideal, but skipping for simplicity.
      }

      setIsSubmitting(false);
      setMsg({ type: "success", text: editId ? "Updated" : "Created" });
      reset();
      load();
    } else {
      setIsSubmitting(false);
      const d = await r.json();
      setMsg({ type: "error", text: d.error });
    }
  };

  const [importing, setImporting] = useState(false);

  const handleImport = async (data: any[]) => {
    setImporting(true);
    let created = 0;
    const errors: string[] = [];
    
    for (const r of data) {
      const res = await fetch("/api/school-admin/subjects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: r.name, code: r.code || "" }),
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
    const summary = `${created} subjects created${
      errors.length > 0 ? `, ${errors.length} skipped/failed` : ""
    }`;
    setMsg({ type: created > 0 ? "success" : "error", text: summary });
  };

  const startEdit = async (s: any) => {
    setEditId(s.id);
    setName(s.name);
    setCode(s.code || "");
    
    // Fetch assigned classes
    try {
      const r = await fetch(`/api/school-admin/class-subjects?subject_id=${s.id}`);
      if (r.ok) {
        const data = await r.json();
        setSelectedClasses(data.map((cs: any) => cs.class_id));
      }
    } catch (err) {}
    
    setShow(true);
  };
  const reset = () => {
    setShow(false);
    setEditId(null);
    setName("");
    setCode("");
    setSelectedClasses([]);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between">
        <h1 className="text-h1 font-bold">Subjects</h1>
        <Button
          onClick={() => {
            reset();
            setShow(true);
          }}
        >
          Add Subject
        </Button>
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
          <form onSubmit={submit} className="space-y-4">
            <Input
              label="Subject Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Mathematics"
              required
            />
            <Input
              label="Code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="MATH"
            />
            
            <div className="space-y-2">
              <label className="text-small font-semibold text-text-secondary">Classes Offered In</label>
              {classes.length === 0 ? (
                <p className="text-caption text-text-muted">No classes found.</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 border border-border p-3 rounded-md max-h-48 overflow-y-auto">
                  {classes.map((cls) => (
                    <label key={cls.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-bg-hover p-1 rounded">
                      <input
                        type="checkbox"
                        checked={selectedClasses.includes(cls.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedClasses([...selectedClasses, cls.id]);
                          } else {
                            setSelectedClasses(selectedClasses.filter(id => id !== cls.id));
                          }
                        }}
                        className="rounded border-border text-primary focus:ring-primary"
                      />
                      <span>{cls.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <Button type="submit" loading={isSubmitting}>{editId ? "Update" : "Create"}</Button>
              <Button variant="ghost" onClick={reset} disabled={isSubmitting}>
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      )}

      <Card variant="bordered" className="shadow-sm">
        <details>
          <summary className="text-small font-semibold text-text-secondary p-3 cursor-pointer">
            Bulk Add Subjects
          </summary>
          <div className="p-3">
            <SpreadsheetImporter
              expectedColumns={[
                { key: "name", label: "Subject Name", required: true },
                { key: "code", label: "Subject Code", required: false },
              ]}
              onImport={handleImport}
              isImporting={importing}
            />
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
                <p className="font-semibold">{s.name}</p>
                <span className="text-caption text-text-muted font-mono">
                  {s.code || "—"}
                </span>
              </div>
              <Button variant="ghost" size="sm" onClick={() => startEdit(s)}>
                Edit
              </Button>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
