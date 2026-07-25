"use client";

import React from "react";
import { ReportCardData } from "@/lib/types/report-card";

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

const C = {
  primary: "#1a3d8f",
  white: "#ffffff",
  black: "#111827",
  gray50: "#f9fafb",
  gray100: "#f3f4f6",
  gray200: "#e5e7eb",
  gray300: "#d1d5db",
  gray400: "#9ca3af",
  gray500: "#6b7280",
  gray600: "#4b5563",
  gray700: "#374151",
  gray800: "#1f2937",
  green600: "#16a34a",
  red600: "#dc2626",
};

export function ReportCardUI({ data }: { data: ReportCardData }) {
  const manySubjects = data.academic.subjects.length > 15;
  const rowH = manySubjects ? "4px 4px" : "5px 6px";
  const fontSize = manySubjects ? "8px" : "9px";

  return (
    <div
      id="report-card-ui"
      style={{
        width: "210mm",
        minHeight: "297mm",
        padding: "6mm 8mm",
        boxSizing: "border-box",
        background: C.white,
        color: C.black,
        fontFamily: "Inter, system-ui, sans-serif",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {data.isDraft && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", opacity: 0.03, pointerEvents: "none", zIndex: 0 }}>
          <div style={{ transform: "rotate(-45deg)", fontSize: "100px", fontWeight: 900, letterSpacing: "0.2em", color: C.black, whiteSpace: "nowrap" }}>DRAFT</div>
        </div>
      )}

      <div style={{ position: "relative", zIndex: 10, display: "flex", flexDirection: "column", height: "100%" }}>

        {/* HEADER */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", paddingBottom: "3px", marginBottom: "3px", borderBottom: `2px solid ${C.primary}` }}>
          <div style={{ width: "32px", height: "32px", borderRadius: "50%", background: C.primary, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            {data.school.logo_url ? (
              <img src={data.school.logo_url} alt="" style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }} />
            ) : (
              <span style={{ color: C.white, fontSize: "12px", fontWeight: 700 }}>{data.school.name?.charAt(0) || "S"}</span>
            )}
          </div>
          <div style={{ flex: 1, textAlign: "center" }}>
            <h1 style={{ fontSize: "10px", fontWeight: 800, color: C.primary, textTransform: "uppercase", margin: 0, lineHeight: 1.2 }}>{data.school.name}</h1>
            {data.school.motto && <p style={{ fontSize: "7px", fontStyle: "italic", color: C.gray500, margin: 0 }}>{data.school.motto}</p>}
          </div>
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <p style={{ fontSize: "7px", fontWeight: 700, color: C.primary, textTransform: "uppercase", margin: 0 }}>Termly Report</p>
            <p style={{ fontSize: "6px", color: C.gray600, textTransform: "uppercase", margin: 0 }}>{data.termInfo.term} · {data.termInfo.session}</p>
          </div>
        </div>

        {/* STUDENT INFO ROW */}
        <div style={{ display: "flex", alignItems: "center", gap: "6px", background: C.gray50, border: `1px solid ${C.gray200}`, borderRadius: "4px", padding: "3px 5px", marginBottom: "3px", fontSize: "8px" }}>
          <div style={{ width: "24px", height: "30px", border: `1px solid ${C.gray300}`, borderRadius: "3px", overflow: "hidden", flexShrink: 0, background: C.white }}>
            {data.student.photo_url ? <img src={data.student.photo_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: C.gray300, fontSize: "6px" }}>Pic</div>}
          </div>
          <div style={{ flex: 1, lineHeight: 1.2 }}>
            <span style={{ fontWeight: 700 }}>{data.student.name}</span>
            <span style={{ color: C.gray500, marginLeft: "4px" }}>Adm: {data.student.admission_no || "—"}</span>
          </div>
          <span style={{ color: C.gray500 }}>Class: <b>{data.classInfo.className}</b></span>
          {data.classInfo.position && <span style={{ color: C.gray500 }}>Pos: <b>{ordinal(data.classInfo.position)}/{data.classInfo.totalStudents}</b></span>}
          <span style={{ fontWeight: 700, color: C.primary, fontSize: "10px" }}>{data.academic.average.toFixed(1)}%</span>
          <span style={{ color: C.gray400 }}>|</span>
          <span style={{ color: C.green600, fontWeight: 700 }}>{data.attendance.daysPresent ?? "—"}/{data.attendance.daysOpened ?? "—"} days</span>
          {data.attendance.daysAbsent ? <span style={{ color: C.red600, fontSize: "7px" }}>({data.attendance.daysAbsent} abs)</span> : null}
        </div>

        {/* SUBJECTS TABLE */}
        <div style={{ flex: 1, marginBottom: "2px" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize, lineHeight: 1.3 }}>
            <thead>
              <tr style={{ background: C.primary, color: C.white }}>
                <th style={{ padding: rowH, textAlign: "left", width: "20px", fontWeight: 700 }}>#</th>
                <th style={{ padding: rowH, textAlign: "left", fontWeight: 700 }}>SUBJECT</th>
                <th style={{ padding: rowH, textAlign: "center", width: "40px", fontWeight: 700 }}>SCORE</th>
                <th style={{ padding: rowH, textAlign: "center", width: "30px", fontWeight: 700 }}>GRD</th>
                <th style={{ padding: rowH, textAlign: "left", fontWeight: 700 }}>REMARK</th>
              </tr>
            </thead>
            <tbody>
              {data.academic.subjects.map((sub, i) => (
                <tr key={sub.id} style={{ borderBottom: `1px solid ${C.gray200}`, background: i % 2 === 0 ? C.white : C.gray50 }}>
                  <td style={{ padding: rowH, textAlign: "center", color: C.gray400 }}>{i + 1}</td>
                  <td style={{ padding: rowH, fontWeight: 600, textTransform: "uppercase" }}>{sub.name}</td>
                  <td style={{ padding: rowH, textAlign: "center", fontWeight: 500 }}>{sub.total_score ?? "—"}</td>
                  <td style={{ padding: rowH, textAlign: "center", fontWeight: 700, color: C.primary }}>{sub.grade}</td>
                  <td style={{ padding: rowH, color: C.gray600, fontSize: "7px" }}>{sub.remark}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: `2px solid ${C.primary}`, background: C.gray100, fontWeight: 700 }}>
                <td colSpan={2} style={{ padding: "3px 6px", textAlign: "right", fontSize: "7px", textTransform: "uppercase" }}>
                  Total: {data.academic.grandTotal} / {data.academic.maxPossibleTotal || "—"}
                </td>
                <td colSpan={3} style={{ padding: "3px 6px", textAlign: "right", fontSize: "7px" }}>
                  Avg: {data.academic.average.toFixed(1)}% · Grade: {data.academic.overallGrade}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* GRADING KEY */}
        {data.gradingScales.length > 0 && (
          <div style={{ fontSize: "6px", color: C.gray500, borderTop: `1px solid ${C.gray200}`, paddingTop: "2px", marginBottom: "2px", display: "flex", flexWrap: "wrap", gap: "2px 6px" }}>
            {data.gradingScales.map((g, i) => (
              <span key={i}><b style={{ color: C.primary }}>{g.grade}</b>={g.minimum_score}-{g.maximum_score}</span>
            ))}
          </div>
        )}

        {/* BOTTOM 3-COLUMN */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "6px", fontSize: "7px" }}>
          {/* Traits */}
          <div>
            {(data.traits.affective.length > 0 || data.traits.psychomotor.length > 0) && (
              <>
                <p style={{ fontWeight: 700, color: C.primary, textTransform: "uppercase", fontSize: "6px", margin: "0 0 2px", borderBottom: `1px solid ${C.gray200}`, paddingBottom: "2px" }}>Skills & Behaviour</p>
                {data.traits.affective.map((t, i) => (
                  <div key={`a-${i}`} style={{ display: "flex", justifyContent: "space-between", lineHeight: 1.4 }}>
                    <span>{t.name}</span><span style={{ fontWeight: 700 }}>{t.score}/5</span>
                  </div>
                ))}
                {data.traits.psychomotor.map((t, i) => (
                  <div key={`p-${i}`} style={{ display: "flex", justifyContent: "space-between", lineHeight: 1.4 }}>
                    <span>{t.name}</span><span style={{ fontWeight: 700 }}>{t.score}/5</span>
                  </div>
                ))}
              </>
            )}
          </div>

          {/* Teacher Remark */}
          <div style={{ borderLeft: `1px solid ${C.gray200}`, paddingLeft: "6px" }}>
            <p style={{ fontWeight: 700, color: C.primary, textTransform: "uppercase", fontSize: "6px", margin: "0 0 2px" }}>Teacher's Remark</p>
            <p style={{ fontStyle: "italic", lineHeight: 1.3, fontSize: "7px", margin: 0 }}>{data.remarks.teacher || "—"}</p>
            <p style={{ textAlign: "right", color: C.gray400, marginTop: "4px", margin: "4px 0 0" }}>___________</p>
            <p style={{ textAlign: "right", color: C.gray400, fontSize: "6px", margin: 0 }}>Sign / Date</p>
          </div>

          {/* Principal Remark */}
          <div style={{ borderLeft: `1px solid ${C.gray200}`, paddingLeft: "6px" }}>
            <p style={{ fontWeight: 700, color: C.primary, textTransform: "uppercase", fontSize: "6px", margin: "0 0 2px" }}>Principal's Remark</p>
            <p style={{ fontStyle: "italic", lineHeight: 1.3, fontSize: "7px", margin: 0 }}>{data.remarks.admin || "—"}</p>
            <p style={{ textAlign: "right", color: C.gray400, marginTop: "4px", margin: "4px 0 0" }}>___________</p>
            <p style={{ textAlign: "right", color: C.gray400, fontSize: "6px", margin: 0 }}>Sign / Date</p>
          </div>
        </div>

        {/* Footer */}
        {data.school.motto && (
          <p style={{ textAlign: "center", fontSize: "6px", fontWeight: 700, color: C.primary, textTransform: "uppercase", letterSpacing: "0.15em", marginTop: "4px", paddingTop: "2px", borderTop: `1px solid ${C.gray200}` }}>
            {data.school.motto}
          </p>
        )}
      </div>
    </div>
  );
}
