import { NextResponse } from "next/server";
import { verifySchoolAdmin } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";

export async function GET() {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("teachers")
    .select("*, profiles(full_name, email)")
    .eq("school_id", school_id)
    .order("created_at", { ascending: false });
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { first_name, last_name, email, phone, qualification } =
    await request.json();
  if (!first_name || !last_name || !email) {
    return NextResponse.json(
      { error: "first_name, last_name, and email required" },
      { status: 400 },
    );
  }

  const supabase = getServiceClient();
  const password = "teacher123";
  const fullName = `${first_name} ${last_name}`;

  // Create auth user
  const authRes = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
      },
      body: JSON.stringify({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName, role: "teacher", school_id },
      }),
    },
  );
  const authData = await authRes.json();
  if (!authData.user?.id)
    return NextResponse.json(
      { error: "Failed to create user" },
      { status: 500 },
    );

  // Create profile and teacher records
  await supabase
    .from("profiles")
    .upsert({
      id: authData.user.id,
      school_id,
      full_name: fullName,
      email,
      role: "teacher",
    });

  const insertData: Record<string, unknown> = {
    school_id,
    profile_id: authData.user.id,
    employee_id: `T-${Date.now().toString(36).toUpperCase()}`,
    qualification: qualification || null,
    generated_password: password,
    must_change_password: true,
  };

  const { data: teacher, error } = await supabase
    .from("teachers")
    .insert(insertData)
    .select("*, profiles(full_name, email)")
    .single();

  if (error) {
    // If columns don't exist, retry without them
    if (
      error.message?.includes("generated_password") ||
      error.message?.includes("must_change_password")
    ) {
      delete insertData.generated_password;
      delete insertData.must_change_password;
      const { data: retryTeacher, error: retryError } = await supabase
        .from("teachers")
        .insert(insertData)
        .select("*, profiles(full_name, email)")
        .single();
      if (retryError)
        return NextResponse.json(
          { error: retryError.message },
          { status: 500 },
        );
      return NextResponse.json({ ...retryTeacher, password, email });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ...teacher, password, email });
}
