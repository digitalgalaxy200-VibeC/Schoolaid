import { NextResponse } from "next/server";
import { verifySchoolAdmin } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";
import { generateUniquePassword } from "@/lib/password";
import { setAuthUserPassword, authResetErrorMessage } from "@/lib/supabase/auth-users";

export async function POST(request: Request) {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { profile_id, role } = await request.json();
  if (!profile_id) return NextResponse.json({ error: "profile_id required" }, { status: 400 });

  const supabase = getServiceClient();
  const { data: school } = await supabase.from("schools").select("name").eq("id", school_id).single();
  if (!school) return NextResponse.json({ error: "School not found" }, { status: 404 });

  const password = await generateUniquePassword(school.name, role);
  const ip = request.headers.get("x-forwarded-for") || "";

  // Fetch the user's email from profiles (needed if we need to re-create the auth account).
  // Tenant guard: profile must belong to this school (RLS bypassed via service client).
  const { data: profile } = await supabase.from("profiles").select("email").eq("id", profile_id).eq("school_id", school_id).single();
  if (!profile) return NextResponse.json({ error: "Profile not found in this school" }, { status: 404 });

  // One shared path with the teacher reset route: PUT, and only create the
  // account when Supabase genuinely reports it missing (never on a read failure).
  const reset = await setAuthUserPassword({ userId: profile_id, email: profile.email ?? null, password });
  if (!reset.ok) {
    return NextResponse.json({ error: authResetErrorMessage(reset.reason) }, { status: 500 });
  }

  // Save generated_password and flag for forced change
  const table = role === "teacher" ? "teachers" : "students";
  await supabase.from(table).update({
    must_change_password: true,
    generated_password: password,
  }).eq("profile_id", profile_id);

  // Audit log
  await supabase.from("audit_logs").insert({ user_id: profile_id, school_id, event: "password_reset", ip_address: ip });

  return NextResponse.json({ password });
}
