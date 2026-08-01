import { NextResponse } from "next/server";
import { verifyTeacher } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";

/** GET /api/teacher/ai-import/status — check if AI import is enabled for this school */
export async function GET() {
  const { authorized, school_id } = await verifyTeacher();
  if (!authorized || !school_id) return NextResponse.json({ enabled: false });

  const supabase = getServiceClient();
  const { data } = await supabase
    .from("school_features")
    .select("is_enabled")
    .eq("school_id", school_id)
    .eq("feature_key", "ai_import")
    .maybeSingle();

  return NextResponse.json({ enabled: data?.is_enabled === true });
}

/** POST /api/teacher/ai-import/process — upload images + extract scores via AI */
export async function POST(request: Request) {
  const { authorized, school_id, userId } = await verifyTeacher();
  if (!authorized || !school_id || !userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Feature flag check
  const supabase = getServiceClient();
  const { data: flag } = await supabase
    .from("school_features")
    .select("is_enabled")
    .eq("school_id", school_id)
    .eq("feature_key", "ai_import")
    .maybeSingle();

  if (!flag?.is_enabled) return NextResponse.json({ error: "AI Import not enabled for this school" }, { status: 403 });

  try {
    const formData = await request.formData();
    const classId = formData.get("class_id") as string;
    const subjectId = formData.get("subject_id") as string;
    const termId = formData.get("term_id") as string;
    const imageFiles = formData.getAll("images") as File[];

    if (!classId || !subjectId || !termId) return NextResponse.json({ error: "class_id, subject_id, term_id required" }, { status: 400 });
    if (!imageFiles.length) return NextResponse.json({ error: "At least one image required" }, { status: 400 });

    // Build context for AI
    const [studentsRes, componentsRes, classRes] = await Promise.all([
      supabase.from("students").select("id, student_id, profiles(full_name)").eq("school_id", school_id).eq("class_id", classId),
      (async () => {
        // Resolve components via template
        const { data: link } = await supabase.from("class_components_templates").select("template_id").eq("class_id", classId).maybeSingle();
        const templateId = link?.template_id;
        if (templateId) {
          const { data } = await supabase.from("components_rows").select("id, name, maximum_score, display_order").eq("template_id", templateId).order("display_order");
          return { data };
        }
        const { data: schoolTemplate } = await supabase.from("components_templates").select("id").eq("school_id", school_id).limit(1).maybeSingle();
        if (schoolTemplate) {
          const { data } = await supabase.from("components_rows").select("id, name, maximum_score, display_order").eq("template_id", schoolTemplate.id).order("display_order");
          return { data };
        }
        return { data: [] };
      })(),
      supabase.from("classes").select("name, grade_level").eq("id", classId).single(),
    ]);

    const students = (studentsRes.data || []).map((s: any) => ({
      id: s.id,
      admission_no: s.student_id || "",
      name: Array.isArray(s.profiles) ? s.profiles[0]?.full_name || "Unknown" : s.profiles?.full_name || "Unknown",
    }));

    const components = (componentsRes.data || []).map((c: any) => ({
      id: c.id, name: c.name, max_score: c.maximum_score, display_order: c.display_order,
    }));

    // Upload images to storage
    const imageUrls: string[] = [];
    for (const file of imageFiles) {
      const ext = file.name.split(".").pop() || "jpg";
      const fileName = `ai-imports/${school_id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const buffer = Buffer.from(await file.arrayBuffer());
      await supabase.storage.from("avatars").upload(fileName, buffer, { contentType: file.type || "image/jpeg", upsert: false });
      const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(fileName);
      if (urlData?.publicUrl) imageUrls.push(urlData.publicUrl);
    }

    // Call AI service (mock for now — returns structured data based on context)
    const startTime = Date.now();
    const results = processImagesWithAI(imageUrls, students, components);
    const duration = Date.now() - startTime;

    // Create audit log
    const totalRows = results.reduce((s: number, r: any) => s + r.scores.length, 0);
    const matched = results.filter((r: any) => r.student_match_status === "matched").length;
    const confidences = results.flatMap((r: any) => r.scores.map((s: any) => s.confidence));
    const avgConf = confidences.length > 0 ? confidences.reduce((a: number, b: number) => a + b, 0) / confidences.length : 0;

    const { data: importLog } = await supabase.from("ai_import_logs").insert({
      school_id, teacher_id: userId, class_id: classId, subject_id: subjectId, term_id: termId,
      images_processed: imageFiles.length, rows_extracted: totalRows,
      rows_needing_review: results.filter((r: any) => r.student_match_status !== "matched").length,
      processing_duration_ms: duration, confidence_avg: Math.round(avgConf * 100) / 100,
    }).select("id").single();

    // Write detail rows
    if (importLog) {
      const details = results.flatMap((r: any) =>
        r.scores.map((s: any) => ({
          import_id: importLog.id, student_name_raw: r.student_name_raw, student_id: r.student_id,
          component_name_raw: s.component_name, component_id: s.component_id,
          score_raw: s.score_raw, score_parsed: s.score_parsed, confidence: s.confidence,
          match_status: r.student_match_status === "matched" && s.confidence >= 0.7 ? "matched" : "ambiguous",
        }))
      );
      if (details.length > 0) await supabase.from("ai_import_details").insert(details);
    }

    return NextResponse.json({ import_id: importLog?.id, results, summary: { total_rows: totalRows, matched, ambiguous: results.length - matched, processing_time_ms: duration } });
  } catch (err: any) {
    console.error("[ai-import] error:", err);
    return NextResponse.json({ error: err.message || "Processing failed" }, { status: 500 });
  }
}

/** Mock AI processing — replace with real Vision API call */
function processImagesWithAI(imageUrls: string[], students: any[], components: any[]) {
  // In production: send imageUrls + context to Google Vision / Tesseract / OpenAI Vision
  // For MVP: return sample extracted data using the provided context
  const results: any[] = [];
  const shuffled = [...students].sort(() => Math.random() - 0.5).slice(0, Math.min(15, students.length));

  for (const student of shuffled) {
    const scores = components.map((c: any) => {
      const existing = Math.random() > 0.7; // 30% chance of "existing score" simulation
      return {
        component_id: c.id,
        component_name: c.name,
        score_raw: existing ? "—" : String(Math.floor(Math.random() * (c.max_score || 100) * 0.9 + (c.max_score || 100) * 0.1)),
        score_parsed: existing ? null : Math.floor(Math.random() * (c.max_score || 100) * 0.9 + (c.max_score || 100) * 0.1),
        confidence: existing ? 1.0 : 0.85 + Math.random() * 0.15,
        has_existing_score: existing,
      };
    });

    results.push({
      student_id: student.id,
      student_name_raw: student.name,
      student_match_confidence: 0.9 + Math.random() * 0.1,
      student_match_status: "matched" as const,
      scores,
    });
  }

  return results;
}
