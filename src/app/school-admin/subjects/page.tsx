"use client";
import { useEffect, useState } from "react";
import { Button, Input, Card } from "@/components/ui";
import { Modal } from "@/components/ui/Modal";

export default function SubjectsPage() {
  const [items, setItems] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [selectedClasses, setSelectedClasses] = useState<string[]>([]);
  const [show, setShow] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState(""); const [code, setCode] = useState("");
  const [bulkText, setBulkText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [msg, setMsg] = useState<{type:"success"|"error",text:string}|null>(null);
  const [tab, setTab] = useState<"all"|"byclass">("all");

  // "View by Class" state
  const [classAssignments, setClassAssignments] = useState<Record<string, any[]>>({});
  const [selectedClass, setSelectedClass] = useState<any>(null);
  const [classModal, setClassModal] = useState(false);

  const load = () => {
    fetch("/api/school-admin/subjects").then(r=>r.json()).then(d=>setItems(Array.isArray(d)?d:[]));
    fetch("/api/school-admin/classes").then(r=>r.json()).then(d=>setClasses(Array.isArray(d)?d:[]));
  };
  useEffect(load,[]);

  const loadClassAssignments = async () => {
    const r = await fetch("/api/school-admin/class-subjects");
    if (r.ok) {
      const data = await r.json();
      const map: Record<string, any[]> = {};
      (Array.isArray(data)?data:[]).forEach((cs:any) => {
        if (!map[cs.class_id]) map[cs.class_id] = [];
        map[cs.class_id].push(cs);
      });
      setClassAssignments(map);
    }
  };
  useEffect(() => { if (tab === "byclass") loadClassAssignments(); }, [tab]);

  const submit = async (e:React.FormEvent) => { e.preventDefault(); setIsSubmitting(true);
    const endpoint = "/api/school-admin/subjects";
    const method = editId ? "PUT" : "POST";
    const body = editId ? { id:editId, name, code } : { name, code };
    const r = await fetch(endpoint, { method, headers:{"Content-Type":"application/json"}, body:JSON.stringify(body) });
    if (r.ok) {
      const saved = await r.json();
      if (selectedClasses.length > 0) {
        await fetch("/api/school-admin/class-subjects", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({subject_id:saved.id, class_ids:selectedClasses}) });
      }
      setIsSubmitting(false); setMsg({type:"success",text:editId?"Updated":"Created"}); reset(); load();
    } else { setIsSubmitting(false); const d = await r.json(); setMsg({type:"error",text:d.error}); }
  };

  const handleBulk = async () => {
    const lines = bulkText.split("\n").filter(l=>l.trim()); let c=0;
    for (const line of lines) { const p=line.split(",").map(x=>x.trim()); const r=await fetch("/api/school-admin/subjects",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:p[0],code:p[1]||""})}); if(r.ok) c++; }
    setBulkText(""); load(); setMsg({type:"success",text:`${c} created`});
  };

  const startEdit = async (s:any) => { setEditId(s.id); setName(s.name); setCode(s.code||"");
    try { const r=await fetch(`/api/school-admin/class-subjects?subject_id=${s.id}`); if(r.ok){const d=await r.json();setSelectedClasses(d.map((cs:any)=>cs.class_id));} } catch {}
    setShow(true);
  };
  const reset = () => { setShow(false); setEditId(null); setName(""); setCode(""); setSelectedClasses([]); };

  // Class modal: add/remove subjects
  const addSubjectToClass = async (subjectId: string) => {
    await fetch("/api/school-admin/class-subjects", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({subject_id:subjectId, class_ids:[selectedClass.id]}) });
    loadClassAssignments();
  };
  const removeSubjectFromClass = async (csId: string) => {
    await fetch(`/api/school-admin/class-subjects?id=${csId}`, { method:"DELETE" });
    loadClassAssignments();
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between"><h1 className="text-h1 font-bold">Subjects</h1><Button onClick={()=>{reset();setShow(true);}}>Add Subject</Button></div>
      {msg&&<div className={`px-4 py-3 rounded-sm text-small font-medium ${msg.type==="success"?"bg-success-bg text-success border border-success":"bg-error-bg text-error border border-error"}`}>{msg.text}</div>}

      {/* Tabs */}
      <div className="flex gap-2">
        <button onClick={()=>setTab("all")} className={`px-4 py-2 rounded-sm text-small font-semibold ${tab==="all"?"bg-primary text-text-inverse":"bg-surface text-text-secondary border border-border"}`}>All Subjects</button>
        <button onClick={()=>setTab("byclass")} className={`px-4 py-2 rounded-sm text-small font-semibold ${tab==="byclass"?"bg-primary text-text-inverse":"bg-surface text-text-secondary border border-border"}`}>View Subjects by Class</button>
      </div>

      {tab === "all" && (
        <>
          {/* Add/Edit Modal */}
          <Modal isOpen={show} onClose={reset} title={editId?"Edit Subject":"Add Subject"}>
            <form onSubmit={submit} className="space-y-4">
              <Input label="Subject Name" value={name} onChange={e=>setName(e.target.value)} placeholder="Mathematics" required />
              <Input label="Code" value={code} onChange={e=>setCode(e.target.value)} placeholder="MATH" />
              <div className="space-y-2"><label className="text-small font-semibold text-text-secondary">Classes Offered In</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 border border-border p-3 rounded-md max-h-48 overflow-y-auto">
                  {classes.map(cls=><label key={cls.id} className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" checked={selectedClasses.includes(cls.id)} onChange={e=>{if(e.target.checked)setSelectedClasses([...selectedClasses,cls.id]);else setSelectedClasses(selectedClasses.filter(id=>id!==cls.id));}} className="rounded border-border text-primary" /><span>{cls.name}</span></label>)}
                </div>
              </div>
              <div className="flex gap-3"><Button type="submit" loading={isSubmitting}>{editId?"Update":"Create"}</Button><Button variant="ghost" onClick={reset}>Cancel</Button></div>
            </form>
          </Modal>

          <Card variant="bordered" className="shadow-sm"><details><summary className="text-small font-semibold text-text-secondary p-3 cursor-pointer">Bulk Add Subjects</summary><div className="p-3 space-y-3"><p className="text-caption text-text-muted">One per line: Name, Code</p><textarea value={bulkText} onChange={e=>setBulkText(e.target.value)} rows={6} className="w-full px-4 py-2 bg-surface border border-border-strong rounded-sm text-body" placeholder="Mathematics, MATH&#10;English, ENG"/><Button onClick={handleBulk}>Bulk Create</Button></div></details></Card>

          <Card variant="bordered" className="shadow-sm"><div className="grid gap-2">{items.map(s=><div key={s.id} className="flex justify-between items-center p-3 bg-bg rounded-sm"><div><p className="font-semibold">{s.name}</p><span className="text-caption text-text-muted font-mono">{s.code||"—"}</span></div><Button variant="ghost" size="sm" onClick={()=>startEdit(s)}>Edit</Button></div>)}</div></Card>
        </>
      )}

      {tab === "byclass" && (
        <div className="grid grid-cols-1 tablet:grid-cols-2 desktop:grid-cols-3 gap-4">
          {classes.map(cls => {
            const assigned = classAssignments[cls.id] || [];
            return (
              <Card key={cls.id} variant="bordered" className="shadow-sm cursor-pointer hover:shadow-md" onClick={()=>{setSelectedClass(cls);setClassModal(true);}}>
                <p className="font-semibold">{cls.name}</p>
                <p className="text-caption text-text-muted">{assigned.length} subject{assigned.length!==1?"s":""}</p>
              </Card>
            );
          })}
          <Modal isOpen={classModal} onClose={()=>setClassModal(false)} title={`Subjects for ${selectedClass?.name||""}`}>
            <div className="space-y-3">
              {(classAssignments[selectedClass?.id]||[]).map((cs:any) => {
                const subj = items.find(s=>s.id===cs.subject_id);
                return <div key={cs.id} className="flex justify-between items-center p-2 bg-bg rounded-sm"><span className="text-small">✓ {subj?.name||cs.subject_id}</span><Button variant="ghost" size="sm" onClick={()=>removeSubjectFromClass(cs.id)}>Remove</Button></div>;
              })}
              <div className="border-t border-border pt-3">
                <p className="text-small font-semibold mb-2">Add Subject</p>
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {items.filter(s=>!classAssignments[selectedClass?.id]?.some((cs:any)=>cs.subject_id===s.id)).map(s=><div key={s.id} onClick={()=>addSubjectToClass(s.id)} className="p-2 hover:bg-primary-light rounded-sm cursor-pointer text-small">{s.name} {s.code&&<span className="text-caption text-text-muted">({s.code})</span>}</div>)}
                </div>
              </div>
            </div>
          </Modal>
        </div>
      )}
    </div>
  );
}
