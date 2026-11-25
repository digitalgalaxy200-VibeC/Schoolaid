import { NextResponse } from "next/server";
import { verifyTeacher } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";
import { getTeacherClassAccess } from "@/lib/students/teacher-class-access";
import { todayLocal } from "@/lib/finance/dates";
import {
  computeTermRollup,
  isAttendanceStatus,
  isFutureDate,
  isIsoDate,
  type AttendanceStatus,
  type DailyRow,
} from "@/lib/attendance/daily";
import { isLocked } from "@/lib/report-card";

/**
 * /api/teacher/attendance — the daily register.
 *
 * READS are open to any teacher assigned to the class (form or subject), so a
 * subject teacher can see who is in today.
 *
 * WRITES belong to the FORM teacher: a daily register is the class teacher's
 * record. An impersonating Super Admin may write any class.
 *
 * The request never names a school. `school_id` comes from the verified
 * session, and every class/student query is scoped by it.
 */

type StudentRow = {
  id: string;
  student_id: string | null;
  profiles:
    | { full_name: string | null; is_active: boolean | null }
    | { full_name: string | null; is_active: boolean | null }[]
    | null;
};

function profileOf(row: StudentRow) {
  return Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
}

function nameOf(row: StudentRow): string {
  return profileOf(row)?.full_name || row.student_id || "Unnamed student";
}

export async function GET(request: Request) {
  const { authorized, school_id, userId, all_classes } = await verifyTeacher();
  if (!authorized || !school_id || !userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const classId = (searchParams.get("class_id") || "").trim();
  const today = todayLocal();
  const date = (searchParams.get("date") || today).trim();

  if (!classId) return NextResponse.json({ error: "class_id required" }, { status: 400 });
  if (!isIsoDate(date)) return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  if (isFutureDate(date, today)) {
    return NextResponse.json({ error: "Attendance cannot be marked for a future date." }, { status: 400 });
  }

  const supabase = getServiceClient();

  if (!all_classes) {
    const access = await getTeacherClassAccess(supabase, {
      school_id,
      user_id: userId,
      class_id: classId,
    });
    if (!access.assigned) {
      return NextResponse.json({ error: "You are not assigned to this class" }, { status: 403 });
    }
  }

  const { data: cls } = await supabase
    .from("classes")
    .select("id, name")
    .eq("id", classId)
    .eq("school_id", school_id)
    .maybeSingle();
  if (!cls) return NextResponse.json({ error: "Class not found" }, { status: 404 });

  const [studentsRes, attendanceRes, termRes] = await Promise.all([
    supabase
      .from("students")
      .select("id, student_id, profiles!inner(full_name, is_active)")
      .eq("school_id", school_id)
      .eq("class_id", classId)
      .eq("profiles.is_active", true),
    supabase
      .from("attendance")
      .select("student_id, status, remarks")
      .eq("school_id", school_id)
      .eq("class_id", classId)
      .eq("date", date),
    supabase
      .from("academic_terms")
      .select("id, name, start_date, end_date")
      .eq("school_id", school_id)
      .eq("is_active", true)
      .maybeSingle(),
  ]);

  const marked = new Map<string, { status: string; remarks: string | null }>();
  for (const row of (attendanceRes.data || []) as {
    student_id: string;
    status: string;
    remarks: string | null;
  }[]) {
    marked.set(row.student_id, { status: row.status, remarks: row.remarks });
  }

  const students = ((studentsRes.data || []) as StudentRow[])
    .map((student) => ({
      id: student.id,
      name: nameOf(student),
      admissionNo: student.student_id,
      status: marked.get(student.id)?.status ?? null,
      remarks: marked.get(student.id)?.remarks ?? null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

  return NextResponse.json({
    class: { id: cls.id, name: cls.name },
    date,
    today,
    term: termRes.data || null,
    students,
    markedCount: marked.size,
  });
}

export async function POST(request: Request) {
  const { authorized, school_id, userId, all_classes } = await verifyTeacher();
  if (!authorized || !school_id || !userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const classId = typeof body.class_id === "string" ? body.class_id.trim() : "";
  const today = todayLocal();
  const date = typeof body.date === "string" ? body.date.trim() : "";
  const incoming = Array.isArray(body.records) ? body.records : [];

  if (!classId) return NextResponse.json({ error: "class_id required" }, { status: 400 });
  if (!isIsoDate(date)) return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  if (isFutureDate(date, today)) {
    return NextResponse.json({ error: "Attendance cannot be marked for a future date." }, { status: 400 });
  }
  if (incoming.length === 0) {
    return NextResponse.json({ error: "No attendance records were sent." }, { status: 400 });
  }
  if (incoming.length > 1000) {
    return NextResponse.json({ error: "Too many records for one register." }, { status: 400 });
  }

  const supabase = getServiceClient();

  if (!all_classes) {
    const access = await getTeacherClassAccess(supabase, {
      school_id,
      user_id: userId,
      class_id: classId,
    });
    if (!access.classTeacher) {
      return NextResponse.json(
        { error: "Only the class teacher can save the daily register." },
        { status: 403 },
      );
    }
  }

  const { data: cls } = await supabase
    .from("classes")
    .select("id")
    .eq("id", classId)
    .eq("school_id", school_id)
    .maybeSingle();
  if (!cls) return NextResponse.json({ error: "Class not found" }, { status: 404 });

  const { data: roster } = await supabase
    .from("students")
    .select("id, profiles!inner(is_active)")
    .eq("school_id", school_id)
    .eq("class_id", classId)
    .eq("profiles.is_active", true);

  const rosterIds = new Set(((roster || []) as { id: string }[]).map((row) => row.id));

  // Last entry for a student wins; anything not in this class is skipped rather
  // than written into another roster.
  const byStudent = new Map<string, { status: AttendanceStatus; remarks: string | null }>();
  for (const record of incoming as {
    student_id?: unknown;
    status?: unknown;
    remarks?: unknown;
  }[]) {
    const studentId = typeof record.student_id === "string" ? record.student_id : "";
    if (!studentId || !rosterIds.has(studentId)) continue;
    if (!isAttendanceStatus(record.status)) continue;
    const remarks =
      typeof record.remarks === "string" && record.remarks.trim()
        ? record.remarks.trim().slice(0, 500)
        : null;
    byStudent.set(studentId, { status: record.status, remarks });
  }

  if (byStudent.size === 0) {
    return NextResponse.json(
      { error: "None of the records belong to an active student in this class." },
      { status: 400 },
    );
  }

  const rows = Array.from(byStudent.entries()).map(([student_id, value]) => ({
    school_id,
    class_id: classId,
    student_id,
    date,
    status: value.status,
    remarks: value.remarks,
  }));

  const { error: saveError } = await supabase
    .from("attendance")
    .upsert(rows, { onConflict: "student_id,class_id,date" });

  if (saveError) {
    return NextResponse.json({ error: saveError.message }, { status: 500 });
  }

  // Roll the register into the term totals report cards print. If there is no
  // active term there is nothing to roll up; the daily rows are still saved.
  let termTotalsUpdated = false;
  let termLocked = false;
  let daysOpened = 0;

  const { data: term } = await supabase
    .from("academic_terms")
    .select("id, start_date, end_date")
    .eq("school_id", school_id)
    .eq("is_active", true)
    .maybeSingle();

  if (term) {
    const { data: submission } = await supabase
      .from("report_card_submissions")
      .select("status")
      .eq("school_id", school_id)
      .eq("class_id", classId)
      .eq("term_id", term.id)
      .maybeSingle();

    termLocked = isLocked(submission?.status);
  }

  if (term && !termLocked) {
    const { data: dailyRows } = await supabase
      .from("attendance")
      .select("student_id, date, status")
      .eq("school_id", school_id)
      .eq("class_id", classId)
      .gte("date", term.start_date)
      .lte("date", term.end_date);

    const rollup = computeTermRollup((dailyRows || []) as DailyRow[]);
    daysOpened = rollup.daysOpened;

    const studentIds = Array.from(rosterIds);
    if (studentIds.length > 0) {
      const termRows = studentIds.map((studentId) => {
        const present = rollup.presentByStudent.get(studentId) ?? 0;
        return {
          school_id,
          student_id: studentId,
          term_id: term.id,
          days_school_opened: rollup.daysOpened,
          days_present: present,
          days_absent: Math.max(0, rollup.daysOpened - present),
        };
      });

      const { error: rollupError } = await supabase
        .from("attendance_records")
        .upsert(termRows, { onConflict: "student_id,term_id" });

      if (rollupError) {
        console.error("[teacher/attendance] term roll-up failed:", rollupError.message);
      } else {
        termTotalsUpdated = true;
      }
    }
  }

  return NextResponse.json({
    saved: byStudent.size,
    skipped: Math.max(0, incoming.length - byStudent.size),
    termTotalsUpdated,
    termLocked,
    daysOpened,
  });
}
