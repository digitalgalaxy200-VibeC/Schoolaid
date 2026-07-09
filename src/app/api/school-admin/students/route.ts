import { NextResponse } from "next/server";
import { verifySchoolAdmin } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";
import { generateUniquePassword } from "@/lib/password";

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
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json();
    const { first_name, last_name, class_id, date_of_birth, gender } = body;
    
    if (!first_name || !last_name || !class_id) {
      return NextResponse.json(
        { error: "first_name, last_name, and class_id required" },
        { status: 400 },
      );
    }

  const supabase = getServiceClient();

  const fName = String(first_name).trim();
  const lName = String(last_name).trim();
  const fullName = `${fName} ${lName}`;

  // Check for duplicate student name in this school
  const { data: existingStudent } = await supabase
    .from("students")
    .select("id, profiles(full_name)")
    .eq("school_id", school_id)
    .eq("class_id", class_id)
    .maybeSingle();

  // Check by full name match via profiles
  const { data: nameCheck } = await supabase
    .from("profiles")
    .select("id")
    .eq("school_id", school_id)
    .eq("full_name", fullName)
    .eq("role", "student")
    .maybeSingle();

  if (nameCheck) {
    return NextResponse.json(
      { error: `A student named "${fullName}" already exists in this school. Skipped.` },
      { status: 409 },
    );
  }

  // Auto-generate admission number
  const { count } = await supabase
    .from("students")
    .select("*", { count: "exact", head: true })
    .eq("school_id", school_id);
  const admissionNumber = `ADM-${String((count || 0) + 1).padStart(4, "0")}`;

  const { data: school } = await supabase
    .from("schools")
    .select("name, slug, logo_url")
    .eq("id", school_id)
    .single();
  const password = await generateUniquePassword(
    supabase,
    school?.slug || "school",
    "student",
  );

  // Use admission number in the student's system email
  const email = `student.${admissionNumber.toLowerCase()}@school.edu`;

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
        user_metadata: { full_name: fullName, role: "student", school_id },
      }),
    },
  );
  const authData = await authRes.json();
  const userId = authData.id || authData.user?.id;
  if (!userId) {
    const errMsg =
      authData.message ||
      authData.error_description ||
      authData.error ||
      "Failed to create student user";
    console.error("[students] Auth creation failed:", authData);
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }

  // Create profile and student records
  await supabase.from("profiles").upsert({
    id: userId,
    school_id,
    full_name: fullName,
    email,
    role: "student",
  });

  const { data: student, error } = await supabase
    .from("students")
    .insert({
      school_id,
      profile_id: userId,
      student_id: admissionNumber,
      class_id,
      date_of_birth,
      gender,
      generated_password: password,
      must_change_password: true,
    })
    .select("*, profiles(full_name, email)")
    .single();

  if (error) {
    console.error("[students] DB insert failed:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

    return NextResponse.json({ ...student, password, email });
  } catch (err: any) {
    console.error("[students] Unhandled error:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}
