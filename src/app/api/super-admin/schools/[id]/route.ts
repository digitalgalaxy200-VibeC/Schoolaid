import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/service";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = getServiceClient();
  const { id } = await params;

  const { data: school, error } = await supabase
    .from("schools")
    .select("*, subscriptions(*), school_admins(*), support_logs(*)")
    .eq("id", id)
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
  const supabase = getServiceClient();
  const { id } = await params;
  const body = await request.json();

  const { data, error } = await supabase
    .from("schools")
    .update(body)
    .eq("id", id)
    .select()
    .single();

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
