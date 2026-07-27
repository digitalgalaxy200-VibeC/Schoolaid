"use client";

import React from "react";
import { ReportCardData } from "@/lib/types/report-card";

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

const C = {
  primary: "#1e3a8a", // Deeper, more professional blue
  secondary: "#3b82f6",
  white: "#ffffff",
  black: "#0f172a",
  gray50: "#f8fafc",
  gray100: "#f1f5f9",
  gray200: "#e2e8f0",
  gray300: "#cbd5e1",
  gray400: "#94a3b8",
  gray500: "#64748b",
  gray600: "#475569",
  gray700: "#334155",
  gray800: "#1e293b",
  green600: "#16a34a",
  red600: "#dc2626",
};

export function ReportCardUI({ data }: { data: ReportCardData }) {
  const manySubjects = data.academic.subjects.length > 15;
  const rowH = manySubjects ? "4px 6px" : "6px 8px";
  const fontSize = manySubjects ? "9px" : "10px";

  const s = data.settings || {
    show_position: true,
    show_average: true,
    show_attendance: true,
    show_psychomotor: true,
    show_affective: true,
    show_teacher_remark: true,
    show_admin_remark: true,
    show_grading_key: true,
    show_photo: true,
    show_gender: true,
    show_dob: true,
    show_component_scores: true,
  };

  // Sort components by order
  const components = (data.academic.assessmentComponents || []).sort((a, b) => a.order - b.order);

  return (
    <div
      id="report-card-ui"
      style={{
        width: "210mm",
        minHeight: "297mm",
        padding: "10mm 12mm", // Increased padding for breathing room
        boxSizing: "border-box",
        background: C.white,
        color: C.black,
        fontFamily: "Inter, system-ui, sans-serif",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Background Watermark */}
      {data.school.logo_url && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", opacity: 0.04, pointerEvents: "none", zIndex: 0 }}>
          <img src={data.school.logo_url} alt="" style={{ width: "300px", height: "300px", objectFit: "contain" }} />
        </div>
      )}

      {data.isDraft && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", opacity: 0.05, pointerEvents: "none", zIndex: 0 }}>
          <div style={{ transform: "rotate(-45deg)", fontSize: "140px", fontWeight: 900, letterSpacing: "0.2em", color: C.red600, whiteSpace: "nowrap" }}>DRAFT</div>
        </div>
      )}

      <div style={{ position: "relative", zIndex: 10, display: "flex", flexDirection: "column", height: "100%" }}>

        {/* HEADER SECTION */}
        <div style={{ display: "flex", alignItems: "center", gap: "16px", paddingBottom: "12px", marginBottom: "12px", borderBottom: `3px solid ${C.primary}` }}>
          <div style={{ width: "80px", height: "80px", flexShrink: 0 }}>
            {data.school.logo_url ? (
              <img src={data.school.logo_url} alt="School Logo" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
            ) : (
              <div style={{ width: "100%", height: "100%", borderRadius: "50%", background: C.primary, display: "flex", alignItems: "center", justifyContent: "center", color: C.white, fontSize: "24px", fontWeight: 800 }}>
                {data.school.name?.charAt(0) || "S"}
              </div>
            )}
          </div>
          
          <div style={{ flex: 1, textAlign: "center" }}>
            <h1 style={{ fontSize: "22px", fontWeight: 800, color: C.primary, textTransform: "uppercase", margin: "0 0 4px", letterSpacing: "0.5px" }}>{data.school.name}</h1>
            {data.school.motto && <p style={{ fontSize: "10px", fontStyle: "italic", color: C.gray600, margin: "0 0 6px" }}>{data.school.motto}</p>}
            <p style={{ fontSize: "9px", color: C.gray700, margin: 0 }}>
              {data.school.address || "School Address Not Provided"} {data.school.phone ? `| Tel: ${data.school.phone}` : ""} {data.school.email ? `| Email: ${data.school.email}` : ""}
            </p>
          </div>

          <div style={{ width: "80px", textAlign: "right", flexShrink: 0 }}>
            <div style={{ background: C.primary, color: C.white, padding: "4px 8px", borderRadius: "4px", display: "inline-block" }}>
              <p style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", margin: 0, textAlign: "center" }}>Report</p>
              <p style={{ fontSize: "8px", fontWeight: 600, margin: 0, textAlign: "center" }}>CARD</p>
            </div>
          </div>
        </div>

        {/* TERM INFO BANNER */}
        <div style={{ display: "flex", justifyContent: "space-between", background: C.gray50, padding: "6px 12px", borderRadius: "6px", marginBottom: "16px", border: `1px solid ${C.gray200}` }}>
          <div style={{ fontSize: "10px" }}><span style={{ color: C.gray500 }}>Academic Session:</span> <strong style={{ color: C.black }}>{data.termInfo.session}</strong></div>
          <div style={{ fontSize: "10px" }}><span style={{ color: C.gray500 }}>Term:</span> <strong style={{ color: C.black }}>{data.termInfo.term}</strong></div>
        </div>

        {/* STUDENT BIO SECTION */}
        <div style={{ display: "flex", gap: "16px", marginBottom: "20px" }}>
          {/* Photo */}
          {s.show_photo && (
            <div style={{ width: "90px", height: "110px", border: `2px solid ${C.gray200}`, borderRadius: "6px", overflow: "hidden", flexShrink: 0, background: C.gray50, padding: "2px" }}>
              <div style={{ width: "100%", height: "100%", borderRadius: "4px", overflow: "hidden", background: C.white }}>
                {data.student.photo_url ? (
                  <img src={data.student.photo_url} alt="Student" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: C.gray400, fontSize: "10px" }}>No Photo</div>
                )}
              </div>
            </div>
          )}

          {/* Details Grid */}
          <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", fontSize: "10px", alignContent: "start" }}>
            <div style={{ borderBottom: `1px solid ${C.gray200}`, paddingBottom: "4px" }}>
              <span style={{ color: C.gray500, fontSize: "9px", textTransform: "uppercase", display: "block", marginBottom: "2px" }}>Student Name</span>
              <strong style={{ fontSize: "12px", color: C.black }}>{data.student.name}</strong>
            </div>
            
            <div style={{ borderBottom: `1px solid ${C.gray200}`, paddingBottom: "4px" }}>
              <span style={{ color: C.gray500, fontSize: "9px", textTransform: "uppercase", display: "block", marginBottom: "2px" }}>Admission Number</span>
              <strong style={{ fontSize: "12px", color: C.black }}>{data.student.admission_no || "—"}</strong>
            </div>

            <div style={{ borderBottom: `1px solid ${C.gray200}`, paddingBottom: "4px" }}>
              <span style={{ color: C.gray500, fontSize: "9px", textTransform: "uppercase", display: "block", marginBottom: "2px" }}>Class</span>
              <strong style={{ color: C.black }}>{data.classInfo.className}</strong>
            </div>

            {s.show_position && (
              <div style={{ borderBottom: `1px solid ${C.gray200}`, paddingBottom: "4px" }}>
                <span style={{ color: C.gray500, fontSize: "9px", textTransform: "uppercase", display: "block", marginBottom: "2px" }}>Position in Class</span>
                {data.classInfo.position ? (
                  <strong style={{ color: C.black }}>{ordinal(data.classInfo.position)} <span style={{ color: C.gray500, fontWeight: 400 }}>out of {data.classInfo.totalStudents}</span></strong>
                ) : (
                  <strong style={{ color: C.black }}>—</strong>
                )}
              </div>
            )}

            {s.show_gender && (
              <div style={{ borderBottom: `1px solid ${C.gray200}`, paddingBottom: "4px" }}>
                <span style={{ color: C.gray500, fontSize: "9px", textTransform: "uppercase", display: "block", marginBottom: "2px" }}>Gender</span>
                <strong style={{ color: C.black }}>{data.student.gender || "—"}</strong>
              </div>
            )}

            {s.show_dob && (
              <div style={{ borderBottom: `1px solid ${C.gray200}`, paddingBottom: "4px" }}>
                <span style={{ color: C.gray500, fontSize: "9px", textTransform: "uppercase", display: "block", marginBottom: "2px" }}>Date of Birth</span>
                <strong style={{ color: C.black }}>{data.student.dob ? new Date(data.student.dob).toLocaleDateString('en-GB') : "—"}</strong>
              </div>
            )}
          </div>

          {/* Highlights */}
          <div style={{ width: "140px", flexShrink: 0, display: "flex", flexDirection: "column", gap: "8px" }}>
            {s.show_average && (
              <div style={{ background: C.gray50, border: `1px solid ${C.gray200}`, borderRadius: "6px", padding: "8px", textAlign: "center" }}>
                <span style={{ color: C.gray500, fontSize: "9px", textTransform: "uppercase", display: "block" }}>Overall Average</span>
                <strong style={{ fontSize: "16px", color: C.primary }}>{data.academic.average.toFixed(2)}%</strong>
              </div>
            )}
            {s.show_attendance && (
              <div style={{ background: C.gray50, border: `1px solid ${C.gray200}`, borderRadius: "6px", padding: "8px", textAlign: "center" }}>
                <span style={{ color: C.gray500, fontSize: "9px", textTransform: "uppercase", display: "block" }}>Attendance</span>
                <strong style={{ fontSize: "14px", color: C.black }}>{data.attendance.daysPresent ?? "—"} <span style={{ fontSize: "10px", color: C.gray500 }}>/ {data.attendance.daysOpened ?? "—"}</span></strong>
              </div>
            )}
          </div>
        </div>

        {/* ACADEMIC RECORD TABLE */}
        <div style={{ flex: 1, marginBottom: "16px" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize, lineHeight: 1.4 }}>
            <thead>
              <tr style={{ background: C.primary, color: C.white }}>
                <th style={{ padding: "8px 6px", textAlign: "left", width: "24px", fontWeight: 700, borderTopLeftRadius: "6px" }}>S/N</th>
                <th style={{ padding: "8px 6px", textAlign: "left", fontWeight: 700 }}>SUBJECTS</th>
                
                {s.show_component_scores && components.map(c => (
                  <th key={c.id} style={{ padding: "8px 4px", textAlign: "center", width: "40px", fontWeight: 600, fontSize: "8px" }}>
                    {c.name}<br/><span style={{ opacity: 0.8 }}>({c.max_score})</span>
                  </th>
                ))}
                
                <th style={{ padding: "8px 6px", textAlign: "center", width: "45px", fontWeight: 700 }}>TOTAL<br/><span style={{ fontSize: "8px", fontWeight: 400, opacity: 0.8 }}>(100)</span></th>
                <th style={{ padding: "8px 6px", textAlign: "center", width: "40px", fontWeight: 700 }}>GRADE</th>
                <th style={{ padding: "8px 6px", textAlign: "left", width: "100px", fontWeight: 700, borderTopRightRadius: "6px" }}>REMARK</th>
              </tr>
            </thead>
            <tbody>
              {data.academic.subjects.map((sub, i) => (
                <tr key={sub.id} style={{ borderBottom: `1px solid ${C.gray200}`, background: i % 2 === 0 ? C.white : C.gray50 }}>
                  <td style={{ padding: rowH, textAlign: "center", color: C.gray500 }}>{i + 1}</td>
                  <td style={{ padding: rowH, fontWeight: 600, color: C.black }}>{sub.name}</td>
                  
                  {s.show_component_scores && components.map(c => (
                    <td key={c.id} style={{ padding: rowH, textAlign: "center", color: C.gray700 }}>
                      {sub.component_scores && sub.component_scores[c.id] !== undefined && sub.component_scores[c.id] !== null ? sub.component_scores[c.id] : "—"}
                    </td>
                  ))}
                  
                  <td style={{ padding: rowH, textAlign: "center", fontWeight: 700, color: C.black }}>{sub.total_score ?? "—"}</td>
                  <td style={{ padding: rowH, textAlign: "center", fontWeight: 800, color: C.primary }}>{sub.grade}</td>
                  <td style={{ padding: rowH, color: C.gray600, fontSize: "9px" }}>{sub.remark || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* BOTTOM SECTIONS */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginTop: "auto" }}>
          
          {/* Left Column: Traits & Grading */}
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            
            {/* Traits Grid */}
            <div style={{ display: "flex", gap: "12px" }}>
              {s.show_affective && data.traits.affective.length > 0 && (
                <div style={{ flex: 1 }}>
                  <h3 style={{ fontSize: "9px", fontWeight: 700, color: C.primary, textTransform: "uppercase", borderBottom: `1px solid ${C.gray200}`, paddingBottom: "4px", marginBottom: "6px", margin: 0 }}>Behavioural Traits</h3>
                  <div style={{ fontSize: "8px" }}>
                    {data.traits.affective.map((t, i) => (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", borderBottom: i !== data.traits.affective.length - 1 ? `1px dashed ${C.gray200}` : "none" }}>
                        <span style={{ color: C.gray600 }}>{t.name}</span>
                        <strong style={{ color: C.black }}>{t.score}/5</strong>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {s.show_psychomotor && data.traits.psychomotor.length > 0 && (
                <div style={{ flex: 1 }}>
                  <h3 style={{ fontSize: "9px", fontWeight: 700, color: C.primary, textTransform: "uppercase", borderBottom: `1px solid ${C.gray200}`, paddingBottom: "4px", marginBottom: "6px", margin: 0 }}>Psychomotor Skills</h3>
                  <div style={{ fontSize: "8px" }}>
                    {data.traits.psychomotor.map((t, i) => (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", borderBottom: i !== data.traits.psychomotor.length - 1 ? `1px dashed ${C.gray200}` : "none" }}>
                        <span style={{ color: C.gray600 }}>{t.name}</span>
                        <strong style={{ color: C.black }}>{t.score}/5</strong>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Grading Key */}
            {s.show_grading_key && data.gradingScales.length > 0 && (
              <div style={{ background: C.gray50, border: `1px solid ${C.gray200}`, borderRadius: "4px", padding: "6px 8px" }}>
                <h3 style={{ fontSize: "8px", fontWeight: 700, color: C.gray500, textTransform: "uppercase", margin: "0 0 4px" }}>Grading Key</h3>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 12px", fontSize: "8px" }}>
                  {data.gradingScales.map((g, i) => (
                    <div key={i} style={{ display: "flex", gap: "4px" }}>
                      <strong style={{ color: C.primary }}>{g.grade}</strong>
                      <span style={{ color: C.gray600 }}>{g.minimum_score} - {g.maximum_score}%</span>
                      {g.remark && <span style={{ color: C.gray400 }}>({g.remark})</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Remarks & Signatures */}
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            
            {s.show_teacher_remark && (
              <div style={{ border: `1px solid ${C.gray200}`, borderRadius: "6px", padding: "10px", background: C.gray50 }}>
                <h3 style={{ fontSize: "9px", fontWeight: 700, color: C.primary, textTransform: "uppercase", margin: "0 0 6px" }}>Class Teacher's Remark</h3>
                <p style={{ fontStyle: "italic", fontSize: "10px", color: C.black, margin: "0 0 16px", minHeight: "24px" }}>
                  {data.remarks.teacher || "No remark provided."}
                </p>
                <div style={{ borderTop: `1px solid ${C.gray300}`, paddingTop: "4px", display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: "8px", color: C.gray500 }}>Signature</span>
                  <span style={{ fontSize: "8px", color: C.gray500 }}>Date</span>
                </div>
              </div>
            )}

            {s.show_admin_remark && (
              <div style={{ border: `1px solid ${C.gray200}`, borderRadius: "6px", padding: "10px", background: C.gray50 }}>
                <h3 style={{ fontSize: "9px", fontWeight: 700, color: C.primary, textTransform: "uppercase", margin: "0 0 6px" }}>Principal's Remark</h3>
                <p style={{ fontStyle: "italic", fontSize: "10px", color: C.black, margin: "0 0 16px", minHeight: "24px" }}>
                  {data.remarks.admin || "No remark provided."}
                </p>
                <div style={{ borderTop: `1px solid ${C.gray300}`, paddingTop: "4px", display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: "8px", color: C.gray500 }}>Signature & Stamp</span>
                  <span style={{ fontSize: "8px", color: C.gray500 }}>Date</span>
                </div>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
