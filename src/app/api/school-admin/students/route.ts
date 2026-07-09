import { NextResponse } from "next/server";
import { verifySchoolAdmin } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";

export async function GET(request: Request) {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const classId = searchParams.get("class_id");
  const supabase = getServiceClient();
  let query = supabase
    .from("students")
    .select("*, profiles(full_name, email)")
    .eq("school_id", school_id)
    .order("created_at", { ascending: false });
  if (classId) query = query.eq("class_id", classId);
  const { data, error } = await query;
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: Request) {
  try {
    const { authorized, school_id } = await verifySchoolAdmin();
    if (!authorized)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Guard: service role key must be set (required for Supabase Admin API)
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error(
        "[students] SUPABASE_SERVICE_ROLE_KEY is not set in environment variables",
      );
      return NextResponse.json(
        {
          error:
            "Server configuration error: SUPABASE_SERVICE_ROLE_KEY missing. Set it in Vercel environment variables.",
        },
        { status: 500 },
      );
    }

    const { first_name, last_name, class_id, date_of_birth, gender } =
      await request.json();
    if (!first_name || !last_name || !class_id) {
      return NextResponse.json(
        { error: "first_name, last_name, and class_id required" },
        { status: 400 },
      );
    }

    const supabase = getServiceClient();
    const fullName = `${first_name} ${last_name}`;

    // Auto-generate admission number with timestamp to avoid email collisions
    const { count } = await supabase
      .from("students")
      .select("*", { count: "exact", head: true })
      .eq("school_id", school_id);
    const seq = String((count || 0) + 1).padStart(4, "0");
    const admissionNumber = `ADM-${seq}`;

    // Timestamp suffix ensures every email is unique, even if a previous attempt failed mid-way
    const uniqueSuffix = Date.now().toString(36);
    const email = `student.${admissionNumber.toLowerCase()}-${uniqueSuffix}@school.edu`;
    const password = "student123";

    // Create auth user
    const authUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users`;
    const authRes = await fetch(authUrl, {
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
        user_metadata: { full_name: fullName, role: "student", school_id },
      }),
    });

    if (!authRes.ok) {
      const authData = await authRes.json().catch(() => ({}));
      console.error("[students] Auth API failed:", authRes.status, authData);
      return NextResponse.json(
        {
          error:
            authData.msg ||
            authData.message ||
            `Auth service error (${authRes.status})`,
        },
        { status: 500 },
      );
    }

    const authData = await authRes.json();
    if (!authData.user?.id && !authData.id) {
      console.error("[students] Auth creation returned no user:", authData);
      return NextResponse.json(
        { error: "Failed to create user account" },
        { status: 500 },
      );
    }

    const userId = authData.user?.id || authData.id;

    // Create profile
    const { error: profileError } = await supabase.from("profiles").upsert({
      id: userId,
      school_id,
      full_name: fullName,
      email,
      role: "student",
    });
    if (profileError) {
      console.error("[students] Profile insert failed:", profileError);
      return NextResponse.json(
        { error: profileError.message },
        { status: 500 },
      );
    }

    // Insert student record
    const insertData: Record<string, unknown> = {
      school_id,
      profile_id: userId,
      student_id: admissionNumber,
      class_id,
      date_of_birth: date_of_birth || null,
      gender: gender || null,
    };

    // Try with password columns first, fall back if they don't exist
    const { data: student, error } = await supabase
      .from("students")
      .insert({
        ...insertData,
        generated_password: password,
        must_change_password: true,
      })
      .select("*, profiles(full_name, email)")
      .single();

    if (error) {
      if (
        error.message?.includes("generated_password") ||
        error.message?.includes("must_change_password")
      ) {
        const { data: retryStudent, error: retryError } = await supabase
          .from("students")
          .insert(insertData)
          .select("*, profiles(full_name, email)")
          .single();
        if (retryError) {
          console.error("[students] Student insert failed:", retryError);
          return NextResponse.json(
            { error: retryError.message },
            { status: 500 },
          );
        }
        return NextResponse.json({ ...retryStudent, password, email });
      }
      console.error("[students] Student insert failed:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ...student, password, email });
  } catch (err: any) {
    console.error("[students] Unhandled error:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 },
    );
  }
}
