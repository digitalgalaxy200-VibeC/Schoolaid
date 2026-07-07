"use client";
import { useEffect, useState } from "react";
import { Button, Input, Card } from "@/components/ui";

export default function TeachersPage() {
  const [items, setItems] = useState<any[]>([]);
  const [show, setShow] = useState(false);
  const [first, setFirst] = useState(""); const [last, setLast] = useState("");
  const [email, setEmail] = useState(""); const [phone, setPhone] = useState("");
  const [created, setCreated] = useState<any>(null);

  const load = () => fetch("/api/school-admin/teachers").then(r=>r.json()).then(d=>setItems(Array.isArray(d)?d:[]));
  useEffect(()=>{load()},[]);

  const create = async (e:React.FormEvent)=>{e.preventDefault();
    const r=await fetch("/api/school-admin/teachers",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({first_name:first,last_name:last,email,phone})});
    const d=await r.json(); if(r.ok){setCreated(d); setItems(prev=>[...prev,d]); setShow(false);}
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between"><h1 className="text-h1 font-bold">Teachers</h1><Button onClick={()=>setShow(true)}>Add Teacher</Button></div>
      {show&&<Card variant="bordered"><form onSubmit={create} className="space-y-4"><div className="grid grid-cols-2 gap-4"><Input label="First Name" value={first} onChange={e=>setFirst(e.target.value)} required /><Input label="Last Name" value={last} onChange={e=>setLast(e.target.value)} required /></div><Input label="Email" type="email" value={email} onChange={e=>setEmail(e.target.value)} required /><Input label="Phone" value={phone} onChange={e=>setPhone(e.target.value)} /><div className="flex gap-3"><Button type="submit">Create</Button><Button variant="ghost" onClick={()=>setShow(false)}>Cancel</Button></div></form></Card>}
      {created&&<div className="bg-warning-bg border border-warning rounded-sm p-4"><p className="text-small font-bold text-warning">⚠️ Save these credentials</p><p className="text-small">Email: {created.email}</p><p className="text-small">Password: {created.password}</p></div>}
      <Card variant="bordered" className="shadow-sm"><div className="grid gap-2">{items.map(t=><div key={t.id} className="flex justify-between p-3 bg-bg rounded-sm items-center"><div><p className="font-semibold">{t.profiles?.full_name||t.employee_id}</p><p className="text-caption text-text-muted">{t.profiles?.email}</p></div></div>)}</div></Card>
    </div>
  );
}
