import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/service";
import { verifySuperAdmin } from "@/lib/api-auth";

function isUUID(str: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    str,
  );
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { authorized } = await verifySuperAdmin(request);
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getServiceClient();
  const { id } = await params;

  const column = isUUID(id) ? "id" : "slug";

  const { data: school, error } = await supabase
    .from("schools")
    .select("*, subscriptions(*), support_logs(*)")
    .eq(column, id)
    .single();

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  if (!school)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Fetch school admins with profile data separately for proper joins
  const { data: admins } = await supabase
    .from("school_admins")
    .select("id, first_name, last_name, profile_id, status")
    .eq("school_id", school.id);

  // Enrich admins with profile email
  const enrichedAdmins = await Promise.all(
    (admins || []).map(async (admin) => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("email, full_name")
        .eq("id", admin.profile_id)
        .single();

      return {
        id: admin.id,
        full_name:
          profile?.full_name || `${admin.first_name} ${admin.last_name}`,
        email: profile?.email || "",
        status: admin.status,
      };
    }),
  );

  return NextResponse.json({ ...school, school_admins: enrichedAdmins });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { authorized } = await verifySuperAdmin(request);
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getServiceClient();
  const { id } = await params;
  const body = await request.json();

  const column = isUUID(id) ? "id" : "slug";

  const { data, error } = await supabase
    .from("schools")
    .update(body)
    .eq(column, id)
    .select()
    .single();

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
