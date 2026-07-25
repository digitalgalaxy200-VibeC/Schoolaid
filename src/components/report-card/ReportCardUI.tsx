"use client";

import React, { useRef } from "react";
import { ReportCardData } from "@/lib/types/report-card";

export function ReportCardUI({ data }: { data: ReportCardData }) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Split subjects into chunks if they exceed a certain length to maintain A4 layout?
  // We'll trust flex layout and A4 sizing for now. 

  return (
    <div
      ref={containerRef}
      id="report-card-ui"
      className="relative bg-white mx-auto overflow-hidden shadow-lg border border-gray-200 print:shadow-none print:border-none print:w-full print:max-w-none text-gray-900 font-sans"
      style={{
        // A4 aspect ratio 1:1.414. Standard A4 width is 210mm.
        // We'll use a fixed pixel width that scales down on smaller screens via CSS transform if needed, 
        // or just let it be responsive. For a true PDF/print layout, fixed dimensions often work best.
        width: "210mm",
        minHeight: "297mm",
        padding: "15mm",
        boxSizing: "border-box",
      }}
    >
      {/* Draft Watermark */}
      {data.isDraft && (
        <div className="absolute inset-0 pointer-events-none z-0 flex items-center justify-center overflow-hidden opacity-[0.04]">
          <div className="transform -rotate-45 text-[120px] font-black tracking-widest text-black whitespace-nowrap">
            NOT APPROVED
          </div>
        </div>
      )}

      <div className="relative z-10 flex flex-col h-full">
        {/* Header Section */}
        <header className="flex items-center border-b-[3px] border-primary pb-4 mb-6">
          <div className="w-24 h-24 flex-shrink-0 flex items-center justify-center mr-6">
            {data.school.logo_url ? (
              <img
                src={data.school.logo_url}
                alt="School Logo"
                className="max-w-full max-h-full object-contain"
              />
            ) : (
              <div className="w-full h-full bg-gray-100 border border-gray-300 flex items-center justify-center rounded text-xs text-gray-400">
                No Logo
              </div>
            )}
          </div>
          <div className="flex-1 text-center pr-24">
            <h1 className="text-3xl font-extrabold text-primary tracking-tight uppercase">
              {data.school.name}
            </h1>
            {data.school.motto && (
              <p className="text-sm font-medium italic text-gray-600 mt-1">
                "{data.school.motto}"
              </p>
            )}
            <p className="text-xs text-gray-500 mt-2 whitespace-pre-wrap">
              {data.school.address}
              {(data.school.phone || data.school.email) && (
                <>
                  <br />
                  {[data.school.phone, data.school.email].filter(Boolean).join(" | ")}
                </>
              )}
            </p>
          </div>
        </header>

        {/* Report Title */}
        <div className="text-center mb-6">
          <h2 className="text-lg font-bold uppercase tracking-widest text-gray-800 bg-gray-100 inline-block px-6 py-1 rounded-full border border-gray-200">
            Terminal Report Card
          </h2>
          <p className="text-sm font-semibold text-primary mt-2 uppercase tracking-wider">
            {data.termInfo.session} • {data.termInfo.term}
          </p>
        </div>

        {/* Student & Class Info Grid */}
        <div className="grid grid-cols-[100px_1fr] gap-6 mb-8 items-center bg-gray-50 p-4 rounded-xl border border-gray-200">
          <div className="w-[100px] h-[100px] flex-shrink-0 bg-white border-2 border-gray-300 rounded-lg overflow-hidden shadow-sm">
            {data.student.photo_url ? (
              <img
                src={data.student.photo_url}
                alt="Student Photo"
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-300">
                <svg className="w-12 h-12" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M24 20.993V24H0v-2.996A14.977 14.977 0 0112.004 15c4.904 0 9.26 2.354 11.996 5.993zM16.002 8.999a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-y-3 gap-x-6">
            <div>
              <p className="text-[10px] uppercase font-bold text-gray-500 tracking-wider">Student Name</p>
              <p className="text-base font-bold text-gray-900">{data.student.name}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-gray-500 tracking-wider">Admission Number</p>
              <p className="text-base font-bold text-gray-900">{data.student.admission_no || "N/A"}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-gray-500 tracking-wider">Class</p>
              <p className="text-base font-bold text-gray-900">{data.classInfo.className}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-gray-500 tracking-wider">Position</p>
              <p className="text-base font-bold text-primary">
                {data.classInfo.position ? `${ordinal(data.classInfo.position)} out of ${data.classInfo.totalStudents}` : "N/A"}
              </p>
            </div>
          </div>
        </div>

        {/* Academic Performance Table */}
        <div className="mb-6 rounded-lg overflow-hidden border border-gray-300 shadow-sm">
          <table className="w-full text-sm text-left">
            <thead className="bg-primary text-white uppercase text-[10px] font-bold tracking-wider">
              <tr>
                <th className="px-4 py-2 border-b border-r border-primary/20 w-12 text-center">S/N</th>
                <th className="px-4 py-2 border-b border-r border-primary/20">Subject</th>
                <th className="px-4 py-2 border-b border-r border-primary/20 text-center w-24">Score</th>
                <th className="px-4 py-2 border-b border-r border-primary/20 text-center w-20">Grade</th>
                <th className="px-4 py-2 border-b border-primary/20">Remark</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200 text-[11px]">
              {data.academic.subjects.length > 0 ? (
                data.academic.subjects.map((sub, i) => (
                  <tr key={sub.id} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                    <td className="px-4 py-1.5 border-r border-gray-200 text-center text-gray-500">{i + 1}</td>
                    <td className="px-4 py-1.5 border-r border-gray-200 font-semibold text-gray-800 uppercase">{sub.name}</td>
                    <td className="px-4 py-1.5 border-r border-gray-200 text-center font-medium">
                      {sub.total_score !== null ? sub.total_score : "—"}
                    </td>
                    <td className="px-4 py-1.5 border-r border-gray-200 text-center font-bold text-primary">
                      {sub.grade}
                    </td>
                    <td className="px-4 py-1.5 text-gray-600">{sub.remark}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-gray-500 italic">No academic records found</td>
                </tr>
              )}
            </tbody>
            {/* Grand Total Footer */}
            <tfoot className="bg-gray-100 font-bold border-t-2 border-gray-300">
              <tr>
                <td colSpan={2} className="px-4 py-2 text-right uppercase tracking-wider text-xs">Total:</td>
                <td className="px-4 py-2 text-center text-primary text-sm">{data.academic.grandTotal}</td>
                <td colSpan={2} className="px-4 py-2">
                  <div className="flex justify-between items-center text-xs">
                    <span>Average: <span className="text-primary text-sm ml-1">{data.academic.average.toFixed(1)}%</span></span>
                    <span>Overall Grade: <span className="text-primary text-sm ml-1">{data.academic.overallGrade}</span></span>
                  </div>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* 3-Column Layout for Attendance, Traits, Remarks */}
        <div className="grid grid-cols-12 gap-6 mt-auto">
          {/* Left Column: Attendance & Grading Scale */}
          <div className="col-span-4 space-y-6">
            <section className="border border-gray-300 rounded-lg overflow-hidden shadow-sm">
              <h3 className="bg-gray-100 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-700 border-b border-gray-300">
                Attendance
              </h3>
              <div className="p-3 grid grid-cols-3 gap-2 text-center divide-x divide-gray-200 bg-white">
                <div>
                  <p className="text-lg font-bold text-gray-800">{data.attendance.daysOpened ?? "—"}</p>
                  <p className="text-[9px] uppercase font-bold text-gray-500 mt-1">Opened</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-green-600">{data.attendance.daysPresent ?? "—"}</p>
                  <p className="text-[9px] uppercase font-bold text-gray-500 mt-1">Present</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-red-600">{data.attendance.daysAbsent ?? "—"}</p>
                  <p className="text-[9px] uppercase font-bold text-gray-500 mt-1">Absent</p>
                </div>
              </div>
            </section>

            {data.gradingScales.length > 0 && (
              <section className="border border-gray-300 rounded-lg overflow-hidden shadow-sm">
                <h3 className="bg-gray-100 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-700 border-b border-gray-300">
                  Grading Scale
                </h3>
                <div className="p-3 bg-white space-y-1">
                  {data.gradingScales.map((g, i) => (
                    <div key={i} className="flex items-center justify-between text-[10px]">
                      <span className="font-bold text-primary w-6">{g.grade}</span>
                      <span className="text-gray-500 flex-1">{g.minimum_score} - {g.maximum_score}</span>
                      <span className="text-gray-700 text-right font-medium">{g.remark}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>

          {/* Middle Column: Traits */}
          <div className="col-span-4 space-y-6">
            {(data.traits.psychomotor.length > 0 || data.traits.affective.length > 0) && (
              <section className="border border-gray-300 rounded-lg overflow-hidden shadow-sm h-full flex flex-col">
                <h3 className="bg-gray-100 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-700 border-b border-gray-300">
                  Behavioral & Psychomotor
                </h3>
                <div className="p-3 bg-white flex-1 space-y-3">
                  {data.traits.affective.length > 0 && (
                    <div>
                      <h4 className="text-[9px] font-bold text-gray-500 uppercase tracking-wider mb-1">Affective</h4>
                      <div className="space-y-1">
                        {data.traits.affective.map((t, i) => (
                          <div key={i} className="flex justify-between text-[10px] border-b border-gray-100 last:border-0 pb-1">
                            <span className="text-gray-700">{t.name}</span>
                            <span className="font-bold text-primary">{t.score}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {data.traits.psychomotor.length > 0 && (
                    <div>
                      <h4 className="text-[9px] font-bold text-gray-500 uppercase tracking-wider mb-1 mt-2">Psychomotor</h4>
                      <div className="space-y-1">
                        {data.traits.psychomotor.map((t, i) => (
                          <div key={i} className="flex justify-between text-[10px] border-b border-gray-100 last:border-0 pb-1">
                            <span className="text-gray-700">{t.name}</span>
                            <span className="font-bold text-primary">{t.score}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <p className="text-[8px] text-gray-400 italic text-center mt-2 pt-2 border-t border-gray-100">
                    * Ratings out of 5
                  </p>
                </div>
              </section>
            )}
          </div>

          {/* Right Column: Remarks & Signatures */}
          <div className="col-span-4 flex flex-col space-y-4">
            <section className="border border-gray-300 rounded-lg overflow-hidden shadow-sm bg-white p-3 flex-1">
              <h4 className="text-[9px] font-bold text-gray-500 uppercase tracking-wider mb-1">Form Teacher's Remark</h4>
              <p className="text-[11px] text-gray-800 italic min-h-[40px] leading-relaxed">
                {data.remarks.teacher || "—"}
              </p>
              <div className="mt-4 border-t border-dashed border-gray-300 pt-1 text-right">
                <span className="text-[9px] text-gray-400 uppercase">Sign / Date</span>
              </div>
            </section>

            <section className="border border-gray-300 rounded-lg overflow-hidden shadow-sm bg-white p-3 flex-1">
              <h4 className="text-[9px] font-bold text-gray-500 uppercase tracking-wider mb-1">Principal's Remark</h4>
              <p className="text-[11px] text-gray-800 italic min-h-[40px] leading-relaxed">
                {data.remarks.admin || "—"}
              </p>
              <div className="mt-4 border-t border-dashed border-gray-300 pt-1 text-right">
                <span className="text-[9px] text-gray-400 uppercase">Sign / Date</span>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
