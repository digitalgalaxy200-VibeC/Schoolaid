"use client";
import { useEffect, useState } from "react";
import { Button, Card, Badge } from "@/components/ui";

export default function AssignmentsPage() {
  const [items, setItems] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [show, setShow] = useState(false);
  const [teacherId, setTeacherId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [cId, setCId] = useState("");

  const load = () => fetch("/api/school-admin/assignments").then(r=>r.json()).then(d=>setItems(Array.isArray(d)?d:[]));
  useEffect(()=>{
    Promise.all([
      fetch("/api/school-admin/teachers").then(r=>r.json()),
      fetch("/api/school-admin/classes").then(r=>r.json()),
      fetch("/api/school-admin/subjects").then(r=>r.json()),
    ]).then(([t,c,s])=>{setTeachers(Array.isArray(t)?t:[]);setClasses(Array.isArray(c)?c:[]);setSubjects(Array.isArray(s)?s:[])});
    load();
  },[]);

  const assign = async (e:React.FormEvent)=>{e.preventDefault();
    await fetch("/api/school-admin/assignments",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({teacher_id:teacherId,subject_id:subjectId,class_id:cId})});
    setShow(false); load();
  };

  const remove = async (id:string) => { await fetch(`/api/school-admin/assignments?id=${id}`,{method:"DELETE"}); load(); };

  const sel = (opts:any[],id:string)=>opts.find(o=>o.id===id);

  return (
    <div className="space-y-6">
      <div className="flex justify-between"><h1 className="text-h1 font-bold">Teacher Assignments</h1><Button onClick={()=>setShow(true)}>New Assignment</Button></div>
      {show&&<Card variant="bordered"><form onSubmit={assign} className="space-y-4">
        <div><label className="block text-small font-semibold text-text-secondary mb-2">Teacher</label><select value={teacherId} onChange={e=>setTeacherId(e.target.value)} className="w-full px-4 py-[10px] bg-surface border border-border-strong rounded-sm text-body" required><option value="">Select</option>{teachers.map(t=><option key={t.id} value={t.id}>{t.profiles?.full_name||t.employee_id}</option>)}</select></div>
        <div><label className="block text-small font-semibold text-text-secondary mb-2">Subject</label><select value={subjectId} onChange={e=>setSubjectId(e.target.value)} className="w-full px-4 py-[10px] bg-surface border border-border-strong rounded-sm text-body" required><option value="">Select</option>{subjects.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
        <div><label className="block text-small font-semibold text-text-secondary mb-2">Class</label><select value={cId} onChange={e=>setCId(e.target.value)} className="w-full px-4 py-[10px] bg-surface border border-border-strong rounded-sm text-body" required><option value="">Select</option>{classes.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
        <div className="flex gap-3"><Button type="submit">Assign</Button><Button variant="ghost" onClick={()=>setShow(false)}>Cancel</Button></div>
      </form></Card>}
      <Card variant="bordered" className="shadow-sm"><div className="grid gap-2">{items.map(a=><div key={a.id} className="flex justify-between items-center p-3 bg-bg rounded-sm"><div><p className="font-semibold text-small">{a.teachers?.profiles?.full_name||"—"}</p><p className="text-caption text-text-muted">{a.subjects?.name||"—"} → {a.classes?.name||"—"}</p></div><Button variant="danger" size="sm" onClick={()=>remove(a.id)}>Remove</Button></div>)}</div></Card>
    </div>
  );
}
