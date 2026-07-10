import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/service";

export async function GET(request: Request) {
  const slug = new URL(request.url).searchParams.get("slug");
  if (!slug) return NextResponse.json({ error: "slug required" }, { status: 400 });

  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("schools")
    .select("id, name, slug, logo_url, motto")
    .eq("slug", slug)
    .eq("is_active", true)
    .single();

  if (error || !data) return NextResponse.json({ error: "School not found" }, { status: 404 });
  return NextResponse.json(data);
}
