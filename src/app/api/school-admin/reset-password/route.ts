import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/service";
import { verifySchoolAdmin } from "@/lib/school-auth";
import { generateUniquePassword } from "@/lib/password";

export async function POST(request: Request) {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { profile_id, role } = await request.json();
  if (!profile_id || !role || !["teacher", "student"].includes(role)) {
    return NextResponse.json(
      { error: "Valid profile_id and role (teacher/student) are required" },
      { status: 400 }
    );
  }

  const supabase = getServiceClient();

  // Get school slug for prefix
  const { data: school } = await supabase
    .from("schools")
    .select("slug")
    .eq("id", school_id)
    .single();

  if (!school) {
    return NextResponse.json({ error: "School not found" }, { status: 404 });
  }

  // Generate new unique password
  const newPassword = await generateUniquePassword(
    supabase,
    school.slug,
    role
  );

  // Update Supabase Auth
  const authRes = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users/${profile_id}`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
      },
      body: JSON.stringify({ password: newPassword }),
    }
  );

  if (!authRes.ok) {
    return NextResponse.json(
      { error: "Failed to update auth password" },
      { status: 500 }
    );
  }

  // Update the specific role table to store the generated password temporarily
  const table = role === "teacher" ? "teachers" : "students";
  await supabase
    .from(table)
    .update({ generated_password: newPassword, must_change_password: true })
    .eq("profile_id", profile_id);

  return NextResponse.json({ success: true, newPassword });
}
