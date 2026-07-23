"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import { Card, Badge, Button } from "@/components/ui";

export default function ReportCardPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Data
  const [classes, setClasses] = useState<any[]>([]);
  const [classId, setClassId] = useState("");
  const [reportData, setReportData] = useState<any>(null);

  // Per-student state for attendance, psychomotor, affective, comments
  const [attendance, setAttendance] = useState<Record<string, { opened: string; present: string }>>({});
  const [psychomotor, setPsychomotor] = useState<Record<string, Record<string, string>>>({});
  const [affective, setAffective] = useState<Record<string, Record<string, string>>>({});
  const [comments, setComments] = useState<Record<string, string>>({});
  const [principalComments, setPrincipalComments] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const [expandedStudent, setExpandedStudent] = useState<string | null>(null);

  const autoSaveTimer = useRef<NodeJS.Timeout | null>(null);

  // Load teacher's classes
  useEffect(() => {
    fetch("/api/teacher/dashboard").then((r) => r.json()).then((d) => {
      // Only classes where teacher is primary class teacher
      const primaryClasses = (d.classes || []).filter((c: any) => c.role === "primary");
      setClasses(primaryClasses);
      if (primaryClasses.length > 0) setClassId(primaryClasses[0].id);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  // Load report card data when class changes
  useEffect(() => {
    if (!classId) return;
    setLoading(true);
    fetch(`/api/teacher/report-card?class_id=${classId}`)
      .then((r) => r.json())
      .then((data) => {
        setReportData(data);
        // Initialize state from existing data
        const att: Record<string, { opened: string; present: string }> = {};
        const psy: Record<string, Record<string, string>> = {};
        const aff: Record<string, Record<string, string>> = {};
        const cmt: Record<string, string> = {};
        const pcmt: Record<string, string> = {};
        for (const s of (data.students || [])) {
          if (s.attendance) {
            att[s.studentId] = { opened: String(s.attendance.daysOpened || ""), present: String(s.attendance.daysPresent || "") };
          }
          psy[s.studentId] = {};
          for (const p of (s.psychomotor || [])) {
            psy[s.studentId][p.traitId] = p.score !== null ? String(p.score) : "";
          }
          aff[s.studentId] = {};
          for (const a of (s.affective || [])) {
            aff[s.studentId][a.traitId] = a.score !== null ? String(a.score) : "";
          }
          cmt[s.studentId] = s.teacherComment || "";
          pcmt[s.studentId] = s.principalComment || "";
        }
        setAttendance(att);
        setPsychomotor(psy);
        setAffective(aff);
        setComments(cmt);
        setPrincipalComments(pcmt);
        setDirty(false);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [classId]);

  const flash = (type: "success" | "error", text: string) => {
    setMsg({ type, text });
    setTimeout(() => setMsg(null), 3000);
  };

  const markDirty = () => {
    setDirty(true);
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => saveAll(), 5000);
  };

  const saveAll = useCallback(async () => {
    if (!reportData?.activeTerm?.id || !reportData?.students) return;
    setSaving(true);
    let saved = 0;
    const termId = reportData.activeTerm.id;

    for (const s of reportData.students) {
      const sid = s.studentId;

      // Attendance
      const att = attendance[sid];
      if (att && (att.opened || att.present)) {
        const res = await fetch("/api/teacher/report-card", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "attendance", data: { student_id: sid, term_id: termId, days_school_opened: parseInt(att.opened) || 0, days_present: parseInt(att.present) || 0 } }),
        });
        if (res.ok) saved++;
      }

      // Psychomotor
      const psy = psychomotor[sid];
      if (psy) {
        for (const [traitId, score] of Object.entries(psy)) {
          if (score !== "") {
            await fetch("/api/teacher/report-card", {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ type: "psychomotor", data: { student_id: sid, trait_id: traitId, term_id: termId, score: parseInt(score) } }),
            });
          }
        }
      }

      // Affective
      const aff = affective[sid];
      if (aff) {
        for (const [traitId, score] of Object.entries(aff)) {
          if (score !== "") {
            await fetch("/api/teacher/report-card", {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ type: "affective", data: { student_id: sid, trait_id: traitId, term_id: termId, score: parseInt(score) } }),
            });
          }
        }
      }

      // Comment
      const cmt = comments[sid];
      if (cmt !== undefined) {
        await fetch("/api/teacher/report-card", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "comment", data: { student_id: sid, term_id: termId, comment: cmt } }),
        });
      }
    }

    setDirty(false);
    setSaving(false);
    flash("success", "All changes saved");
  }, [reportData, attendance, psychomotor, affective, comments]);

  const getRatingLabel = (score: string): string => {
    const s = parseInt(score);
    if (isNaN(s)) return "";
    if (s >= 5) return "Excellent";
    if (s >= 4) return "Very Good";
    if (s >= 3) return "Good";
    if (s >= 2) return "Fair";
    return "Poor";
  };

  if (loading && !reportData) {
    return <div className="flex justify-center py-20"><div className="animate-spin h-6 w-6 border-2 border-accent border-t-transparent rounded-full" /></div>;
  }

  return (
    <div className="space-y-4 animate-fade-in pb-20">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-h1 font-bold">Prepare Report Card</h1>
        <div className="flex gap-2 items-center">
          {dirty && <span className="text-caption text-warning font-medium">Unsaved changes</span>}
          <Button onClick={saveAll} loading={saving} variant={dirty ? "primary" : "ghost"}>Save</Button>
        </div>
      </div>

      {msg && (
        <div className={`px-4 py-2 rounded-sm text-small font-medium ${msg.type === "success" ? "bg-success-bg text-success" : "bg-error-bg text-error"}`}>{msg.text}</div>
      )}

      {/* Class selector */}
      <div>
        <label className="block text-caption text-text-muted mb-1">Select Your Class</label>
        <select value={classId} onChange={(e) => setClassId(e.target.value)}
          className="w-full tablet:w-auto px-4 py-2.5 bg-surface border border-border-strong rounded-sm text-body min-h-11">
          {classes.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {/* Session/Term banner */}
      {reportData?.activeTerm && (
        <div className="bg-info-bg border border-info/20 rounded-sm px-4 py-2.5">
          <span className="text-small font-semibold text-info">{reportData.sessionName} · {reportData.activeTerm.name}</span>
        </div>
      )}

      {!loading && reportData?.students?.length > 0 && (
        <div className="bg-accent/10 border border-accent/30 rounded-sm px-4 py-3">
          <p className="text-small text-text-primary">
            👆 <strong>Tap a student's name</strong> to set up their attendance, ratings, and remarks for the report card.
          </p>
        </div>
      )}

      {loading && (
        <div className="flex justify-center py-10"><div className="animate-spin h-6 w-6 border-2 border-accent border-t-transparent rounded-full" /></div>
      )}

      {!loading && reportData && (
        <>
          {/* ── Student Cards ── */}
          <div className="space-y-3">
            {reportData.students?.map((s: any, i: number) => {
              const isExpanded = expandedStudent === s.studentId;
              const daysOpened = parseInt(attendance[s.studentId]?.opened || "0");
              const daysPresent = parseInt(attendance[s.studentId]?.present || "0");
              const daysAbsent = Math.max(0, daysOpened - daysPresent);

              return (
                <Card key={s.studentId} variant="bordered" className="overflow-hidden">
                  {/* Student header */}
                  <button onClick={() => setExpandedStudent(isExpanded ? null : s.studentId)}
                    className="w-full px-3 py-3 flex items-center justify-between text-left">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-xs text-text-muted font-mono w-6 shrink-0">{i + 1}</span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">{s.name}</p>
                        <p className="text-caption text-text-muted">Adm: {s.admissionNo}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {s.grade !== "-" && <Badge variant={s.average >= 70 ? "success" : s.average >= 50 ? "warning" : "error"}>{s.grade}</Badge>}
                      <span className="text-sm font-bold">{s.average > 0 ? s.average.toFixed(1) + "%" : "—"}</span>
                      <svg className={`w-4 h-4 text-text-muted transition-transform ${isExpanded ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="px-3 pb-3 border-t border-border space-y-4">
                      {/* Subject scores — read only */}
                      {s.subjects.length > 0 && (
                        <div>
                          <p className="text-caption font-semibold text-text-muted mb-2">Subject Scores</p>
                          <div className="bg-bg rounded-sm overflow-hidden">
                            <table className="w-full text-xs">
                              <thead className="bg-primary text-text-inverse">
                                <tr>
                                  <th className="text-left px-2 py-1.5 font-semibold">Subject</th>
                                  <th className="text-center px-2 py-1.5 font-semibold">Total</th>
                                </tr>
                              </thead>
                              <tbody>
                                {s.subjects.map((subj: any) => (
                                  <tr key={subj.subjectId} className="border-b border-border">
                                    <td className="px-2 py-1.5">{subj.subjectName}</td>
                                    <td className="px-2 py-1.5 text-center font-bold">{subj.total}/{subj.maxTotal}</td>
                                  </tr>
                                ))}
                                <tr className="bg-surface font-bold">
                                  <td className="px-2 py-1.5">Grand Total</td>
                                  <td className="px-2 py-1.5 text-center">{s.grandTotal}/{s.maxGrandTotal}</td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {/* Attendance */}
                      <div>
                        <p className="text-caption font-semibold text-text-muted mb-2">Attendance</p>
                        <div className="flex gap-3">
                          <div className="flex-1">
                            <label className="text-xs text-text-muted">Days Opened</label>
                            <input type="number" min="0" value={attendance[s.studentId]?.opened || ""}
                              onChange={(e) => { setAttendance((p) => ({ ...p, [s.studentId]: { ...p[s.studentId], opened: e.target.value } })); markDirty(); }}
                              className="w-full px-2 py-2 text-sm border border-border rounded-sm bg-bg mt-0.5" />
                          </div>
                          <div className="flex-1">
                            <label className="text-xs text-text-muted">Days Present</label>
                            <input type="number" min="0" max={daysOpened || 999} value={attendance[s.studentId]?.present || ""}
                              onChange={(e) => { setAttendance((p) => ({ ...p, [s.studentId]: { ...p[s.studentId], present: e.target.value } })); markDirty(); }}
                              className="w-full px-2 py-2 text-sm border border-border rounded-sm bg-bg mt-0.5" />
                          </div>
                          <div className="flex-1">
                            <label className="text-xs text-text-muted">Days Absent</label>
                            <div className="w-full px-2 py-2 text-sm bg-bg mt-0.5 text-text-muted">{daysAbsent}</div>
                          </div>
                        </div>
                      </div>

                      {/* Psychomotor */}
                      {reportData.psychomotorTraits?.length > 0 && (
                        <div>
                          <p className="text-caption font-semibold text-text-muted mb-2">Psychomotor Skills (1-5)</p>
                          <div className="grid grid-cols-2 gap-2">
                            {reportData.psychomotorTraits.map((t: any) => {
                              const val = psychomotor[s.studentId]?.[t.id] || "";
                              return (
                                <div key={t.id}>
                                  <label className="text-xs text-text-muted">{t.name}</label>
                                  <select value={val}
                                    onChange={(e) => { setPsychomotor((p) => ({ ...p, [s.studentId]: { ...p[s.studentId], [t.id]: e.target.value } })); markDirty(); }}
                                    className="w-full px-2 py-2 text-sm border border-border rounded-sm bg-bg mt-0.5">
                                    <option value="">—</option>
                                    {[1,2,3,4,5].map((n) => <option key={n} value={n}>{n} - {getRatingLabel(String(n))}</option>)}
                                  </select>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Affective */}
                      {reportData.affectiveTraits?.length > 0 && (
                        <div>
                          <p className="text-caption font-semibold text-text-muted mb-2">Affective Domain (1-5)</p>
                          <div className="grid grid-cols-2 gap-2">
                            {reportData.affectiveTraits.map((t: any) => {
                              const val = affective[s.studentId]?.[t.id] || "";
                              return (
                                <div key={t.id}>
                                  <label className="text-xs text-text-muted">{t.name}</label>
                                  <select value={val}
                                    onChange={(e) => { setAffective((p) => ({ ...p, [s.studentId]: { ...p[s.studentId], [t.id]: e.target.value } })); markDirty(); }}
                                    className="w-full px-2 py-2 text-sm border border-border rounded-sm bg-bg mt-0.5">
                                    <option value="">—</option>
                                    {[1,2,3,4,5].map((n) => <option key={n} value={n}>{n} - {getRatingLabel(String(n))}</option>)}
                                  </select>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Teacher's Remark */}
                      <div>
                        <label className="text-caption font-semibold text-text-muted">Teacher's Remark</label>
                        <textarea value={comments[s.studentId] || ""}
                          onChange={(e) => { setComments((p) => ({ ...p, [s.studentId]: e.target.value })); markDirty(); }}
                          rows={2} placeholder="Enter remark for this student..."
                          className="w-full px-3 py-2 text-sm border border-border rounded-sm bg-bg mt-1 resize-none" />
                      </div>

                      {/* Principal's Remark */}
                      <div>
                        <label className="text-caption font-semibold text-text-muted">Principal's Remark</label>
                        <div className="w-full px-3 py-2 text-sm border border-border rounded-sm bg-bg mt-1 min-h-[44px] text-text-muted">
                          {principalComments[s.studentId] || "Not yet added by School Admin."}
                        </div>
                      </div>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
