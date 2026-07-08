import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { ReportCardPDF } from "@/components/ReportCardPDF";
import React from "react";

export async function GET() {
  const dummyData = {
    studentName: "John Doe",
    admissionNumber: "STU-2026-001",
    schoolName: "Riverside Secondary School",
    schoolLogo: null, // React-PDF often has issues loading external placeholder images, keeping it null for safety
    schoolAddress: "123 Education Lane, Learning City",
    schoolPhone: "+1 234 567 8900",
    schoolEmail: "contact@riverside.edu",
    schoolMotto: "Excellence in Everything",
    session: "2025/2026",
    term: "First Term",
    results: [
      { subject: "Mathematics", totalScore: 85, grade: "A", remark: "Excellent" },
      { subject: "English Language", totalScore: 78, grade: "B", remark: "Very Good" },
      { subject: "Basic Science", totalScore: 92, grade: "A", remark: "Outstanding" },
      { subject: "Computer Studies", totalScore: 65, grade: "C", remark: "Good" },
      { subject: "Civic Education", totalScore: 88, grade: "A", remark: "Excellent" },
      { subject: "Physical Education", totalScore: 72, grade: "B", remark: "Very Good" }
    ],
    attendance: { days_school_opened: 65, days_present: 63, days_absent: 2 },
    psychomotor: [
      { name: "Handwriting", score: 4 },
      { name: "Sports", score: 5 },
      { name: "Drawing/Painting", score: 3 }
    ],
    affective: [
      { name: "Punctuality", score: 5 },
      { name: "Honesty", score: 4 },
      { name: "Neatness", score: 5 },
      { name: "Politeness", score: 5 }
    ],
    teacherComment: "John is a brilliant and well-behaved student. Keep it up!",
    adminComment: "An excellent result. Keep making us proud.",
    gradingScales: [
      { grade: "A", minimum_score: 70, maximum_score: 100, remark: "Excellent" },
      { grade: "B", minimum_score: 60, maximum_score: 69, remark: "Very Good" },
      { grade: "C", minimum_score: 50, maximum_score: 59, remark: "Good" },
      { grade: "P", minimum_score: 40, maximum_score: 49, remark: "Pass" },
      { grade: "F", minimum_score: 0, maximum_score: 39, remark: "Fail" }
    ]
  };

  try {
    const pdfBuffer = await renderToBuffer(
      React.createElement(ReportCardPDF, { data: dummyData })
    );

    return new NextResponse(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        // "inline" makes it open directly in the browser tab instead of downloading
        "Content-Disposition": "inline; filename=sample-report.pdf" 
      }
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
