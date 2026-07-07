import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/service";

export async function GET() {
  const supabase = getServiceClient();

  const { data, error } = await supabase
    .from("schools")
    .select("*")
    .order("created_at", { ascending: false });

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const supabase = getServiceClient();
  const body = await request.json();
  const { name, slug, motto, address, phone, email, website, logo_url } = body;

  if (!name || !slug || !email) {
    return NextResponse.json(
      { error: "name, slug, and email are required" },
      { status: 400 },
    );
  }

  // Generate a random password for the school admin
  const tempPassword = Math.random().toString(36).slice(-10) +
    Math.random().toString(36).toUpperCase().slice(-2) + "!1";

  // 1. Create the school
  const { data: school, error } = await supabase
    .from("schools")
    .insert({
      name,
      slug,
      motto,
      address,
      phone,
      email,
      website,
      logo_url,
      subscription_status: "inactive",
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase.from("subscriptions").insert({
    school_id: school.id,
    plan: "free",
    status: "inactive",
  });

  // 2. Create the school admin auth user via Supabase Auth admin API
  const adminEmail = `admin@${slug}.edu`;
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: adminEmail,
    password: tempPassword,
    email_confirm: true,
    user_metadata: {
      full_name: `${name} Admin`,
      role: "school_admin",
      school_id: school.id,
    },
  });

  if (authError) return NextResponse.json({ error: authError.message }, { status: 500 });

  // 3. Create the school admin profile record
  await supabase.from("profiles").upsert({
    id: authData.user.id,
    school_id: school.id,
    full_name: `${name} Admin`,
    email: adminEmail,
    role: "school_admin",
  });

  // 4. Create school_admins record
  await supabase.from("school_admins").insert({
    school_id: school.id,
    profile_id: authData.user.id,
    first_name: name.split(" ")[0] || "School",
    last_name: "Admin",
    generated_password: tempPassword,
    must_change_password: true,
  });

  return NextResponse.json({ school, tempPassword, adminEmail }, { status: 201 });
}
