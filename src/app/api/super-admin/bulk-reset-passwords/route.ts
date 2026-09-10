import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/service";
import { verifySuperAdmin } from "@/lib/api-auth";

export async function POST(request: Request) {
  const { authorized } = await verifySuperAdmin(request);
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getServiceClient();
  const { school_id } = await request.json();

  // Safety: a school is REQUIRED — omitting it would reset every tenant's
  // passwords in one call (the foot-gun this guard removes).
  if (!school_id) return NextResponse.json({ error: "school_id is required — resets are per school" }, { status: 400 });

  const password = "school123";
  const authUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users`;
  const headers = {
    "Content-Type": "application/json",
    apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
  };

  // Fetch all teachers and students (school-scoped)
  const tQuery = supabase.from("teachers").select("id, profile_id, profiles(email)").eq("school_id", school_id);
  const sQuery = supabase.from("students").select("id, profile_id, profiles(email)").eq("school_id", school_id);

  const [{ data: teachers }, { data: students }] = await Promise.all([tQuery, sQuery]);

  // Build all auth update requests
  const authUpdates: Promise<any>[] = [];
  const dbUpdates: Promise<any>[] = [];

  for (const t of teachers || []) {
    if (t.profile_id && (t.profiles as any)?.email) {
      authUpdates.push(fetch(`${authUrl}/${t.profile_id}`, { method: "PUT", headers, body: JSON.stringify({ password }) }));
      dbUpdates.push(Promise.resolve(supabase.from("teachers").update({ generated_password: password, must_change_password: true }).eq("id", t.id)));
    }
  }
  for (const s of students || []) {
    if (s.profile_id && (s.profiles as any)?.email) {
      authUpdates.push(fetch(`${authUrl}/${s.profile_id}`, { method: "PUT", headers, body: JSON.stringify({ password }) }));
      dbUpdates.push(Promise.resolve(supabase.from("students").update({ generated_password: password, must_change_password: true }).eq("id", s.id)));
    }
  }

  // Run all in parallel (batches of 20 to avoid rate limiting)
  const BATCH = 20;
  let authOk = 0, authFail = 0;
  for (let i = 0; i < authUpdates.length; i += BATCH) {
    const batch = authUpdates.slice(i, i + BATCH);
    const results = await Promise.allSettled(batch);
    results.forEach(r => r.status === "fulfilled" ? authOk++ : authFail++);
  }
  await Promise.allSettled(dbUpdates);

  return NextResponse.json({
    success: true,
    password,
    teachers: teachers?.length || 0,
    students: students?.length || 0,
    auth_updated: authOk,
    auth_failed: authFail,
  });
}
