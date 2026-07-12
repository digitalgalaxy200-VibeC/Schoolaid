import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/service";
import { verifySuperAdmin } from "@/lib/api-auth";

export async function POST(request: Request) {
  const { authorized } = await verifySuperAdmin(request);
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getServiceClient();
  const { school_id } = await request.json();

  // Fetch school info for password prefix
  let prefix = "school";
  if (school_id) {
    const { data: school } = await supabase.from("schools").select("name, abbreviation").eq("id", school_id).single();
    prefix = school?.abbreviation || (school?.name || "school").substring(0, 5).toLowerCase().replace(/[^a-z]/g, "");
  }

  const results = { teachers: 0, students: 0, errors: [] as string[] };

  // ── Reset Teachers ──
  const { data: teachers } = await supabase.from("teachers").select("id, profile_id, profiles(email)").eq("school_id", school_id || undefined);
  for (const t of teachers || []) {
    try {
      const password = prefix.length < 5 ? `${prefix}${prefix}123` : `${prefix}123`;
      const userId = t.profile_id;
      const email = (t.profiles as any)?.email;

      if (!userId || !email) continue;

      // Update Supabase Auth
      await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}` },
        body: JSON.stringify({ password }),
      });

      // Update teacher record
      await supabase.from("teachers").update({ generated_password: password, must_change_password: true }).eq("id", t.id);
      results.teachers++;
    } catch (err: any) {
      results.errors.push(`Teacher ${t.id}: ${err.message}`);
    }
  }

  // ── Reset Students ──
  const { data: students } = await supabase.from("students").select("id, profile_id, profiles(email)").eq("school_id", school_id || undefined);
  for (const s of students || []) {
    try {
      const password = prefix.length < 5 ? `${prefix}${prefix}123` : `${prefix}123`;
      const userId = s.profile_id;
      const email = (s.profiles as any)?.email;

      if (!userId || !email) continue;

      await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}` },
        body: JSON.stringify({ password }),
      });

      await supabase.from("students").update({ generated_password: password, must_change_password: true }).eq("id", s.id);
      results.students++;
    } catch (err: any) {
      results.errors.push(`Student ${s.id}: ${err.message}`);
    }
  }

  return NextResponse.json({
    success: true,
    prefix,
    password_format: `${prefix}123`,
    ...results,
  });
}
