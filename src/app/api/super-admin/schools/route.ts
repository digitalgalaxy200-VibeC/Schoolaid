import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/service";
import { verifySuperAdmin } from "@/lib/api-auth";
import { SchoolProvisioningError, createSchoolWithAdmin } from "@/lib/school-provisioning";

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

  try {
    // School + subscription + first admin, through the SAME path the Copilot
    // uses. The response shape is unchanged.
    const { school, adminEmail, adminPassword } = await createSchoolWithAdmin(supabase, {
      name,
      slug,
      email,
      motto,
      address,
      phone,
      website,
    });

    // Existing behaviour: the stored copy of the one-time password is cleared
    // shortly after creation; the response is where it is handed over.
    setTimeout(async () => {
      await supabase
        .from("school_admins")
        .update({ generated_password: null })
        .eq("school_id", school.id);
    }, 5000);

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
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create school";
    const kind = err instanceof SchoolProvisioningError ? err.kind : "school";
    return NextResponse.json(
      { error: message },
      { status: kind === "admin_auth" ? 400 : 500 },
    );
  }
}
