"use client";
import { useEffect, useState } from "react";
import { Button, Input, Card } from "@/components/ui";

const GRADE_LEVELS = ["Play school", "Nursery", "Primary", "Secondary"];

export default function ClassesPage() {
  const [items, setItems] = useState<any[]>([]);
  const [show, setShow] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [grade, setGrade] = useState("");
  const [bulkText, setBulkText] = useState("");
  const [msg, setMsg] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const load = () =>
    fetch("/api/school-admin/classes")
      .then((r) => r.json())
      .then((d) => setItems(Array.isArray(d) ? d : []));
  useEffect(load, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editId) {
      const r = await fetch(`/api/school-admin/classes`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editId, name, grade_level: grade }),
      });
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

  const bulkCreate = async () => {
    const lines = bulkText.split("\n").filter((l) => l.trim());
    let created = 0;
    for (const line of lines) {
      const parts = line.split(",").map((p) => p.trim());
      const r = await fetch("/api/school-admin/classes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: parts[0], grade_level: parts[1] || "" }),
      });
      if (r.ok) created++;
    }
    setMsg({ type: "success", text: `${created} classes created` });
    setBulkText("");
    load();
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
      {show && (
        <Card variant="bordered">
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
            <div className="flex gap-3">
              <Button type="submit">{editId ? "Update" : "Create"}</Button>
              <Button variant="ghost" onClick={reset}>
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Bulk create */}
      <Card variant="bordered" className="shadow-sm">
        <details className="cursor-pointer">
          <summary className="text-small font-semibold text-text-secondary p-3">
            Bulk Add Classes (paste list)
          </summary>
          <div className="p-3 space-y-3">
            <p className="text-caption text-text-muted">
              One per line: Class Name, Grade Level
            </p>
            <textarea
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              rows={6}
              className="w-full px-4 py-2 bg-surface border border-border-strong rounded-sm text-body"
              placeholder="JSS 1, Secondary&#10;JSS 2, Secondary&#10;JSS 3, Secondary"
            />
            <Button onClick={bulkCreate}>Bulk Create</Button>
          </div>
        </details>
      </Card>

      <Card variant="bordered" className="shadow-sm">
        <div className="grid gap-2">
          {items.map((c) => (
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
              <Button variant="ghost" size="sm" onClick={() => startEdit(c)}>
                Edit
              </Button>
            </div>
          ))}
          {items.length === 0 && (
            <p className="text-small text-text-muted py-4 text-center">
              No classes yet.
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}
