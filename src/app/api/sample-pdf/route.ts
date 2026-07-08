import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { ReportCardPDF } from "@/components/ReportCardPDF";

export async function GET() {
  const dummyData = {
    studentName: "John Doe",
    admissionNumber: "STU-2026-001",
    schoolName: "Riverside Secondary School",
    schoolLogo: null,
    schoolAddress: "123 Education Lane, Springfield",
    schoolPhone: "+1 (555) 010-1000",
    schoolEmail: "admin@riverside.edu",
    schoolMotto: "Knowledge is Power",
    session: "2024/2025",
    term: "First Term",
    className: "JSS 2",
    totalScore: 85,
    grade: "A",
    remark: "Excellent",
    attendance: { days_present: 45, days_absent: 5, days_school_opened: 50 },
    psychomotor: [{ name: "Punctuality", score: 5 }, { name: "Neatness", score: 4 }],
    affective: [{ name: "Honesty", score: 5 }],
    teacherComment: "Good performance",
    schoolAdminComment: "Keep it up",
    gradingScales: [
      { grade: "A", minimum_score: 70, maximum_score: 100, remark: "Excellent" },
      { grade: "B", minimum_score: 60, maximum_score: 69, remark: "Very Good" },
      { grade: "C", minimum_score: 50, maximum_score: 59, remark: "Good" },
      { grade: "D", minimum_score: 40, maximum_score: 49, remark: "Fair" },
      { grade: "F", minimum_score: 0, maximum_score: 39, remark: "Fail" },
    ],
  };

  try {
    // @ts-expect-error - react-pdf renderer type mismatch
    const pdfBuffer = await renderToBuffer(<ReportCardPDF data={dummyData} />);

    return new NextResponse(pdfBuffer, {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="sample-report.pdf"` },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
