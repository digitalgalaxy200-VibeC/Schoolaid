import { NextResponse } from "next/server";
import { verifySuperAdmin } from "@/lib/api-auth";
import { getServiceClient } from "@/lib/supabase/service";

export async function PUT(request: Request) {
  const { authorized, userId } = await verifySuperAdmin(request);
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { school_id, feature_key, is_enabled } = await request.json();
  if (!school_id || !feature_key) return NextResponse.json({ error: "school_id and feature_key required" }, { status: 400 });

  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("school_features")
    .upsert({ school_id, feature_key, is_enabled: !!is_enabled, enabled_by: userId || null, enabled_at: new Date().toISOString() }, { onConflict: "school_id,feature_key" })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function GET(request: Request) {
  const { authorized } = await verifySuperAdmin(request);
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const schoolId = url.searchParams.get("school_id");

  const supabase = getServiceClient();
  let query = supabase.from("school_features").select("*");
  if (schoolId) query = query.eq("school_id", schoolId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}
