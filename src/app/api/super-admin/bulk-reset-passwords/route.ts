import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/service";
import { verifySuperAdmin } from "@/lib/api-auth";
import { generateUniquePassword } from "@/lib/password";

export async function POST(request: Request) {
  const { authorized } = await verifySuperAdmin(request);
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getServiceClient();
  const { school_id } = await request.json();

  const authUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users`;
  const headers = {
    "Content-Type": "application/json",
    apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
  };

  // Fetch all teachers and students (with their school name, needed to
  // generate each one's own password below).
  let tQuery = supabase.from("teachers").select("id, profile_id, profiles(email), schools(name)");
  let sQuery = supabase.from("students").select("id, profile_id, profiles(email), schools(name)");
  if (school_id) { tQuery = tQuery.eq("school_id", school_id); sQuery = sQuery.eq("school_id", school_id); }

  const [{ data: teachers }, { data: students }] = await Promise.all([tQuery, sQuery]);

  // Build all auth update requests. Previously every account in scope was
  // reset to the same hardcoded password ("school123") — a single shared,
  // weak, guessable credential across, potentially, the entire platform.
  // Each account now gets its own unique generated password, exactly like
  // the individual create/reset flows elsewhere in the app (the password is
  // stored per-account in generated_password, same as those flows, and is
  // cleared automatically once the account holder changes it — see
  // docs/CORRECTIONS_SECURITE.md).
  const authUpdates: Promise<any>[] = [];
  const dbUpdates: PromiseLike<any>[] = [];

  for (const t of teachers || []) {
    if (t.profile_id && (t.profiles as any)?.email) {
      const schoolName = (t.schools as any)?.name || "SCH";
      const password = await generateUniquePassword(supabase, "teacher", schoolName);
      authUpdates.push(fetch(`${authUrl}/${t.profile_id}`, { method: "PUT", headers, body: JSON.stringify({ password }) }));
      dbUpdates.push(supabase.from("teachers").update({ generated_password: password, must_change_password: true }).eq("id", t.id));
    }
  }
  for (const s of students || []) {
    if (s.profile_id && (s.profiles as any)?.email) {
      const schoolName = (s.schools as any)?.name || "SCH";
      const password = await generateUniquePassword(supabase, "student", schoolName);
      authUpdates.push(fetch(`${authUrl}/${s.profile_id}`, { method: "PUT", headers, body: JSON.stringify({ password }) }));
      dbUpdates.push(supabase.from("students").update({ generated_password: password, must_change_password: true }).eq("id", s.id));
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
    teachers: teachers?.length || 0,
    students: students?.length || 0,
    auth_updated: authOk,
    auth_failed: authFail,
    password_format: "unique per account (view each one in that user's row, not a single shared password)",
  });
}
