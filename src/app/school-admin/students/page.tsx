"use client";
import { useEffect, useState } from "react";
import { Button, Input, Card } from "@/components/ui";

export default function StudentsPage() {
  const [items, setItems] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [show, setShow] = useState(false);
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [classId, setClassId] = useState("");
  const [created, setCreated] = useState<any>(null);
  const [bulkText, setBulkText] = useState("");
  const [bulkClassId, setBulkClassId] = useState("");
  const [msg, setMsg] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const load = () =>
    fetch("/api/school-admin/students")
      .then((r) => r.json())
      .then((d) => setItems(Array.isArray(d) ? d : []));
  useEffect(() => {
    fetch("/api/school-admin/classes")
      .then((r) => r.json())
      .then((d) => setClasses(Array.isArray(d) ? d : []));
    load();
  }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await fetch("/api/school-admin/students", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        first_name: first,
        last_name: last,
        class_id: classId,
      }),
    });
    const d = await r.json();
    if (r.ok) {
      setCreated(d);
      setItems((prev) => [...prev, d]);
      setShow(false);
      setMsg({ type: "success", text: "Student created" });
    } else {
      setMsg({ type: "error", text: d.error });
    }
  };

  const bulkCreate = async () => {
    const lines = bulkText.split("\n").filter((l) => l.trim());
    let c = 0;
    for (const line of lines) {
      const p = line.split(",").map((x) => x.trim());
      const r = await fetch("/api/school-admin/students", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: p[0] || "",
          last_name: p[1] || "",
          class_id: bulkClassId || classId,
        }),
      });
      if (r.ok) c++;
    }
    setBulkText("");
    load();
    setMsg({ type: "success", text: `${c} students created` });
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between">
        <h1 className="text-h1 font-bold">Students</h1>
        <Button onClick={() => setShow(true)}>Add Student</Button>
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
          <form onSubmit={create} className="space-y-4">
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
              <Button type="submit">Create</Button>
              <Button variant="ghost" onClick={() => setShow(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      )}
      {created && (
        <div className="bg-warning-bg border border-warning rounded-sm p-4">
          <p className="text-small font-bold text-warning">
            ⚠️ Save credentials
          </p>
          <p className="text-small">Email: {created.email}</p>
          <p className="text-small">Password: {created.password}</p>
        </div>
      )}

      <Card variant="bordered" className="shadow-sm">
        <details>
          <summary className="text-small font-semibold text-text-secondary p-3 cursor-pointer">
            Bulk Add Students
          </summary>
          <div className="p-3 space-y-3">
            <p className="text-caption text-text-muted">
              One per line: FirstName, LastName
            </p>
            <div className="mb-2">
              <label className="block text-caption text-text-muted mb-1">
                Class for bulk
              </label>
              <select
                value={bulkClassId}
                onChange={(e) => setBulkClassId(e.target.value)}
                className="w-full px-4 py-2 bg-surface border border-border-strong rounded-sm text-body"
              >
                <option value="">Select</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <textarea
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              rows={6}
              className="w-full px-4 py-2 bg-surface border border-border-strong rounded-sm text-body"
              placeholder="Amara, Chukwu&#10;Tunde, Bakare&#10;Grace, Effiong"
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
              className="flex justify-between p-3 bg-bg rounded-sm"
            >
              <div>
                <p className="font-semibold">{s.profiles?.full_name}</p>
                <p className="text-caption text-text-muted">{s.student_id}</p>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
