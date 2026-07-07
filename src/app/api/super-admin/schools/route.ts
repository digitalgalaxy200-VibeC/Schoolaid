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

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase.from("subscriptions").insert({
    school_id: school.id,
    plan: "free",
    status: "inactive",
  });

  return NextResponse.json(school, { status: 201 });
}
