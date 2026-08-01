import { NextResponse } from "next/server";
import { verifyTeacher } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";

// ── Fuzzy matching ──────────────────────────────────────────────
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const d: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) d[i][0] = i;
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      d[i][j] = a[i - 1] === b[j - 1] ? d[i - 1][j - 1] : Math.min(d[i - 1][j], d[i][j - 1], d[i - 1][j - 1]) + 1;
    }
  }
  return d[m][n];
}

function similarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a.toLowerCase().trim(), b.toLowerCase().trim()) / maxLen;
}

/** Match a raw name to the closest student in the class roster */
function matchStudent(rawName: string, students: { id: string; name: string; admission_no: string }[]) {
  let bestScore = 0;
  let bestStudent: (typeof students)[0] | null = null;

  for (const s of students) {
    // full name match
    const scoreFull = similarity(rawName, s.name);
    // split name parts
    const rawParts = rawName.toLowerCase().trim().split(/\s+/);
    const stuParts = s.name.toLowerCase().trim().split(/\s+/);
    const scoreFirst = rawParts[0] && stuParts[0] ? similarity(rawParts[0], stuParts[0]) : 0;
    const scoreLast = rawParts[rawParts.length - 1] && stuParts[stuParts.length - 1] ? similarity(rawParts[rawParts.length - 1], stuParts[stuParts.length - 1]) : 0;
    const scoreAdm = similarity(rawName, s.admission_no);
    const combined = Math.max(scoreFull, scoreFirst * 0.6 + scoreLast * 0.4, scoreAdm * 0.95);

    if (combined > bestScore) {
      bestScore = combined;
      bestStudent = s;
    }
  }

  if (bestStudent && bestScore >= 0.6) {
    return { student: bestStudent, confidence: bestScore, status: bestScore >= 0.85 ? "matched" : "ambiguous" as const };
  }
  return { student: null, confidence: bestScore, status: "unmatched" as const };
}

// ── DeepSeek Vision API ─────────────────────────────────────────
const DEEPSEEK_BASE = "https://api.deepseek.com/v1";
const DEEPSEEK_MODEL = "deepseek-chat"; // supports vision via image_url content blocks

async function callDeepSeekVision(imageBase64: string, mimeType: string, contextPrompt: string): Promise<any> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error("DEEPSEEK_API_KEY not configured");

  const resp = await fetch(`${DEEPSEEK_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: DEEPSEEK_MODEL,
      max_tokens: 4000,
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: contextPrompt },
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
          ],
        },
      ],
    }),
  });

  if (!resp.ok) {
    const errBody = await resp.text().catch(() => "");
    throw new Error(`DeepSeek API error ${resp.status}: ${errBody.slice(0, 300)}`);
  }

  const json = await resp.json();
  const raw = json?.choices?.[0]?.message?.content;
  if (!raw) throw new Error("DeepSeek returned empty response");

  try {
    return JSON.parse(raw);
  } catch {
    // Sometimes the model wraps JSON in markdown fences
    const cleaned = raw.replace(/```(?:json)?\s*|\s*```/g, "").trim();
    return JSON.parse(cleaned);
  }
}

// ── Build context prompt for the AI ─────────────────────────────
function buildPrompt(students: { id: string; name: string; admission_no: string }[], components: { id: string; name: string; max_score: number }[], className: string) {
  const studentList = students.map(s => `- ${s.name} (Admission: ${s.admission_no})`).join("\n");
  const compList = components.map(c => `- "${c.name}" (max score: ${c.max_score})`).join("\n");

  return `You are an expert OCR and data extraction assistant for a school management system.

I am uploading a photo of an assessment sheet or mark book page for class "${className}".

Your task:
1. Look at the image and identify the table/grid of student scores.
2. For each row (student), extract the student's name exactly as written.
3. For each assessment component column, extract the numeric score.

Here are the students enrolled in this class (use for reference, but read the name from the image):
${studentList}

Here are the assessment components (columns) you should look for:
${compList}

IMPORTANT RULES:
- Only extract scores that are clearly visible in the image.
- If a score cell is empty, unclear, or contains non-numeric text (like "Abs", "—", "N/A"), return null for that score.
- If a student name is partially cut off or unreadable, mark it as low confidence.
- If you cannot identify which column a score belongs to, do not guess — skip it.
- Do NOT fabricate or estimate scores for empty cells.

Return a SINGLE JSON object with this exact structure:
{
  "students": [
    {
      "name": "John Doe",
      "name_confidence": 0.95,
      "scores": {
        "First Test": 18,
        "Second Test": 15,
        "Exam": 55
      }
    }
  ],
  "warnings": ["optional warning messages about any issues found"]
}

For the "scores" object, use the exact component names as provided above.
For each score value, provide the number (not a string). Use null if the cell is empty/unreadable.
For "name_confidence", use 0.0-1.0 where 1.0 means perfectly clear, 0.5 means partially legible.`;
}

// ── Convert File to base64 ──────────────────────────────────────
async function fileToBase64(file: File): Promise<{ base64: string; mimeType: string }> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const base64 = buffer.toString("base64");
  const mimeType = file.type || "image/jpeg";
  return { base64, mimeType };
}

// ── HTTP Handlers ───────────────────────────────────────────────

/** GET /api/teacher/ai-import — check if AI import is enabled for this school */
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

/** POST /api/teacher/ai-import — upload images + extract scores via DeepSeek Vision AI */
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

    // ── 1. Gather context ────────────────────────────────────
    const [studentsRes, componentsRes, classRes] = await Promise.all([
      supabase.from("students").select("id, student_id, profiles(full_name)").eq("school_id", school_id).eq("class_id", classId).order("profiles(full_name)"),
      (async () => {
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
      id: c.id,
      name: c.name,
      max_score: c.maximum_score,
      display_order: c.display_order,
    }));

    const className = classRes.data?.name || "Unknown";

    if (students.length === 0) return NextResponse.json({ error: "No students found in this class" }, { status: 400 });
    if (components.length === 0) return NextResponse.json({ error: "No assessment components configured for this class" }, { status: 400 });

    // ── 2. Upload images to Supabase Storage ─────────────────
    const imageUrls: string[] = [];
    for (const file of imageFiles) {
      const ext = file.name.split(".").pop() || "jpg";
      const fileName = `ai-imports/${school_id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const buffer = Buffer.from(await file.arrayBuffer());
      await supabase.storage.from("avatars").upload(fileName, buffer, { contentType: file.type || "image/jpeg", upsert: false });
      const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(fileName);
      if (urlData?.publicUrl) imageUrls.push(urlData.publicUrl);
    }

    // ── 3. Call DeepSeek Vision API ──────────────────────────
    const startTime = Date.now();
    let aiResults: any[] = [];

    if (process.env.DEEPSEEK_API_KEY && imageFiles[0]) {
      // Process first image with DeepSeek Vision (can be extended to process multiple)
      try {
        const { base64, mimeType } = await fileToBase64(imageFiles[0]);
        const prompt = buildPrompt(students, components, className);
        const aiResponse = await callDeepSeekVision(base64, mimeType, prompt);

        const extractedStudents = aiResponse?.students || [];

        // Match each extracted student to the real roster
        for (const extracted of extractedStudents) {
          const rawName = extracted.name || "Unknown";
          const match = matchStudent(rawName, students);

          const scores = components.map((c) => {
            const rawScore = extracted.scores?.[c.name];
            const hasExisting = false; // checked downstream
            if (rawScore === null || rawScore === undefined) {
              return {
                component_id: c.id,
                component_name: c.name,
                score_raw: String(rawScore ?? "—"),
                score_parsed: null,
                confidence: extracted.name_confidence ?? 0.5,
                has_existing_score: false,
              };
            }
            const parsed = parseFloat(String(rawScore));
            return {
              component_id: c.id,
              component_name: c.name,
              score_raw: String(rawScore),
              score_parsed: isNaN(parsed) ? null : parsed,
              confidence: extracted.name_confidence ?? 0.9,
              has_existing_score: false,
            };
          });

          aiResults.push({
            student_id: match.student?.id || null,
            student_name_raw: rawName,
            student_match_confidence: Math.round(match.confidence * 100) / 100,
            student_match_status: match.status,
            scores,
          });
        }

        // Add warnings if present
        if (aiResponse?.warnings?.length) {
          console.log("[ai-import] AI warnings:", aiResponse.warnings);
        }
      } catch (aiErr: any) {
        console.error("[ai-import] DeepSeek call failed:", aiErr.message);
        return NextResponse.json({ error: `AI processing failed: ${aiErr.message}. Please try again or check your API key configuration.` }, { status: 502 });
      }
    } else {
      // No API key configured — return error with guidance
      return NextResponse.json({ error: "AI Import is not configured. Please add DEEPSEEK_API_KEY to environment variables." }, { status: 501 });
    }

    const duration = Date.now() - startTime;

    // ── 4. Create audit log ──────────────────────────────────
    const totalRows = aiResults.reduce((s: number, r: any) => s + r.scores.length, 0);
    const matched = aiResults.filter((r: any) => r.student_match_status === "matched").length;
    const confidences = aiResults.flatMap((r: any) => r.scores.map((s: any) => s.confidence));
    const avgConf = confidences.length > 0 ? confidences.reduce((a: number, b: number) => a + b, 0) / confidences.length : 0;

    const { data: importLog } = await supabase.from("ai_import_logs").insert({
      school_id,
      teacher_id: userId,
      class_id: classId,
      subject_id: subjectId,
      term_id: termId,
      images_processed: imageFiles.length,
      rows_extracted: totalRows,
      rows_needing_review: aiResults.filter((r: any) => r.student_match_status !== "matched").length,
      processing_duration_ms: duration,
      confidence_avg: Math.round(avgConf * 100) / 100,
    }).select("id").single();

    // Write detail rows
    if (importLog) {
      const details = aiResults.flatMap((r: any) =>
        r.scores.map((s: any) => ({
          import_id: importLog.id,
          student_name_raw: r.student_name_raw,
          student_id: r.student_id,
          component_name_raw: s.component_name,
          component_id: s.component_id,
          score_raw: s.score_raw,
          score_parsed: s.score_parsed,
          confidence: s.confidence,
          match_status: r.student_match_status === "matched" && s.confidence >= 0.7 ? "matched" : "ambiguous",
        }))
      );
      if (details.length > 0) await supabase.from("ai_import_details").insert(details);
    }

    return NextResponse.json({
      import_id: importLog?.id,
      results: aiResults,
      summary: {
        total_rows: totalRows,
        matched,
        ambiguous: aiResults.length - matched,
        processing_time_ms: duration,
      },
    });
  } catch (err: any) {
    console.error("[ai-import] error:", err);
    return NextResponse.json({ error: err.message || "Processing failed" }, { status: 500 });
  }
}

/** PUT /api/teacher/ai-import — save confirmed scores to the database (teacher-reviewed) */
export async function PUT(request: Request) {
  const { authorized, school_id, userId } = await verifyTeacher();
  if (!authorized || !school_id || !userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getServiceClient();

  try {
    const body = await request.json();
    const { import_id, entries } = body as {
      import_id?: string;
      entries: { student_id: string; component_id: string; term_id: string; subject_id: string; class_id: string; score: number | null }[];
    };

    if (!entries?.length) return NextResponse.json({ error: "No entries to save" }, { status: 400 });

    let saved = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const entry of entries) {
      try {
        // Validate: check existing score
        if (entry.score !== null && entry.score !== undefined) {
          const { data: existing } = await supabase
            .from("assessment_scores")
            .select("id, score")
            .eq("student_id", entry.student_id)
            .eq("assessment_component_id", entry.component_id)
            .eq("term_id", entry.term_id)
            .eq("subject_id", entry.subject_id)
            .eq("school_id", school_id)
            .maybeSingle();

          if (existing) {
            // Update existing
            const { error: updErr } = await supabase
              .from("assessment_scores")
              .update({ score: entry.score, updated_at: new Date().toISOString() })
              .eq("id", existing.id);

            if (updErr) { errors.push(`${entry.student_id}/${entry.component_id}: ${updErr.message}`); continue; }
          } else {
            // Insert new
            const { error: insErr } = await supabase.from("assessment_scores").insert({
              student_id: entry.student_id,
              assessment_component_id: entry.component_id,
              term_id: entry.term_id,
              subject_id: entry.subject_id,
              class_id: entry.class_id,
              school_id,
              score: entry.score,
              created_by: userId,
            });

            if (insErr) {
              // If duplicate key violation, try update
              if (insErr.code === "23505") {
                const { error: updErr2 } = await supabase
                  .from("assessment_scores")
                  .update({ score: entry.score, updated_at: new Date().toISOString() })
                  .eq("student_id", entry.student_id)
                  .eq("assessment_component_id", entry.component_id)
                  .eq("term_id", entry.term_id)
                  .eq("subject_id", entry.subject_id);

                if (updErr2) { errors.push(`${entry.student_id}/${entry.component_id}: ${updErr2.message}`); continue; }
              } else {
                errors.push(`${entry.student_id}/${entry.component_id}: ${insErr.message}`);
                continue;
              }
            }
          }
          saved++;
        } else {
          skipped++;
        }
      } catch (e: any) {
        errors.push(`${entry.student_id}/${entry.component_id}: ${e.message}`);
      }
    }

    // Update audit log
    if (import_id) {
      await supabase
        .from("ai_import_logs")
        .update({ rows_imported: saved, rows_skipped: skipped, status: "saved" })
        .eq("id", import_id);
    }

    return NextResponse.json({ saved, skipped, errors: errors.length > 0 ? errors.slice(0, 10) : undefined });
  } catch (err: any) {
    console.error("[ai-import] save error:", err);
    return NextResponse.json({ error: err.message || "Save failed" }, { status: 500 });
  }
}
