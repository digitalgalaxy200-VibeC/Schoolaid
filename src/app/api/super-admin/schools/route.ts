import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/service";
import { verifySuperAdmin } from "@/lib/api-auth";
import { generateUniquePassword } from "@/lib/password";

export async function GET(request: Request) {
  const { authorized } = await verifySuperAdmin(request);
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getServiceClient();
  const { searchParams } = new URL(request.url);
  const archived = searchParams.get("archived");

  let query = supabase
    .from("schools")
    .select(
      "id, name, slug, email, phone, subscription_status, is_archived, created_at",
    )
    .order("created_at", { ascending: false });

  if (archived === "true") query = query.eq("is_archived", true);
  else query = query.eq("is_archived", false);

  const { data, error } = await query;
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}

export async function POST(request: Request) {
  const { authorized } = await verifySuperAdmin(request);
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getServiceClient();
  const body = await request.json();
  const { name, slug, motto, address, phone, email, website } = body;

  if (!name || !slug || !email) {
    return NextResponse.json(
      { error: "name, slug, and email are required" },
      { status: 400 },
    );
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return NextResponse.json(
      { error: "Invalid email format" },
      { status: 400 },
    );
  }

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
      subscription_status: "inactive",
    })
    .select()
    .single();

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase
    .from("subscriptions")
    .insert({ school_id: school.id, plan: "free", status: "inactive" });

  const adminEmail = `admin@${slug}.edu`;
  const adminPassword = await generateUniquePassword(supabase, slug, "school_admin");

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
        email: adminEmail,
        password: adminPassword,
        email_confirm: true,
        user_metadata: {
          full_name: `${name} Admin`,
          role: "school_admin",
          school_id: school.id,
        },
      }),
    },
  );

  const authData = await authRes.json();
  if (authData.user?.id) {
    await supabase
      .from("profiles")
      .upsert({
        id: authData.user.id,
        school_id: school.id,
        full_name: `${name} Admin`,
        email: adminEmail,
        role: "school_admin",
      });
    await supabase
      .from("school_admins")
      .insert({
        school_id: school.id,
        profile_id: authData.user.id,
        first_name: name.split(" ")[0] || "School",
        last_name: "Admin",
        generated_password: adminPassword,
        must_change_password: true,
      });
    setTimeout(async () => {
      await supabase
        .from("school_admins")
        .update({ generated_password: null })
        .eq("school_id", school.id);
    }, 5000);
  }

  return NextResponse.json(
    {
      ...school,
      adminEmail,
      adminPassword,
      schoolName: name,
      schoolPhone: phone,
    },
    { status: 201 },
  );
}
