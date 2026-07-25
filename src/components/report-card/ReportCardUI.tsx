"use client";

import React from "react";
import { ReportCardData } from "@/lib/types/report-card";

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export function ReportCardUI({ data }: { data: ReportCardData }) {
  const rowH = data.academic.subjects.length > 15 ? "py-0.5" : "py-1";
  const textSm = data.academic.subjects.length > 15 ? "text-[9px]" : "text-[10px]";

  return (
    <div
      id="report-card-ui"
      className="relative bg-white mx-auto text-gray-900 font-sans print:shadow-none print:border-none"
      style={{
        width: "210mm",
        minHeight: "297mm",
        padding: "8mm 10mm",
        boxSizing: "border-box",
      }}
    >
      {data.isDraft && (
        <div className="absolute inset-0 pointer-events-none z-0 flex items-center justify-center overflow-hidden opacity-[0.03]">
          <div className="transform -rotate-45 text-[100px] font-black tracking-widest text-black whitespace-nowrap">DRAFT</div>
        </div>
      )}

      <div className="relative z-10 h-full flex flex-col">

        {/* ── HEADER ── */}
        <div className="flex items-center gap-3 pb-1.5 mb-1.5 border-b-2 border-primary">
          <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
            {data.school.logo_url ? (
              <img src={data.school.logo_url} alt="" className="w-full h-full rounded-full object-cover" />
            ) : (
              <span className="text-white text-sm font-bold">{data.school.name?.charAt(0) || "S"}</span>
            )}
          </div>
          <div className="flex-1 text-center">
            <h1 className="text-[11px] font-extrabold text-primary uppercase leading-tight">{data.school.name}</h1>
            {data.school.motto && <p className="text-[7px] italic text-gray-500">{data.school.motto}</p>}
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-[8px] font-bold text-primary uppercase">Termly Report</p>
            <p className="text-[7px] text-gray-600 uppercase">{data.termInfo.term} · {data.termInfo.session}</p>
          </div>
        </div>

        {/* ── STUDENT INFO + ATTENDANCE (compact row) ── */}
        <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded px-2 py-1 mb-1.5 text-[9px]">
          <div className="w-8 h-10 border border-gray-300 rounded overflow-hidden flex-shrink-0 bg-white">
            {data.student.photo_url ? <img src={data.student.photo_url} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-gray-300 text-[7px]">Pic</div>}
          </div>
          <div className="flex-1 leading-tight">
            <span className="font-bold">{data.student.name}</span>
            <span className="text-gray-500 ml-2">Adm: {data.student.admission_no || "—"}</span>
          </div>
          <span className="text-gray-500">Class: <b>{data.classInfo.className}</b></span>
          {data.classInfo.position && <span className="text-gray-500">Pos: <b>{ordinal(data.classInfo.position)}/{data.classInfo.totalStudents}</b></span>}
          <span className="font-bold text-primary text-[11px]">{data.academic.average.toFixed(1)}%</span>
          <span className="text-gray-500">|</span>
          <span className="text-green-700 font-bold">{data.attendance.daysPresent ?? "—"}/{data.attendance.daysOpened ?? "—"}</span>
          <span className="text-red-600 text-[8px]">({data.attendance.daysAbsent ?? 0} abs)</span>
        </div>

        {/* ── SUBJECTS TABLE ── */}
        <div className="flex-1 mb-1">
          <table className="w-full border-collapse text-[9px] leading-tight">
            <thead>
              <tr className="bg-primary text-white">
                <th className="px-1.5 py-1 text-left w-6">#</th>
                <th className="px-1.5 py-1 text-left">SUBJECT</th>
                <th className="px-1.5 py-1 text-center w-12">SCORE</th>
                <th className="px-1.5 py-1 text-center w-10">GRD</th>
                <th className="px-1.5 py-1 text-left">REMARK</th>
              </tr>
            </thead>
            <tbody>
              {data.academic.subjects.map((sub, i) => (
                <tr key={sub.id} className={`border-b border-gray-200 ${i % 2 === 0 ? "bg-white" : "bg-gray-50/50"}`}>
                  <td className={`px-1.5 ${rowH} text-center text-gray-400`}>{i + 1}</td>
                  <td className={`px-1.5 ${rowH} font-semibold uppercase`}>{sub.name}</td>
                  <td className={`px-1.5 ${rowH} text-center font-medium`}>{sub.total_score ?? "—"}</td>
                  <td className={`px-1.5 ${rowH} text-center font-bold text-primary`}>{sub.grade}</td>
                  <td className={`px-1.5 ${rowH} text-gray-600 text-[8px]`}>{sub.remark}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-primary bg-gray-100 font-bold">
                <td colSpan={2} className="px-2 py-1 text-right text-[8px] uppercase">Total: {data.academic.grandTotal} / {data.academic.maxPossibleTotal || "—"}</td>
                <td colSpan={3} className="px-2 py-1 text-right text-[8px]">
                  Avg: {data.academic.average.toFixed(1)}% · Grade: {data.academic.overallGrade}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* ── BOTTOM: Grading Key + Traits + Remarks ── */}
        {data.gradingScales.length > 0 && (
          <div className="text-[7px] text-gray-500 border-t border-gray-200 pt-1 mb-1 flex flex-wrap gap-x-3 gap-y-0">
            {data.gradingScales.map((g, i) => (
              <span key={i}><b className="text-primary">{g.grade}</b>={g.minimum_score}-{g.maximum_score}</span>
            ))}
          </div>
        )}

        <div className="grid grid-cols-3 gap-2 text-[8px]">
          {/* Traits */}
          <div>
            {(data.traits.affective.length > 0 || data.traits.psychomotor.length > 0) && (
              <>
                <p className="font-bold text-primary uppercase text-[7px] mb-0.5 border-b border-gray-200 pb-0.5">Skills & Behaviour</p>
                {data.traits.affective.length > 0 && data.traits.affective.map((t, i) => (
                  <div key={`a-${i}`} className="flex justify-between"><span>{t.name}</span><span className="font-bold">{t.score}/5</span></div>
                ))}
                {data.traits.psychomotor.length > 0 && data.traits.psychomotor.map((t, i) => (
                  <div key={`p-${i}`} className="flex justify-between"><span>{t.name}</span><span className="font-bold">{t.score}/5</span></div>
                ))}
              </>
            )}
          </div>

          {/* Teacher Remark */}
          <div className="border-l border-gray-200 pl-2">
            <p className="font-bold text-primary uppercase text-[7px] mb-0.5">Teacher's Remark</p>
            <p className="italic leading-tight text-[8px]">{data.remarks.teacher || "—"}</p>
            <p className="text-right text-gray-400 mt-1">___________</p>
            <p className="text-right text-gray-400 text-[6px]">Sign / Date</p>
          </div>

          {/* Principal Remark */}
          <div className="border-l border-gray-200 pl-2">
            <p className="font-bold text-primary uppercase text-[7px] mb-0.5">Principal's Remark</p>
            <p className="italic leading-tight text-[8px]">{data.remarks.admin || "—"}</p>
            <p className="text-right text-gray-400 mt-1">___________</p>
            <p className="text-right text-gray-400 text-[6px]">Sign / Date</p>
          </div>
        </div>

        {/* Footer */}
        {data.school.motto && (
          <p className="text-center text-[7px] font-bold text-primary uppercase tracking-widest mt-2 pt-1 border-t border-gray-200">
            {data.school.motto}
          </p>
        )}
      </div>
    </div>
  );
}
