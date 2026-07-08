"use client";
import { useEffect, useState } from "react";
import { Button, Input, Card, Badge } from "@/components/ui";

export default function SubjectsPage() {
  const [items, setItems] = useState<any[]>([]);
  const [show, setShow] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [bulkText, setBulkText] = useState("");
  const [msg, setMsg] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const load = () =>
    fetch("/api/school-admin/subjects")
      .then((r) => r.json())
      .then((d) => setItems(Array.isArray(d) ? d : []));
  useEffect(() => {
    load();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const endpoint = "/api/school-admin/subjects";
    const method = editId ? "PUT" : "POST";
    const body = editId ? { id: editId, name, code } : { name, code };
    const r = await fetch(endpoint, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (r.ok) {
      setMsg({ type: "success", text: editId ? "Updated" : "Created" });
      reset();
      load();
    } else {
      const d = await r.json();
      setMsg({ type: "error", text: d.error });
    }
  };

  const bulkCreate = async () => {
    const lines = bulkText.split("\n").filter((l) => l.trim());
    let c = 0;
    for (const line of lines) {
      const parts = line.split(",").map((p) => p.trim());
      const r = await fetch("/api/school-admin/subjects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: parts[0], code: parts[1] || "" }),
      });
      if (r.ok) c++;
    }
    setMsg({ type: "success", text: `${c} created` });
    setBulkText("");
    load();
  };

  const startEdit = (s: any) => {
    setEditId(s.id);
    setName(s.name);
    setCode(s.code || "");
    setShow(true);
  };
  const reset = () => {
    setShow(false);
    setEditId(null);
    setName("");
    setCode("");
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
            <div className="flex gap-3">
              <Button type="submit">{editId ? "Update" : "Create"}</Button>
              <Button variant="ghost" onClick={reset}>
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
          <div className="p-3 space-y-3">
            <p className="text-caption text-text-muted">
              One per line: Name, Code
            </p>
            <textarea
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              rows={6}
              className="w-full px-4 py-2 bg-surface border border-border-strong rounded-sm text-body"
              placeholder="Mathematics, MATH&#10;English, ENG&#10;Basic Science, BSC"
            />
            <Button onClick={bulkCreate}>Bulk Create</Button>
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
