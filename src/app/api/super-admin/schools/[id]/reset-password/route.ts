import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/service";
import { verifySuperAdmin } from "@/lib/api-auth";
import { generateUniquePassword } from "@/lib/password";

function isUUID(str: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { authorized } = await verifySuperAdmin(request);
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getServiceClient();
  const { id: schoolIdOrSlug } = await params;

  // Find the school
  const column = isUUID(schoolIdOrSlug) ? "id" : "slug";
  const { data: school } = await supabase
    .from("schools")
    .select("id, slug, name")
    .eq(column, schoolIdOrSlug)
    .single();

  if (!school) {
    return NextResponse.json({ error: "School not found" }, { status: 404 });
  }

  // Get the admin ID from the request body
  const { admin_id } = await request.json();
  if (!admin_id) {
    return NextResponse.json({ error: "admin_id required" }, { status: 400 });
  }

  // Find the school admin and their profile
  const { data: admin } = await supabase
    .from("school_admins")
    .select("id, profile_id, first_name, last_name")
    .eq("id", admin_id)
    .eq("school_id", school.id)
    .single();

  if (!admin) {
    return NextResponse.json({ error: "Admin not found" }, { status: 404 });
  }

  // Get the auth user ID from profiles
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, email")
    .eq("id", admin.profile_id)
    .single();

  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  // Generate a globally unique password using the engine.
  // Previously the arguments were swapped — generateUniquePassword(supabase,
  // school.slug, "school_admin") passed the school's slug as the *role* and
  // the literal string "school_admin" as the *school name*. Since
  // ROLE_LETTERS has no entry for a school slug, every password generated
  // by this route silently used the "X" fallback role letter and a generic
  // "SCH" prefix instead of a prefix identifying the actual school. See
  // docs/CORRECTIONS_SECURITE.md.
  const newPassword = await generateUniquePassword(supabase, "school_admin", school.name);

  // Update password via Supabase Admin API
  const authRes = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users/${profile.id}`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
      },
      body: JSON.stringify({ password: newPassword }),
    },
  );

  if (!authRes.ok) {
    return NextResponse.json(
      { error: "Failed to reset password" },
      { status: 500 },
    );
  }

  // Update school_admins record
  await supabase
    .from("school_admins")
    .update({
      generated_password: newPassword,
      must_change_password: true,
    })
    .eq("id", admin_id);

  return NextResponse.json({
    success: true,
    password: newPassword,
    email: profile.email,
  });
}
