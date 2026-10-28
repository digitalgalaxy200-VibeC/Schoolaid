import { NextResponse } from "next/server";
import { verifySchoolAdmin } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";
import { loadGraduated } from "@/lib/promotion/service";
import type { GraduatedStudent } from "@/lib/promotion/types";

/**
 * GET /api/school-admin/graduated?search=&page=&limit=
 *
 * The dedicated Graduated section, grouped by the class the student graduated
 * from (the name is snapshotted at graduation, so a later class rename or
 * deletion does not erase the history).
 */
export async function GET(request: Request) {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized || !school_id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const search = (searchParams.get("search") || "").trim().toLowerCase();
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") || "100", 10)));

    const supabase = getServiceClient();
    const all = await loadGraduated(supabase, school_id);

    const filtered = search
      ? all.filter(
          (student) =>
            student.name.toLowerCase().includes(search) ||
            (student.admission_no || "").toLowerCase().includes(search),
        )
      : all;

    const total = filtered.length;
    const pageStudents = filtered.slice((page - 1) * limit, page * limit);

    // Group the current page by graduating class, in display order.
    const groupsMap = new Map<string, GraduatedStudent[]>();
    for (const student of pageStudents) {
      const key = student.graduation_class_name || "Unknown class";
      const bucket = groupsMap.get(key);
      if (bucket) bucket.push(student);
      else groupsMap.set(key, [student]);
    }

    const groups = Array.from(groupsMap.entries())
      .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }))
      .map(([class_name, students]) => ({
        class_name,
        count: students.length,
        students,
      }));

    return NextResponse.json({
      groups,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not load graduated students." },
      { status: 500 },
    );
  }
}
