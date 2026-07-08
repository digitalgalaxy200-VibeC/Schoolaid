import { NextResponse } from "next/server";
import { verifyStudent } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";
import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { ReportCardPDF } from "@/components/ReportCardPDF";

/**
 * Generates a PDF report card, uploads to Supabase Storage,
 * and returns a signed download URL.
 */
export async function POST(request: Request) {
  const { authorized, school_id, userId } = await verifyStudent();
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { termId } = await request.json();
  if (!termId) return NextResponse.json({ error: "termId required" }, { status: 400 });

  const supabase = getServiceClient();

  // Find the student
  const { data: student } = await supabase
    .from("students")
    .select("id, profile_id, student_id, class_id")
    .eq("profile_id", userId)
    .single();

  if (!student) return NextResponse.json({ error: "Student not found" }, { status: 404 });

  // Also get profile for the student's name
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", userId)
    .single();

  // Fetch all report card data (same as report-card API)
  const [
    { data: termResults },
    { data: attendance },
    { data: psychomotor },
    { data: affective },
    { data: teacherComment },
    { data: adminComment },
    { data: gradingScales },
    { data: psychoDefs },
    { data: affectiveDefs },
    { data: school },
    { data: term },
  ] = await Promise.all([
    supabase.from("term_results")
      .select("id, subject_id, total_score, grade, remark, last_edited_at, subjects(name)")
      .eq("student_id", student.id).eq("term_id", termId).eq("published", true),
    supabase.from("attendance_records")
      .select("days_school_opened, days_present, days_absent")
      .eq("student_id", student.id).eq("term_id", termId).maybeSingle(),
    supabase.from("psychomotor_scores")
      .select("trait_id, score").eq("student_id", student.id).eq("term_id", termId),
    supabase.from("affective_scores")
      .select("trait_id, score").eq("student_id", student.id).eq("term_id", termId),
    supabase.from("teacher_comments")
      .select("comment").eq("student_id", student.id).eq("term_id", termId).maybeSingle(),
    supabase.from("school_admin_comments")
      .select("comment").eq("student_id", student.id).eq("term_id", termId).maybeSingle(),
    supabase.from("grading_scales")
      .select("grade, remark, minimum_score, maximum_score")
      .eq("school_id", school_id).order("minimum_score", { ascending: false }),
    supabase.from("psychomotor_definitions")
      .select("id, name").eq("school_id", school_id).order("display_order"),
    supabase.from("affective_definitions")
      .select("id, name").eq("school_id", school_id).order("display_order"),
    supabase.from("schools")
      .select("name, logo_url, address, phone, email, motto")
      .eq("id", school_id).single(),
    supabase.from("academic_terms")
      .select("name, session_id").eq("id", termId).single(),
  ]);

  // Get session name
  let sessionName = "";
  if (term?.session_id) {
    const { data: sess } = await supabase
      .from("academic_sessions").select("name")
      .eq("id", term.session_id).single();
    sessionName = sess?.name || "";
  }

  // Build structured data for PDF
  const psychoItems = (psychomotor || []).map((p) => {
    const def = (psychoDefs || []).find((d) => d.id === p.trait_id);
    return { name: def?.name || "Unknown", score: p.score };
  });

  const affectiveItems = (affective || []).map((a) => {
    const def = (affectiveDefs || []).find((d) => d.id === a.trait_id);
    return { name: def?.name || "Unknown", score: a.score };
  });

  const pdfData = {
    studentName: profile?.full_name || "Student",
    admissionNumber: student.student_id || "",
    schoolName: school?.name || "",
    schoolLogo: school?.logo_url || null,
    schoolAddress: school?.address || "",
    schoolPhone: school?.phone || "",
    schoolEmail: school?.email || "",
    schoolMotto: school?.motto || "",
    session: sessionName,
    term: term?.name || "",
    results: (termResults || []).map((r: any) => ({
      subject: r.subjects?.name || "",
      totalScore: Number(r.total_score),
      grade: r.grade,
      remark: r.remark || "",
    })),
    attendance: attendance || { days_school_opened: 0, days_present: 0, days_absent: 0 },
    psychomotor: psychoItems,
    affective: affectiveItems,
    teacherComment: teacherComment?.comment || "",
    adminComment: adminComment?.comment || "",
    gradingScales: gradingScales || [],
  };

  // Generate PDF buffer
  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await renderToBuffer(
      React.createElement(ReportCardPDF as any, { data: pdfData })
    );
  } catch (err) {
    console.error("[generate-pdf] PDF render failed:", err);
    return NextResponse.json({ error: "PDF generation failed" }, { status: 500 });
  }

  // Upload to Supabase Storage
  const fileName = `reports/${school_id}/${student.id}/${termId}-${Date.now()}.pdf`;

  const { error: uploadError } = await supabase.storage
    .from("generated-report-pdfs")
    .upload(fileName, pdfBuffer, {
      contentType: "application/pdf",
      upsert: true,
    });

  if (uploadError) {
    console.error("[generate-pdf] Upload failed:", uploadError);
    return NextResponse.json({ error: "Failed to upload PDF" }, { status: 500 });
  }

  // Generate signed URL (valid for 1 hour)
  const { data: signedData } = await supabase.storage
    .from("generated-report-pdfs")
    .createSignedUrl(fileName, 3600);

  if (!signedData?.signedUrl) {
    return NextResponse.json({ error: "Failed to generate download URL" }, { status: 500 });
  }

  return NextResponse.json({ downloadUrl: signedData.signedUrl });
}
