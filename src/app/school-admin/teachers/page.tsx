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
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [resetResult, setResetResult] = useState<{
    name: string;
    email: string;
    password: string;
  } | null>(null);
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

  const [bulkRows, setBulkRows] = useState([{ last: "", first: "", email: "", phone: "" }]);
  
  const handleBulkPaste = (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData("text");
    if (!text.includes("\n") && !text.includes("\t") && !text.includes(",")) return;
    
    e.preventDefault();
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    const newRows = lines.map(line => {
      const parts = line.includes("\t") ? line.split("\t") : line.split(",");
      return {
        last: (parts[0] || "").trim(),
        first: (parts[1] || "").trim(),
        email: (parts[2] || "").trim(),
        phone: (parts[3] || "").trim(),
      };
    });
    setBulkRows(newRows.length > 0 ? newRows : [{ last: "", first: "", email: "", phone: "" }]);
  };

  const bulkCreate = async () => {
    const validRows = bulkRows.filter(r => r.first && r.last && r.email);
    if (validRows.length === 0) {
       setMsg({ type: "error", text: "Please fill in at least one complete row (Last Name, First Name, Email)"});
       return;
    }
    
    const results: any[] = [];
    const errors: string[] = [];
    
    for (const r of validRows) {
      const res = await fetch("/api/school-admin/teachers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          last_name: r.last,
          first_name: r.first,
          email: r.email,
          phone: r.phone,
        }),
      });
      const d = await res.json();
      if (res.ok) {
        results.push(d);
      } else if (res.status === 409) {
        errors.push(`Skipped (duplicate): ${r.email}`);
      } else {
        errors.push(`Failed for ${r.email}: ${d.error}`);
      }
    }
    
    setBulkRows([{ last: "", first: "", email: "", phone: "" }]);
    load();
    const summary = `${results.length} created${
      errors.length > 0 ? `, ${errors.length} skipped/failed` : ""
    }`;
    setMsg({ type: results.length > 0 ? "success" : "error", text: summary });
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
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Reset failed");

      setResetResult({
        name: teacherName,
        email: teacherEmail,
        password: data.newPassword,
      });
      setMsg({ type: "success", text: "Password reset successfully" });
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
        <div className="bg-warning-bg border border-warning rounded-sm p-4 space-y-2">
          <p className="text-small font-bold text-warning">
            ⚠️ Save credentials — shown once only
            {created.count ? ` (${created.count} created)` : ""}
          </p>
          {created.results ? (
            created.results.map((r: any, i: number) => (
              <div key={i} className="border-t border-warning/30 pt-2 mt-2">
                <p className="text-small font-semibold">{r.profiles?.full_name || r.email}</p>
                <p className="text-small">Email: {r.email}</p>
                <p className="text-small font-mono">Password: {r.password}</p>
              </div>
            ))
          ) : (
            <>
              <p className="text-small">Email: {created.email}</p>
              <p className="text-small">Password: {created.password}</p>
            </>
          )}
        </div>
      )}

      {resetResult && (
        <div className="bg-warning-bg border border-warning rounded-sm p-4">
          <p className="text-small font-bold text-warning">
            🔑 New Password Generated — Save This Now
          </p>
          <p className="text-small">
            <strong>Teacher:</strong> {resetResult.name}
          </p>
          <p className="text-small">
            <strong>Email:</strong> {resetResult.email}
          </p>
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
          <div className="p-3 space-y-3">
            <p className="text-caption text-text-muted">
              Enter details below, or paste from Excel (tab-separated) directly into any cell.
            </p>
            <div className="overflow-x-auto border border-border-strong rounded-sm">
              <table className="w-full text-left text-small">
                <thead className="bg-surface border-b border-border-strong">
                  <tr>
                    <th className="p-2 font-medium">Last Name</th>
                    <th className="p-2 font-medium">First Name</th>
                    <th className="p-2 font-medium">Email</th>
                    <th className="p-2 font-medium">Phone</th>
                    <th className="p-2 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {bulkRows.map((r, i) => (
                    <tr key={i} className="border-b border-border last:border-0">
                      <td className="p-1">
                        <input
                          className="w-full p-1 bg-transparent border-0 focus:ring-1 focus:ring-primary rounded-sm"
                          placeholder="Doe"
                          value={r.last}
                          onChange={(e) => {
                            const newRows = [...bulkRows];
                            newRows[i].last = e.target.value;
                            setBulkRows(newRows);
                          }}
                          onPaste={handleBulkPaste}
                        />
                      </td>
                      <td className="p-1">
                        <input
                          className="w-full p-1 bg-transparent border-0 focus:ring-1 focus:ring-primary rounded-sm"
                          placeholder="John"
                          value={r.first}
                          onChange={(e) => {
                            const newRows = [...bulkRows];
                            newRows[i].first = e.target.value;
                            setBulkRows(newRows);
                          }}
                          onPaste={handleBulkPaste}
                        />
                      </td>
                      <td className="p-1">
                        <input
                          type="email"
                          className="w-full p-1 bg-transparent border-0 focus:ring-1 focus:ring-primary rounded-sm"
                          placeholder="john@school.edu"
                          value={r.email}
                          onChange={(e) => {
                            const newRows = [...bulkRows];
                            newRows[i].email = e.target.value;
                            setBulkRows(newRows);
                          }}
                          onPaste={handleBulkPaste}
                        />
                      </td>
                      <td className="p-1">
                        <input
                          className="w-full p-1 bg-transparent border-0 focus:ring-1 focus:ring-primary rounded-sm"
                          placeholder="08012345678"
                          value={r.phone}
                          onChange={(e) => {
                            const newRows = [...bulkRows];
                            newRows[i].phone = e.target.value;
                            setBulkRows(newRows);
                          }}
                          onPaste={handleBulkPaste}
                        />
                      </td>
                      <td className="p-1 text-center">
                        <button
                          title="Remove Row"
                          onClick={() => setBulkRows(bulkRows.filter((_, idx) => idx !== i))}
                          className="text-error hover:bg-error-bg p-1 rounded-sm"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-between items-center">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setBulkRows([...bulkRows, { last: "", first: "", email: "", phone: "" }])}
              >
                + Add Row
              </Button>
              <Button onClick={bulkCreate}>Submit Teachers</Button>
            </div>
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
          ))}
        </div>
      </Card>
    </div>
  );
}
