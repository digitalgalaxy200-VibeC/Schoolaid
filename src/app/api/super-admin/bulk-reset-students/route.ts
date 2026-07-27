import { NextResponse } from "next/server";
import { verifySuperAdmin } from "@/lib/api-auth";
import { getServiceClient } from "@/lib/supabase/service";

/** POST /api/super-admin/bulk-reset-students
 * Resets passwords for all students in a school to meet minimum requirements.
 * Body: { school_id }
 */
export async function POST(request: Request) {
  const { authorized } = await verifySuperAdmin(request);
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { school_id } = await request.json();
  if (!school_id) return NextResponse.json({ error: "school_id required" }, { status: 400 });

  const supabase = getServiceClient();

  // Get school abbreviation from school name
  const { data: school } = await supabase.from("schools").select("name").eq("id", school_id).single();
  const abbreviation = (school?.name || "SCH").replace(/[^A-Z]/g, "").substring(0, 4).toUpperCase() || "SCH";

  // Get all active students
  const { data: students } = await supabase
    .from("students")
    .select("id, profile_id, profiles(email)")
    .eq("school_id", school_id);

  if (!students?.length) return NextResponse.json({ error: "No students found" }, { status: 404 });

  let reset = 0;
  let failed = 0;
  const authUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users`;

  for (const student of students) {
    try {
      const profile = Array.isArray(student.profiles) ? student.profiles[0] : student.profiles;
      if (!profile?.email) { failed++; continue; }

      // Generate password that meets minimum: abbreviation x3 + 123, truncated to 72
      const password = `${abbreviation}${abbreviation}${abbreviation}123`.substring(0, 72);

      // Update Supabase Auth
      const authRes = await fetch(`${authUrl}/${student.profile_id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
        },
        body: JSON.stringify({ password }),
      });

      if (authRes.ok) {
        // Set must_change_password = true
        await supabase.from("students").update({ must_change_password: true }).eq("id", student.id);
        reset++;
      } else {
        failed++;
      }
    } catch {
      failed++;
    }
  }

  return NextResponse.json({
    success: true,
    total: students.length,
    reset,
    failed,
    message: `Reset ${reset} of ${students.length} student passwords. New password format: ${abbreviation}${abbreviation}${abbreviation}123`,
  });
}
