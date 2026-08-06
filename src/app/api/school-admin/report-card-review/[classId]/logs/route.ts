import { NextResponse } from "next/server";
import { verifySchoolAdmin } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";
import { getActiveTerm } from "@/lib/report-card";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ classId: string }> }
) {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized || !school_id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { classId } = await params;
  const supabase = getServiceClient();

  const activeTerm = await getActiveTerm(school_id);
  const termId = activeTerm?.id;

  // Fetch workflow audit logs
  const { data: auditLogs } = await supabase
    .from("report_card_audit_logs")
    .select("action, details, created_at, profiles(full_name)")
    .eq("school_id", school_id)
    .eq("class_id", classId)
    .order("created_at", { ascending: false });

  // Fetch result edit logs (score changes after publishing)
  const { data: editLogs } = await supabase
    .from("result_edit_logs")
    .select("student_id, subject_id, edited_by, previous_grade, new_grade, previous_total, new_total, created_at")
    .eq("term_id", termId || "")
    .order("created_at", { ascending: false });

  // Resolve names for edit logs
  const studentIds = [...new Set((editLogs || []).map((e: any) => e.student_id))];
  const editorIds = [...new Set((editLogs || []).map((e: any) => e.edited_by).filter(Boolean))];

  const [studentsMap, editorsMap, subjectsMap] = await Promise.all([
    (async () => {
      if (studentIds.length === 0) return {};
      const { data } = await supabase.from("students").select("id, profiles(full_name)").in("id", studentIds);
      const map: Record<string, string> = {};
      for (const s of (data || [])) {
        const p = Array.isArray((s as any).profiles) ? (s as any).profiles[0] : (s as any).profiles;
        map[s.id] = p?.full_name || "Unknown";
      }
      return map;
    })(),
    (async () => {
      if (editorIds.length === 0) return {};
      const { data } = await supabase.from("profiles").select("id, full_name").in("id", editorIds);
      const map: Record<string, string> = {};
      for (const p of (data || [])) map[p.id] = p.full_name || "Unknown";
      return map;
    })(),
    (async () => {
      if (studentIds.length === 0) return {};
      const { data } = await supabase.from("subjects").select("id, name").eq("school_id", school_id);
      const map: Record<string, string> = {};
      for (const s of (data || [])) map[s.id] = s.name;
      return map;
    })(),
  ]);

  // Build combined timeline
  const timeline: { type: string; action: string; user: string; timestamp: string; detail: string; details?: any }[] = [];

  for (const log of (auditLogs || [])) {
    const profile = Array.isArray((log as any).profiles) ? (log as any).profiles[0] : (log as any).profiles;
    const user = profile?.full_name || "System";
    const action = (log as any).action;
    let detail = "";

    if (action === "submit") detail = "Class teacher submitted results for review";
    else if (action === "approve") detail = "School Admin approved and froze results";
    else if (action === "publish") detail = "Results published — now visible to students";
    else if (action === "retract") detail = `Results retracted: ${(log as any).details?.reason || "No reason provided"}`;
    else if (action === "republish") detail = "Results republished after corrections";
    else if (action === "return") detail = `Returned for correction: ${(log as any).details?.reason || ""}`;
    else if (action?.startsWith("save_")) detail = `Teacher saved ${action.replace(/_/g, " ")}`;
    else if (action === "admin_comment") detail = "Principal remark updated";
    else detail = action || "Unknown action";

    timeline.push({
      type: "workflow",
      action: action || "unknown",
      user,
      timestamp: (log as any).created_at,
      detail,
    });
  }

  for (const edit of (editLogs || [])) {
    const studentName = studentsMap[edit.student_id] || "Unknown Student";
    const subjectName = subjectsMap[edit.subject_id] || "Unknown Subject";
    const editor = editorsMap[edit.edited_by] || "Admin";

    timeline.push({
      type: "edit",
      action: "score_change",
      user: editor,
      timestamp: edit.created_at,
      detail: `${subjectName}: ${studentName} — ${edit.previous_grade || edit.previous_total || "?"} → ${edit.new_grade || edit.new_total || "?"}`,
      details: {
        studentName,
        subjectName,
        previousGrade: edit.previous_grade,
        newGrade: edit.new_grade,
        previousTotal: edit.previous_total,
        newTotal: edit.new_total,
      },
    });
  }

  // Sort by timestamp descending
  timeline.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return NextResponse.json({ timeline });
}
