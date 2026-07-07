"use client";
import { useEffect, useState } from "react";
import { Button, Input, Card, Badge } from "@/components/ui";

export default function SubjectsPage() {
  const [items, setItems] = useState<any[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");

  const load = () => fetch("/api/school-admin/subjects").then(r => r.json()).then(d => setItems(Array.isArray(d)?d:[]));
  useEffect(() => { load(); }, []);

  const create = async (e: React.FormEvent) => { e.preventDefault();
    await fetch("/api/school-admin/subjects", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({name, code}) });
    setShowNew(false); load();
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between"><h1 className="text-h1 font-bold">Subjects</h1><Button onClick={() => setShowNew(true)}>Add Subject</Button></div>
      {showNew && <Card variant="bordered"><form onSubmit={create} className="space-y-4"><Input label="Subject Name" value={name} onChange={e=>setName(e.target.value)} placeholder="Mathematics" required /><Input label="Code" value={code} onChange={e=>setCode(e.target.value)} placeholder="MATH" /><div className="flex gap-3"><Button type="submit">Create</Button><Button variant="ghost" onClick={()=>setShowNew(false)}>Cancel</Button></div></form></Card>}
      <Card variant="bordered" className="shadow-sm"><div className="grid gap-2">{items.map(s => <div key={s.id} className="flex justify-between p-3 bg-bg rounded-sm"><p className="font-semibold">{s.name}</p><span className="text-caption text-text-muted font-mono">{s.code||"—"}</span></div>)}</div></Card>
    </div>
  );
}
