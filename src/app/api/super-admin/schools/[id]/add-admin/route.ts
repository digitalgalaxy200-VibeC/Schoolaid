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

  // Parse body
  const { first_name, last_name, email } = await request.json();
  if (!first_name || !last_name || !email) {
    return NextResponse.json({ error: "first_name, last_name, and email are required" }, { status: 400 });
  }

  // Enforce 1 Admin Limit
  const { count, error: countError } = await supabase
    .from("school_admins")
    .select("*", { count: "exact", head: true })
    .eq("school_id", school.id);
    
  if (countError) {
    return NextResponse.json({ error: "Failed to check existing admins" }, { status: 500 });
  }
  if (count && count >= 1) {
    return NextResponse.json({ error: "This school already has an administrator. Only 1 administrator is allowed per school." }, { status: 400 });
  }

  // Generate a globally unique password using the engine
  const newPassword = await generateUniquePassword(supabase, school.slug, "school_admin");

  // 1. Create or get user from Auth
  let authUserId = null;
  const { data: createData, error: createError } = await supabase.auth.admin.createUser({
    email,
    password: newPassword,
    email_confirm: true,
  });

  if (createData?.user?.id) {
    authUserId = createData.user.id;
  } else {
    // If user exists, find them and update password
    const { data: listData } = await supabase.auth.admin.listUsers();
    const existing = listData?.users?.find((u) => u.email === email);
    if (existing) {
      authUserId = existing.id;
      await supabase.auth.admin.updateUserById(authUserId, { password: newPassword });
    } else {
      return NextResponse.json({ error: "Failed to create authentication user." }, { status: 500 });
    }
  }

  if (!authUserId) {
    return NextResponse.json({ error: "Failed to resolve auth user." }, { status: 500 });
  }

  // 2. Create Profile
  const { error: profileError } = await supabase.from("profiles").upsert(
    { 
      id: authUserId, 
      email, 
      full_name: `${first_name} ${last_name}`, 
      role: "school_admin",
      school_id: school.id 
    },
    { onConflict: "id" }
  );

  if (profileError) {
    return NextResponse.json({ error: "Failed to create user profile." }, { status: 500 });
  }
  
  // Ensure role is set in case of upsert conflict
  await supabase.from("profiles").update({ role: "school_admin" }).eq("id", authUserId);

  // 3. Create School Admin record
  const { data: adminRecord, error: adminError } = await supabase.from("school_admins").insert({
    school_id: school.id,
    profile_id: authUserId,
    first_name,
    last_name,
    generated_password: newPassword,
    must_change_password: true
  }).select().single();

  if (adminError) {
    // If it already exists for some reason, update it
    if (adminError.code === '23505') { // unique violation
      await supabase.from("school_admins").update({
        generated_password: newPassword,
        must_change_password: true
      }).eq("profile_id", authUserId);
    } else {
      return NextResponse.json({ error: "Failed to link admin to school." }, { status: 500 });
    }
  }

  return NextResponse.json({
    success: true,
    password: newPassword,
    email: email,
    adminName: `${first_name} ${last_name}`
  });
}
