import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/service";
import { verifySuperAdmin } from "@/lib/api-auth";

export async function POST(request: Request) {
  const { authorized } = await verifySuperAdmin(request);
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getServiceClient();
  const { school_id } = await request.json();

  const password = "school123";
  const results = { teachers: 0, students: 0, errors: [] as string[] };

  // ── Reset Teachers ──
  let tQuery = supabase.from("teachers").select("id, profile_id, profiles(email)");
  if (school_id) tQuery = tQuery.eq("school_id", school_id);
  const { data: teachers } = await tQuery;

  for (const t of teachers || []) {
    try {
      const userId = t.profile_id;
      const email = (t.profiles as any)?.email;
      if (!userId || !email) continue;

      await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}` },
        body: JSON.stringify({ password }),
      });
      await supabase.from("teachers").update({ generated_password: password, must_change_password: true }).eq("id", t.id);
      results.teachers++;
    } catch (err: any) {
      results.errors.push(`Teacher ${t.id}: ${err.message}`);
    }
  }

  // ── Reset Students ──
  let sQuery = supabase.from("students").select("id, profile_id, profiles(email)");
  if (school_id) sQuery = sQuery.eq("school_id", school_id);
  const { data: students } = await sQuery;

  for (const s of students || []) {
    try {
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

  return NextResponse.json({ success: true, password, ...results });
}
