"use client";
import { useEffect, useState } from "react";
import { Button, Input, Card } from "@/components/ui";

export default function AssessmentConfig() {
  const [tab, setTab] = useState<
    "components" | "grading" | "psychomotor" | "affective"
  >("components");
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [components, setComponents] = useState<any[]>([]);
  const [grading, setGrading] = useState<any[]>([]);
  const [psycho, setPsycho] = useState<any[]>([]);
  const [affective, setAffective] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [msg, setMsg] = useState("");
  const [msgType, setMsgType] = useState<"success" | "error">("error");

  const [name, setName] = useState("");
  const [maxScore, setMaxScore] = useState("");
  const [order, setOrder] = useState("");
  const [grade, setGrade] = useState("");
  const [minS, setMinS] = useState("");
  const [maxS, setMaxS] = useState("");
  const [remark, setRemark] = useState("");
  const [cId, setCId] = useState("");

  const loadAll = () => {
    fetch("/api/school-admin/assessment-components")
      .then((r) => r.json())
      .then((d) => setComponents(Array.isArray(d) ? d : []));
    fetch("/api/school-admin/grading-scales")
      .then((r) => r.json())
      .then((d) => setGrading(Array.isArray(d) ? d : []));
    fetch("/api/school-admin/psychomotor")
      .then((r) => r.json())
      .then((d) => setPsycho(Array.isArray(d) ? d : []));
    fetch("/api/school-admin/affective")
      .then((r) => r.json())
      .then((d) => setAffective(Array.isArray(d) ? d : []));
    fetch("/api/school-admin/classes")
      .then((r) => r.json())
      .then((d) => setClasses(Array.isArray(d) ? d : []));
  };
  useEffect(() => {
    loadAll();
  }, []);

  const reset = () => {
    setName("");
    setMaxScore("");
    setOrder("");
    setGrade("");
    setMinS("");
    setMaxS("");
    setRemark("");
    setCId("");
    setMsg("");
    setEditId(null);
  };

  const openAdd = () => {
    reset();
    setShowForm(true);
  };

  const openEdit = (item: any) => {
    setEditId(item.id);
    setName(item.name || item.grade || "");
    setMaxScore(item.maximum_score?.toString() || "");
    setOrder(item.display_order?.toString() || "");
    setGrade(item.grade || "");
    setMinS(item.minimum_score?.toString() || "");
    setMaxS(item.maximum_score?.toString() || "");
    setRemark(item.remark || "");
    setCId(item.class_id || "");
    setShowForm(true);
  };

  const duplicateItem = async (item: any) => {
    const { id, created_at, updated_at, ...rest } = item;
    const endpoint = endpoints[tab];
    const r = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rest),
    });
    if (r.ok) {
      setMsg("Duplicated successfully");
      setMsgType("success");
      loadAll();
    } else {
      const d = await r.json();
      setMsg(d.error || "Failed");
      setMsgType("error");
    }
  };

  const save = async (endpoint: string, body: any) => {
    const method = editId ? "PUT" : "POST";
    const payload = editId ? { ...body, id: editId } : body;
    const r = await fetch(endpoint, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const d = await r.json();
    if (r.ok) {
      setShowForm(false);
      reset();
      loadAll();
    } else {
      setMsg(d.error || "Failed");
      setMsgType("error");
    }
  };

  const remove = async (id: string) => {
    const endpoint = endpoints[tab];
    await fetch(`${endpoint}?id=${id}`, { method: "DELETE" });
    loadAll();
  };

  const tabs = [
    { k: "components", l: "Components" },
    { k: "grading", l: "Grading" },
    { k: "psychomotor", l: "Psychomotor" },
    { k: "affective", l: "Affective" },
  ] as const;

  const formFields = () => {
    if (tab === "components")
      return (
        <>
          <Input
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Test 1"
            required
          />
          <Input
            label="Max Score"
            type="number"
            value={maxScore}
            onChange={(e) => setMaxScore(e.target.value)}
            required
          />
          <Input
            label="Display Order"
            type="number"
            value={order}
            onChange={(e) => setOrder(e.target.value)}
          />
        </>
      );
    if (tab === "grading")
      return (
        <>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Grade"
              value={grade}
              onChange={(e) => setGrade(e.target.value)}
              placeholder="A"
              required
            />
            <Input
              label="Remark"
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              placeholder="Excellent"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Min Score"
              type="number"
              value={minS}
              onChange={(e) => setMinS(e.target.value)}
              required
            />
            <Input
              label="Max Score"
              type="number"
              value={maxS}
              onChange={(e) => setMaxS(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-small font-semibold text-text-secondary mb-2">
              Class Override (optional)
            </label>
            <select
              value={cId}
              onChange={(e) => setCId(e.target.value)}
              className="w-full px-4 py-2.5 bg-surface border border-border-strong rounded-sm text-body"
            >
              <option value="">School-wide</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </>
      );
    return (
      <>
        <Input
          label="Trait Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <Input
          label="Display Order"
          type="number"
          value={order}
          onChange={(e) => setOrder(e.target.value)}
        />
      </>
    );
  };

  const endpoints: Record<string, string> = {
    components: "/api/school-admin/assessment-components",
    grading: "/api/school-admin/grading-scales",
    psychomotor: "/api/school-admin/psychomotor",
    affective: "/api/school-admin/affective",
  };

  const createBody = () => {
    if (tab === "components")
      return {
        name,
        maximum_score: parseFloat(maxScore),
        display_order: parseInt(order) || 0,
      };
    if (tab === "grading")
      return {
        grade,
        minimum_score: parseFloat(minS),
        maximum_score: parseFloat(maxS),
        remark,
        class_id: cId || null,
      };
    return { name, display_order: parseInt(order) || 0 };
  };

  const items =
    tab === "components"
      ? components
      : tab === "grading"
        ? grading
        : tab === "psychomotor"
          ? psycho
          : affective;

  return (
    <div className="space-y-6">
      <h1 className="text-h1 font-bold">Assessment Configuration</h1>

      <div className="flex gap-2 flex-wrap">
        {tabs.map((t) => (
          <button
            key={t.k}
            onClick={() => {
              setTab(t.k);
              setShowForm(false);
              reset();
            }}
            className={`px-4 py-2 rounded-sm text-small font-semibold ${tab === t.k ? "bg-primary text-text-inverse" : "bg-surface text-text-secondary border border-border"}`}
          >
            {t.l}
          </button>
        ))}
      </div>

      <div className="flex justify-between items-center">
        <h2 className="text-h2 font-bold">
          {tabs.find((t) => t.k === tab)?.l}
        </h2>
        <Button onClick={openAdd}>{editId ? "Cancel Edit" : "Add"}</Button>
      </div>

      {msg && (
        <div
          className={`px-4 py-2 rounded-sm text-small font-medium ${msgType === "success" ? "bg-success-bg text-success border border-success" : "bg-error-bg text-error border border-error"}`}
        >
          {msg}
        </div>
      )}

      {showForm && (
        <Card variant="bordered" className="shadow-sm">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              save(endpoints[tab], createBody());
            }}
            className="space-y-4"
          >
            {editId && (
              <p className="text-caption text-text-muted">
                Editing existing item
              </p>
            )}
            {formFields()}
            <div className="flex gap-3">
              <Button type="submit">{editId ? "Update" : "Save"}</Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setShowForm(false);
                  reset();
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      )}

      <Card variant="bordered" className="shadow-sm">
        {items.length === 0 ? (
          <p className="text-small text-text-muted py-4 text-center">
            No items yet.
          </p>
        ) : (
          <div className="grid gap-2">
            {items.map((i: any) => (
              <div
                key={i.id}
                className="flex justify-between items-center p-3 bg-bg rounded-sm"
              >
                <div>
                  <p className="font-semibold text-small">
                    {i.name || i.grade}
                    {i.remark ? ` — ${i.remark}` : ""}
                    {i.class_id ? " (class override)" : ""}
                  </p>
                  <p className="text-caption text-text-muted">
                    {i.maximum_score ? `Max: ${i.maximum_score}` : ""}
                    {i.minimum_score !== undefined
                      ? `${i.minimum_score}–${i.maximum_score}`
                      : ""}
                  </p>
                </div>
                <div className="flex gap-2 items-center">
                  <button
                    onClick={() => openEdit(i)}
                    className="text-caption text-primary hover:underline"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => duplicateItem(i)}
                    className="text-caption text-text-muted hover:underline"
                  >
                    Duplicate
                  </button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => remove(i.id)}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
