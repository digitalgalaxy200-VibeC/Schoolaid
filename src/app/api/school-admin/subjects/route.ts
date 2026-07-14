import { NextResponse } from "next/server";
import { verifySchoolAdmin } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";

export async function GET() {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = getServiceClient();
  const { data } = await supabase
    .from("subjects")
    .select("*")
    .eq("school_id", school_id)
    .order("name");
  return NextResponse.json(data || []);
}

export async function POST(request: Request) {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json();
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("subjects")
    .insert({ ...body, school_id })
    .select()
    .single();
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function PUT(request: Request) {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, ...rest } = await request.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  // Same fix as classes/route.ts — see docs/CORRECTIONS_SECURITE.md.
  const EDITABLE_FIELDS = ["name", "code", "description", "is_active"] as const;
  const body: Record<string, unknown> = {};
  for (const field of EDITABLE_FIELDS) {
    if (field in rest) body[field] = rest[field];
  }

  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("subjects")
    .update(body)
    .eq("id", id)
    .eq("school_id", school_id)
    .select()
    .single();
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
