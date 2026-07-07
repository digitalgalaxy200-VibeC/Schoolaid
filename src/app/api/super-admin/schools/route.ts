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
  const { name, slug, motto, address, phone, email, website, adminPhone } =
    body;

  if (!name || !slug || !email) {
    return NextResponse.json(
      { error: "name, slug, and email are required" },
      { status: 400 },
    );
  }

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
      subscription_status: "inactive",
    })
    .select()
    .single();

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  // 2. Create subscription record
  await supabase
    .from("subscriptions")
    .insert({ school_id: school.id, plan: "free", status: "inactive" });

  // 3. Generate simple credentials
  const adminEmail = `admin@${slug}.edu`;
  const adminPassword = `${slug.replace(/-/g, "")}123`;

  // 4. Create admin user via Supabase Auth (using service role in header)
  const authRes = await fetch(
    "https://iojiahkehnijxxczrgft.supabase.co/auth/v1/admin/users",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey:
          "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlvamlhaGtlaG5panh4Y3pyZ2Z0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MzM4NDEyMywiZXhwIjoyMDk4OTYwMTIzfQ.B65fIDG8h6a4lsEE8qwnRanik4sVo9A-w3Vu97QhPr0",
        Authorization:
          "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlvamlhaGtlaG5panh4Y3pyZ2Z0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MzM4NDEyMywiZXhwIjoyMDk4OTYwMTIzfQ.B65fIDG8h6a4lsEE8qwnRanik4sVo9A-w3Vu97QhPr0",
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

  // 5. Create profile and school_admin record
  if (authData.user?.id) {
    await supabase.from("profiles").upsert({
      id: authData.user.id,
      school_id: school.id,
      full_name: `${name} Admin`,
      email: adminEmail,
      role: "school_admin",
    });

    await supabase.from("school_admins").insert({
      school_id: school.id,
      profile_id: authData.user.id,
      first_name: name.split(" ")[0] || "School",
      last_name: "Admin",
      generated_password: adminPassword,
      must_change_password: true,
    });

    // Clear generated_password after 5 seconds
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
      schoolPhone: phone || adminPhone || "",
    },
    { status: 201 },
  );
}
