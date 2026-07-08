import { NextResponse } from "next/server";
import { verifySchoolAdmin } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";
import { sendStudentOnboardingEmail } from "@/lib/email";

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

  const { first_name, last_name, class_id, date_of_birth, gender } =
    await request.json();
  if (!first_name || !last_name || !class_id) {
    return NextResponse.json(
      { error: "first_name, last_name, and class_id required" },
      { status: 400 },
    );
  }

  const supabase = getServiceClient();

  // Auto-generate admission number
  const { count } = await supabase
    .from("students")
    .select("*", { count: "exact", head: true })
    .eq("school_id", school_id);
  const admissionNumber = `ADM-${String((count || 0) + 1).padStart(4, "0")}`;

  const fullName = `${first_name} ${last_name}`;
  const email = `student.${admissionNumber.toLowerCase()}@school.edu`;
  const password = "student123";

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
  if (!authData.user?.id)
    return NextResponse.json(
      { error: "Failed to create user" },
      { status: 500 },
    );

  // Create profile and student records
  await supabase
    .from("profiles")
    .upsert({
      id: authData.user.id,
      school_id,
      full_name: fullName,
      email,
      role: "student",
    });
  const { data: student, error } = await supabase
    .from("students")
    .insert({
      school_id,
      profile_id: authData.user.id,
      student_id: admissionNumber,
      class_id,
      date_of_birth,
      generated_password: password,
      must_change_password: true,
    })
    .select("*, profiles(full_name, email)")
    .single();

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  // Fire onboarding email asynchronously (don't block the response)
  const { data: school } = await supabase
    .from("schools")
    .select("name, logo_url")
    .eq("id", school_id)
    .single();
  const schoolName = school?.name || "Your School";
  const loginUrl = `${process.env.NEXT_PUBLIC_SITE_URL || ""}/login`;

  sendStudentOnboardingEmail({
    to: email,
    studentName: fullName,
    schoolName,
    schoolLogo: school?.logo_url || null,
    loginUrl,
  }).catch((err) => console.error("[students] Onboarding email failed:", err));

  return NextResponse.json({ ...student, password, email });
}
