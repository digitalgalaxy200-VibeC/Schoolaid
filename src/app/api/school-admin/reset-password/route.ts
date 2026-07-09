import { NextResponse } from "next/server";
import { verifySchoolAdmin } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";
import { generateUniquePassword } from "@/lib/password";

export async function POST(request: Request) {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { profile_id, role } = await request.json();
  if (!profile_id)
    return NextResponse.json({ error: "profile_id required" }, { status: 400 });

  const supabase = getServiceClient();

  // Get school name for prefix
  const { data: school } = await supabase
    .from("schools")
    .select("name")
    .eq("id", school_id)
    .single();
  if (!school)
    return NextResponse.json({ error: "School not found" }, { status: 404 });

  const password = await generateUniquePassword(school.name, role);

  // Update auth user password via admin API
  await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users/${profile_id}`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
      },
      body: JSON.stringify({ password }),
    },
  );

  // Log in history with user
  await supabase
    .from("password_history")
    .update({ used_by: profile_id })
    .eq("password", password);

  return NextResponse.json({ password });
}
