"use client";
import { useEffect, useState } from "react";
import { Button, Input, Card } from "@/components/ui";

export default function ClassesPage() {
  const [items, setItems] = useState<any[]>([]);
  const [show, setShow] = useState(false);
  const [name, setName] = useState("");
  const [grade, setGrade] = useState("");

  const load = () => fetch("/api/school-admin/classes").then(r => r.json()).then(d => setItems(Array.isArray(d)?d:[]));
  useEffect(() => { load(); }, []);

  const create = async (e: React.FormEvent) => { e.preventDefault();
    await fetch("/api/school-admin/classes", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({name, grade_level:grade}) });
    setShow(false); setName(""); setGrade(""); load();
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between"><h1 className="text-h1 font-bold">Classes</h1><Button onClick={() => setShow(true)}>Add Class</Button></div>
      {show && <Card variant="bordered"><form onSubmit={create} className="space-y-4"><Input label="Class Name" value={name} onChange={e=>setName(e.target.value)} placeholder="JSS 1" required /><Input label="Grade Level" value={grade} onChange={e=>setGrade(e.target.value)} /><div className="flex gap-3"><Button type="submit">Create</Button><Button variant="ghost" onClick={()=>setShow(false)}>Cancel</Button></div></form></Card>}
      <Card variant="bordered" className="shadow-sm"><div className="grid gap-2">{items.map(c => <div key={c.id} className="flex justify-between items-center p-3 bg-bg rounded-sm"><div><p className="font-semibold">{c.name}</p><p className="text-caption text-text-muted">{c.grade_level||"—"}</p></div></div>)}</div></Card>
    </div>
  );
}
