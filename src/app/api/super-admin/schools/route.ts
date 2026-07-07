import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.role !== "super_admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { data, error } = await supabase
    .from("schools")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.role !== "super_admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const body = await request.json();
  const { name, slug, motto, address, phone, email, website, logo_url } = body;

  if (!name || !slug || !email) {
    return NextResponse.json({ error: "name, slug, and email are required" }, { status: 400 });
  }

  const { data: school, error } = await supabase
    .from("schools")
    .insert({ name, slug, motto, address, phone, email, website, logo_url, subscription_status: "inactive" })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Create subscription record
  await supabase.from("subscriptions").insert({
    school_id: school.id,
    plan: "free",
    status: "inactive",
  });

  return NextResponse.json(school, { status: 201 });
}
