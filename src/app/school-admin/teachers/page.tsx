"use client";
import { useEffect, useState } from "react";
import { Button, Input, Card } from "@/components/ui";

export default function TeachersPage() {
  const [items, setItems] = useState<any[]>([]);
  const [show, setShow] = useState(false);
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [created, setCreated] = useState<any>(null);
  const [bulkText, setBulkText] = useState("");
  const [msg, setMsg] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const load = () =>
    fetch("/api/school-admin/teachers")
      .then((r) => r.json())
      .then((d) => setItems(Array.isArray(d) ? d : []));
  useEffect(() => {
    load();
  }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await fetch("/api/school-admin/teachers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        first_name: first,
        last_name: last,
        email,
        phone,
      }),
    });
    const d = await r.json();
    if (r.ok) {
      setCreated(d);
      setItems((prev) => [...prev, d]);
      setShow(false);
      setMsg({ type: "success", text: "Teacher created" });
    } else {
      setMsg({ type: "error", text: d.error });
    }
  };

  const bulkCreate = async () => {
    const lines = bulkText.split("\n").filter((l) => l.trim());
    let c = 0;
    const results: any[] = [];
    for (const line of lines) {
      const p = line.split(",").map((x) => x.trim());
      const r = await fetch("/api/school-admin/teachers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: p[0] || "",
          last_name: p[1] || "",
          email: p[2] || "",
          phone: p[3] || "",
        }),
      });
      if (r.ok) {
        const d = await r.json();
        results.push(d);
        c++;
      }
    }
    setBulkText("");
    load();
    setMsg({ type: "success", text: `${c} teachers created` });
    if (results.length > 0)
      setCreated({
        email: results[0].email,
        password: results[0].password,
        count: results.length,
      });
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between">
        <h1 className="text-h1 font-bold">Teachers</h1>
        <Button onClick={() => setShow(true)}>Add Teacher</Button>
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
            <Input
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <Input
              label="Phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
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
            {created.count ? ` (${created.count} created)` : " — show once"}
          </p>
          <p className="text-small">Email: {created.email}</p>
          <p className="text-small">Password: {created.password}</p>
        </div>
      )}

      <Card variant="bordered" className="shadow-sm">
        <details>
          <summary className="text-small font-semibold text-text-secondary p-3 cursor-pointer">
            Bulk Add Teachers
          </summary>
          <div className="p-3 space-y-3">
            <p className="text-caption text-text-muted">
              One per line: FirstName, LastName, Email, Phone
            </p>
            <textarea
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              rows={6}
              className="w-full px-4 py-2 bg-surface border border-border-strong rounded-sm text-body"
              placeholder="Adekunle, Ojo, adekunle@school.edu, 08012345678&#10;Fatima, Bello, fatima@school.edu, 08087654321"
            />
            <Button onClick={bulkCreate}>Bulk Create</Button>
          </div>
        </details>
      </Card>

      <Card variant="bordered" className="shadow-sm">
        <div className="grid gap-2">
          {items.map((t) => (
            <div
              key={t.id}
              className="flex justify-between p-3 bg-bg rounded-sm"
            >
              <div>
                <p className="font-semibold">
                  {t.profiles?.full_name || t.employee_id}
                </p>
                <p className="text-caption text-text-muted">
                  {t.profiles?.email}
                </p>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
