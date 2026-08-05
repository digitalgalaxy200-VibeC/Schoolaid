import { NextResponse } from "next/server";
import { verifySchoolAdmin } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";
import { generateUniquePassword } from "@/lib/password";

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

  // Fetch the user's email from profiles (needed if we need to re-create the auth account)
  const { data: profile } = await supabase.from("profiles").select("email").eq("id", profile_id).single();

  // Try to update the existing auth user's password
  const authRes = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users/${profile_id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
    },
    body: JSON.stringify({
      password,
      user_metadata: { must_change_password: role !== "student" },
    }),
  });

  if (!authRes.ok) {
    const errorBody = await authRes.text();
    console.error("Auth update error (Supabase):", errorBody);

    const isUserMissing =
      errorBody.includes("Database error loading user") ||
      errorBody.includes("error loading user") ||
      errorBody.includes("User not found");

    // If the auth account is missing (e.g. auto-provisioned on staging), create it fresh
    if (isUserMissing && profile?.email) {
      const createRes = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
        },
        body: JSON.stringify({
          id: profile_id, // keep the same UUID so DB FK references stay intact
          email: profile.email,
          password,
          email_confirm: true,
          user_metadata: { must_change_password: role !== "student" },
        }),
      });

      if (!createRes.ok) {
        const createErr = await createRes.text();
        console.error("Auth create error (Supabase):", createErr);
        return NextResponse.json({ error: "The user account could not be set up. Please try again or contact support." }, { status: 500 });
      }
    } else {
      return NextResponse.json({ error: "Failed to reset the password. Please try again later." }, { status: 500 });
    }
  }

  // Save generated_password and flag for forced change (skip for students)
  const table = role === "teacher" ? "teachers" : "students";
  await supabase.from(table).update({
    must_change_password: role !== "student",
    generated_password: password,
  }).eq("profile_id", profile_id);

  // Audit log
  await supabase.from("audit_logs").insert({ user_id: profile_id, school_id, event: "password_reset", ip_address: ip });

  return NextResponse.json({ password });
}
