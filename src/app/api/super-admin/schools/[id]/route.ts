import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/service";
import { verifySuperAdmin } from "@/lib/api-auth";

// Helper: detect if param is a UUID or a slug
function isUUID(str: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
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

  // Support both UUID and slug lookups
  const column = isUUID(id) ? "id" : "slug";

  const { data: school, error } = await supabase
    .from("schools")
    .select("*, subscriptions(*), school_admins(*), support_logs(*)")
    .eq(column, id)
    .single();

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  if (!school)
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(school);
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
