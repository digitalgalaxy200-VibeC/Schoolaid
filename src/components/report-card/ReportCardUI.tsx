"use client";

import React from "react";
import { ReportCardData } from "@/lib/types/report-card";

// Colors extracted/approximated from the provided GS Apex Stars School screenshot
const C = {
  primaryBlue: "#2748A9",    // The main deep blue for headers, titles, text
  secondaryBlue: "#4774E8",  // Lighter blue for average, some text
  accentOrange: "#E78C20",   // Orange for motto, some borders
  bgGray: "#F6F7F9",         // Very light grayish blue background for the student info box
  borderGray: "#E1E4EA",     // Light gray for subtle borders
  textBlack: "#1A1A1A",      // Dark grey/black for regular text
  white: "#FFFFFF",
  successGreen: "#2E7D32",   // Green for Resumption
  yellowWarn: "#F9A825",     // Yellow/Gold for Vacation
};

function ordinal(n: number): string {
  if (!n) return "";
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export function ReportCardUI({ data }: { data: ReportCardData }) {
  // If subjects exceed ~16, we shrink padding aggressively
  const totalSubjects = data.academic.subjects.length;
  // Ensure maximum compactness so 22 subjects fit easily in the A4 bounds.
  // 1-page max vertical bounds approx: 297mm.
  // Padding for rows:
  const rowH = totalSubjects > 15 ? "2px 4px" : "4px 8px";
  const rowFontSize = totalSubjects > 15 ? "9px" : "10px";

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

  const components = (data.academic.assessmentComponents || []).sort((a, b) => a.order - b.order);

  // Totals calculations
  let obtainedMarks = 0;
  let obtainableMarks = 0;
  data.academic.subjects.forEach((sub) => {
    if (sub.total_score != null) {
      obtainedMarks += Number(sub.total_score);
      obtainableMarks += 100; // Standard 100 per subject
    }
  });

  return (
    <div
      id="report-card-ui"
      style={{
        width: "210mm",
        height: "297mm", // Enforce strict 1-page height
        padding: "6mm 8mm", // tight outer padding
        boxSizing: "border-box",
        background: C.white,
        color: C.textBlack,
        fontFamily: "'Inter', 'Sora', sans-serif",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Outer border to match the screenshot (thin gray/orange) */}
      <div style={{
        position: "absolute",
        top: "4mm", left: "4mm", right: "4mm", bottom: "4mm",
        border: `1px solid ${C.borderGray}`,
        pointerEvents: "none",
        zIndex: 50,
      }} />

      {/* Watermark */}
      {data.school.logo_url && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", opacity: 0.04, pointerEvents: "none", zIndex: 0 }}>
          <img src={data.school.logo_url} alt="" style={{ width: "350px", height: "350px", objectFit: "contain" }} />
        </div>
      )}

      {data.isDraft && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", opacity: 0.05, pointerEvents: "none", zIndex: 0 }}>
          <div style={{ transform: "rotate(-45deg)", fontSize: "140px", fontWeight: 900, letterSpacing: "0.2em", color: "red", whiteSpace: "nowrap" }}>DRAFT</div>
        </div>
      )}

      <div style={{ position: "relative", zIndex: 10, display: "flex", flexDirection: "column", height: "100%", gap: "6px" }}>

        {/* 1. TOP HEADER SECTION */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          {/* Logo */}
          <div style={{ width: "65px", height: "65px", borderRadius: "50%", border: `2px solid ${C.successGreen}`, padding: "2px", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
            {data.school.logo_url ? (
              <img src={data.school.logo_url} alt="Logo" style={{ width: "100%", height: "100%", objectFit: "contain", borderRadius: "50%" }} />
            ) : (
              <div style={{ fontWeight: 800, fontSize: "18px", color: C.primaryBlue }}>{data.school.name?.charAt(0) || "S"}</div>
            )}
          </div>
          
          {/* School Name & Info */}
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: "24px", fontWeight: 900, color: C.primaryBlue, textTransform: "uppercase", margin: "0 0 2px", letterSpacing: "0.5px", lineHeight: 1 }}>
              {data.school.name}
            </h1>
            <p style={{ fontSize: "10px", fontStyle: "italic", color: C.accentOrange, margin: "0 0 4px", fontWeight: 600 }}>
              "{data.school.motto || "Knowledge is Power"}"
            </p>
            <div style={{ display: "flex", gap: "12px", fontSize: "8px", color: C.primaryBlue, fontWeight: 600 }}>
              {data.school.phone && <span>📞 {data.school.phone}</span>}
              {data.school.email && <span>✉ {data.school.email}</span>}
              {/* Optional: if there was a website it would go here */}
            </div>
          </div>

          {/* Right Term Banner */}
          <div style={{ textAlign: "right", flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
            <div style={{ background: C.primaryBlue, color: C.white, padding: "4px 16px", borderRadius: "20px", display: "inline-block", marginBottom: "4px" }}>
              <span style={{ fontSize: "11px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "1px" }}>TERMLY REPORT</span>
            </div>
            <div style={{ fontSize: "8px", fontWeight: 700, color: C.textBlack }}>
              {data.termInfo.term.toUpperCase()} | {data.termInfo.session}
              <br/>SESSION
            </div>
          </div>
        </div>

        {/* 2. STUDENT BIO BOX */}
        <div style={{ background: C.bgGray, borderRadius: "8px", padding: "8px 12px", border: `1px solid ${C.borderGray}`, display: "flex", alignItems: "center", gap: "16px" }}>
          {/* Photo */}
          {s.show_photo && (
            <div style={{ width: "65px", height: "75px", borderRadius: "8px", border: `3px solid ${C.successGreen}`, flexShrink: 0, overflow: "hidden", background: C.primaryBlue }}>
              {data.student.photo_url ? (
                <img src={data.student.photo_url} alt="Student" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: C.white, fontSize: "8px" }}>No Photo</div>
              )}
            </div>
          )}

          {/* Core Info */}
          <div style={{ flex: 1, display: "grid", gridTemplateColumns: "2.5fr 1fr 1fr", gap: "8px" }}>
            <div>
              <span style={{ color: C.primaryBlue, fontSize: "7px", textTransform: "uppercase", fontWeight: 700, display: "block" }}>NAME OF STUDENT</span>
              <strong style={{ fontSize: "14px", color: C.primaryBlue, fontWeight: 900, textTransform: "uppercase", display: "block", lineHeight: 1.1, marginTop: "2px" }}>
                {data.student.name}
              </strong>
              <div style={{ fontSize: "8px", color: C.textBlack, fontWeight: 600, marginTop: "4px" }}>ADM: {data.student.admission_no || "N/A"}</div>
            </div>
            
            <div>
              <span style={{ color: C.primaryBlue, fontSize: "7px", textTransform: "uppercase", fontWeight: 700, display: "block" }}>LEVEL / CLASS</span>
              <strong style={{ fontSize: "11px", color: C.textBlack, fontWeight: 800, marginTop: "2px", display: "block" }}>{data.classInfo.className}</strong>
            </div>

            <div>
              {s.show_gender && (
                <>
                  <span style={{ color: C.primaryBlue, fontSize: "7px", textTransform: "uppercase", fontWeight: 700, display: "block" }}>GENDER</span>
                  <strong style={{ fontSize: "11px", color: C.textBlack, fontWeight: 800, marginTop: "2px", display: "block", textTransform: "capitalize" }}>{data.student.gender || "—"}</strong>
                </>
              )}
            </div>
          </div>

          {/* Average */}
          {s.show_average && (
            <div style={{ textAlign: "right", paddingLeft: "12px" }}>
              <span style={{ color: C.primaryBlue, fontSize: "7px", textTransform: "uppercase", fontWeight: 700, display: "block" }}>AVERAGE</span>
              <strong style={{ fontSize: "28px", color: C.primaryBlue, fontWeight: 900, display: "block", lineHeight: 1 }}>{data.academic.average.toFixed(1)}%</strong>
            </div>
          )}
        </div>

        {/* 3. FOUR SUMMARY BOXES ROW */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "8px" }}>
          {/* Box 1: Marks */}
          <div style={{ background: C.primaryBlue, borderRadius: "6px", padding: "6px 8px", color: C.white, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "7px", fontWeight: 700 }}>TOTAL MARKS<br/>OBTAINED</span>
              <span style={{ fontSize: "14px", fontWeight: 800 }}>{obtainedMarks}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "4px" }}>
              <span style={{ fontSize: "7px", fontWeight: 700 }}>TOTAL OBTAINABLE<br/>MARKS</span>
              <span style={{ fontSize: "14px", fontWeight: 800 }}>{obtainableMarks}</span>
            </div>
          </div>

          {/* Box 2: Attendance */}
          {s.show_attendance && (
            <div style={{ background: C.bgGray, border: `1px solid ${C.primaryBlue}`, borderRadius: "6px", padding: "6px 8px" }}>
              <span style={{ fontSize: "7px", fontWeight: 800, color: C.primaryBlue, display: "block", marginBottom: "4px" }}>ATTENDANCE RECORD</span>
              <div style={{ display: "flex", justifyContent: "space-between", textAlign: "center" }}>
                <div>
                  <span style={{ fontSize: "5px", fontWeight: 700, color: C.textBlack, display: "block" }}>NO DAYS SCHOOL<br/>OPENED</span>
                  <span style={{ fontSize: "12px", fontWeight: 800, color: C.primaryBlue }}>{data.attendance.daysOpened ?? "—"}</span>
                </div>
                <div>
                  <span style={{ fontSize: "5px", fontWeight: 700, color: C.successGreen, display: "block" }}>NO OF DAYS<br/>PRESENT</span>
                  <span style={{ fontSize: "12px", fontWeight: 800, color: C.successGreen }}>{data.attendance.daysPresent ?? "—"}</span>
                </div>
                <div>
                  <span style={{ fontSize: "5px", fontWeight: 700, color: "red", display: "block" }}>NO OF DAYS<br/>ABSENT</span>
                  <span style={{ fontSize: "12px", fontWeight: 800, color: "red" }}>
                    {data.attendance.daysOpened && data.attendance.daysPresent 
                      ? data.attendance.daysOpened - data.attendance.daysPresent 
                      : "—"}
                  </span>
                </div>
              </div>
            </div>
          )}
          {!s.show_attendance && <div />}

          {/* Box 3: Vacation */}
          <div style={{ background: "#FFFDF5", border: `1px solid ${C.yellowWarn}`, borderRadius: "6px", padding: "6px 8px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
            <span style={{ fontSize: "7px", fontWeight: 800, color: C.yellowWarn, display: "block" }}>VACATION</span>
            <span style={{ fontSize: "12px", fontWeight: 800, color: C.textBlack, marginTop: "2px" }}>
               {/* Use standard placeholder or data if available */}
               {data.termInfo.term.toLowerCase().includes("third") ? "2026-07-24" : "2026-04-17"}
            </span>
          </div>

          {/* Box 4: Resumption */}
          <div style={{ background: "#F5FDF7", border: `1px solid ${C.successGreen}`, borderRadius: "6px", padding: "6px 8px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
            <span style={{ fontSize: "7px", fontWeight: 800, color: C.successGreen, display: "block" }}>RESUMPTION</span>
            <span style={{ fontSize: "12px", fontWeight: 800, color: C.textBlack, marginTop: "2px" }}>
               {data.termInfo.term.toLowerCase().includes("third") ? "2026-09-14" : "2026-05-04"}
            </span>
          </div>
        </div>

        {/* 4. MAIN SUBJECTS TABLE */}
        <div style={{ flex: 1, border: `1px solid ${C.borderGray}`, borderRadius: "8px", overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: rowFontSize, lineHeight: 1.1 }}>
            <thead>
              <tr style={{ background: C.primaryBlue, color: C.white }}>
                <th style={{ padding: "6px 8px", textAlign: "left", fontWeight: 800, textTransform: "uppercase" }}>SUBJECT REPERTOIRE</th>
                
                {s.show_component_scores && components.map(c => (
                  <th key={c.id} style={{ padding: "6px 4px", textAlign: "center", fontWeight: 800, width: "50px" }}>
                    {c.name.substring(0, 4).toUpperCase()} [{c.max_score}]
                  </th>
                ))}
                
                <th style={{ padding: "6px 4px", textAlign: "center", fontWeight: 800, width: "50px" }}>TOTAL</th>
                <th style={{ padding: "6px 8px", textAlign: "center", fontWeight: 800, width: "100px" }}>REMARK</th>
              </tr>
            </thead>
            <tbody>
              {data.academic.subjects.map((sub, i) => (
                <tr key={sub.id} style={{ borderBottom: `1px solid ${C.borderGray}`, background: i % 2 === 0 ? C.bgGray : C.white }}>
                  <td style={{ padding: rowH, fontWeight: 800, color: C.textBlack, textTransform: "uppercase" }}>{sub.name}</td>
                  
                  {s.show_component_scores && components.map(c => (
                    <td key={c.id} style={{ padding: rowH, textAlign: "center", fontWeight: 700, color: C.textBlack }}>
                      {sub.component_scores && sub.component_scores[c.id] !== undefined && sub.component_scores[c.id] !== null ? sub.component_scores[c.id] : "—"}
                    </td>
                  ))}
                  
                  <td style={{ padding: rowH, textAlign: "center", fontWeight: 900, color: C.secondaryBlue }}>{sub.total_score ?? "—"}</td>
                  <td style={{ padding: rowH, textAlign: "center", fontWeight: 800, color: C.textBlack, textTransform: "uppercase" }}>{sub.remark || "—"}</td>
                </tr>
              ))}
              {/* Fill empty rows if there are too few subjects, to maintain table shape if desired. We'll leave it responsive. */}
            </tbody>
          </table>
        </div>

        {/* 5. GRADING PERFORMANCE KEY */}
        {s.show_grading_key && data.gradingScales.length > 0 && (
          <div style={{ border: `1px solid ${C.borderGray}`, borderRadius: "20px", padding: "4px 16px", display: "flex", alignItems: "center", gap: "12px" }}>
            <span style={{ fontSize: "7px", fontWeight: 800, color: C.textBlack, textTransform: "uppercase" }}>GRADING PERFORMANCE KEY:</span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "16px", flex: 1, justifyContent: "center" }}>
              {data.gradingScales.map((g, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "7px", fontWeight: 700 }}>
                  <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: C.primaryBlue }} />
                  <span>{g.minimum_score}-{g.maximum_score} <span style={{ color: C.secondaryBlue }}>[{g.grade}]</span></span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 6. BOTTOM ROW: TRAITS & REMARKS */}
        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr", gap: "12px", marginTop: "4px" }}>
          
          {/* Traits Column */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
            {s.show_affective && (
              <div>
                <h3 style={{ fontSize: "7px", fontWeight: 800, color: C.primaryBlue, textTransform: "uppercase", margin: "0 0 6px" }}>AFFECTIVE DOMAIN</h3>
                {data.traits.affective.map((t, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2px" }}>
                    <span style={{ fontSize: "7px", fontWeight: 700, color: C.textBlack, width: "60%" }}>{t.name}</span>
                    <div style={{ display: "flex", gap: "2px" }}>
                      {[1, 2, 3, 4, 5].map(star => (
                        <div key={star} style={{
                          width: "5px", height: "5px", borderRadius: "50%",
                          border: `1px solid ${C.primaryBlue}`,
                          background: star <= (t.score || 0) ? C.primaryBlue : "transparent"
                        }} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
            
            {s.show_psychomotor && (
              <div>
                <h3 style={{ fontSize: "7px", fontWeight: 800, color: C.primaryBlue, textTransform: "uppercase", margin: "0 0 6px" }}>PSYCHOMOTOR DOMAIN</h3>
                {data.traits.psychomotor.map((t, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2px" }}>
                    <span style={{ fontSize: "7px", fontWeight: 700, color: C.textBlack, width: "60%" }}>{t.name}</span>
                    <div style={{ display: "flex", gap: "2px" }}>
                      {[1, 2, 3, 4, 5].map(star => (
                        <div key={star} style={{
                          width: "5px", height: "5px", borderRadius: "50%",
                          border: `1px solid ${C.primaryBlue}`,
                          background: star <= (t.score || 0) ? C.primaryBlue : "transparent"
                        }} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Teacher Remark */}
          {s.show_teacher_remark && (
            <div style={{ borderLeft: `3px solid ${C.accentOrange}`, paddingLeft: "8px" }}>
              <h3 style={{ fontSize: "7px", fontWeight: 800, color: C.accentOrange, textTransform: "uppercase", margin: "0 0 4px" }}>TEACHER REMARK</h3>
              <p style={{ fontSize: "8px", fontStyle: "italic", fontWeight: 700, color: C.textBlack, lineHeight: 1.3, margin: 0 }}>
                "{data.remarks.teacher || "No remark provided."}"
              </p>
            </div>
          )}

          {/* Principal Remark */}
          {s.show_admin_remark && (
            <div style={{ borderLeft: `3px solid ${C.primaryBlue}`, paddingLeft: "8px" }}>
              <h3 style={{ fontSize: "7px", fontWeight: 800, color: C.primaryBlue, textTransform: "uppercase", margin: "0 0 4px" }}>PRINCIPAL APPROVAL</h3>
              <p style={{ fontSize: "8px", fontStyle: "italic", fontWeight: 700, color: C.textBlack, lineHeight: 1.3, margin: 0 }}>
                "{data.remarks.admin || "No remark provided."}"
              </p>
            </div>
          )}

        </div>

        {/* 7. FOOTER MOTTO */}
        <div style={{ marginTop: "auto", textAlign: "center", borderTop: `2px solid ${C.primaryBlue}`, paddingTop: "4px" }}>
          <span style={{ fontSize: "10px", fontWeight: 900, fontStyle: "italic", color: C.primaryBlue, letterSpacing: "4px" }}>
            {data.school.motto ? data.school.motto.toUpperCase() : "R A I S I N G  G L O B A L  L E A D E R S"}
          </span>
        </div>

      </div>

      {/* Global Print Styles embedded for this exact component */}
      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          @page {
            size: A4 portrait;
            margin: 0 !important;
          }
          body {
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
          }
          #report-card-ui {
            width: 210mm !important;
            height: 297mm !important;
            margin: 0 !important;
            box-shadow: none !important;
            page-break-after: always;
            page-break-inside: avoid;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          /* Hide Next.js dev overlays during print if open */
          nextjs-portal { display: none !important; }
        }
      `}} />
    </div>
  );
}
