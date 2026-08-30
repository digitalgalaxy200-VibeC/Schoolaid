import { NextResponse } from "next/server";
import { verifySchoolAdmin } from "@/lib/school-auth";
import { getServiceClient } from "@/lib/supabase/service";

export async function GET() {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized || !school_id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("fee_heads")
    .select("*")
    .eq("school_id", school_id)
    .order("display_order");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}

export async function POST(request: Request) {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized || !school_id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { description, is_optional, display_order } = body;
  const name = typeof body.name === "string" ? body.name.trim() : "";

  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
  if (name.length > 100) return NextResponse.json({ error: "name must be 100 characters or fewer" }, { status: 400 });

  const supabase = getServiceClient();

  // Reject duplicate names within the same school (unique per school)
  const { data: existing } = await supabase
    .from("fee_heads")
    .select("id")
    .eq("school_id", school_id)
    .eq("name", name)
    .maybeSingle();
  if (existing) return NextResponse.json({ error: "A fee head with this name already exists" }, { status: 409 });

  const order = Number.isFinite(display_order) ? display_order : 0;

  const { data, error } = await supabase
    .from("fee_heads")
    .insert({
      school_id,
      name,
      description: description || null,
      is_optional: !!is_optional,
      display_order: order,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
