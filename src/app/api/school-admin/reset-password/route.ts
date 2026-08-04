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

  // Update Supabase Auth
  const authRes = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users/${profile_id}`, {
    method: "PUT",
    headers: { 
      "Content-Type": "application/json", 
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!, 
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}` 
    },
    body: JSON.stringify({ 
      password,
      user_metadata: { must_change_password: true }
    }),
  });

  if (!authRes.ok) {
    const errorText = await authRes.text();
    console.error("Auth update error:", errorText);
    return NextResponse.json({ error: `Failed to update auth password: ${errorText}` }, { status: 500 });
  }

  // Set must_change_password = true and store the generated password so the PDF can print it
  const table = role === "teacher" ? "teachers" : "students";
  await supabase.from(table).update({ 
    must_change_password: true,
    generated_password: password 
  }).eq("profile_id", profile_id);

  // Log
  await supabase.from("password_history").update({ used_by: profile_id }).eq("password", password);
  await supabase.from("audit_logs").insert({ user_id: profile_id, school_id, event: "password_reset", ip_address: ip });

  return NextResponse.json({ password });
}
