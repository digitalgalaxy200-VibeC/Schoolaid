import { NextResponse } from "next/server";
import { verifySchoolAdmin } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";
import { generateUniquePassword } from "@/lib/password";

export async function GET() {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = getServiceClient();
  const { data, error } = await supabase.from("teachers").select("*, profiles(full_name, email)").eq("school_id", school_id).order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { first_name, last_name, email, phone, qualification } = await request.json();
  if (!first_name || !last_name || !email) {
    return NextResponse.json({ error: "first_name, last_name, and email required" }, { status: 400 });
  }

  const supabase = getServiceClient();

  // Check for duplicate email in profiles
  const { data: existing } = await supabase
    .from("profiles")
    .select("id")
    .eq("email", email.trim().toLowerCase())
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ error: `A user with email "${email}" already exists. Skipped.` }, { status: 409 });
  }

  const { data: school } = await supabase.from("schools").select("name, slug").eq("id", school_id).single();
  const password = await generateUniquePassword(supabase, school?.slug || "school", "teacher");
  const fullName = `${first_name.trim()} ${last_name.trim()}`;

  // Create auth user
  const authRes = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
    },
    body: JSON.stringify({
      email: email.trim().toLowerCase(),
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, role: "teacher", school_id },
    }),
  });
  const authData = await authRes.json();
  const userId = authData.id || authData.user?.id;
  if (!userId) {
    const errMsg = authData.message || authData.error_description || authData.error || "Failed to create user";
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }

  // Create profile and teacher records
  await supabase.from("profiles").upsert({
    id: userId,
    school_id,
    full_name: fullName,
    email: email.trim().toLowerCase(),
    role: "teacher",
  });

  const { data: teacher, error } = await supabase
    .from("teachers")
    .insert({
      school_id,
      profile_id: userId,
      employee_id: `T-${Date.now().toString(36).toUpperCase()}`,
      qualification,
      generated_password: password,
      must_change_password: true,
    })
    .select("*, profiles(full_name, email)")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ...teacher, password, email: email.trim().toLowerCase() });
}
