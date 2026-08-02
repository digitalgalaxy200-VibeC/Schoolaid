// ============================================================
// GET /api/super-admin/copilot/schools
// Lightweight endpoint for the AI copilot to list all active
// schools. Uses verifyCopilotAccess so it works under both
// direct super-admin sessions AND impersonation sessions.
// ============================================================

import { NextResponse } from "next/server";
import { verifyCopilotAccess } from "@/lib/copilot/auth";
import { getServiceClient } from "@/lib/supabase/service";

export async function GET(request: Request) {
  const auth = await verifyCopilotAccess(request);

  if (!auth.authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getServiceClient();

  const { data, error } = await supabase
    .from("schools")
    .select("id, name, slug, subscription_status")
    .eq("is_archived", false)
    .order("name", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data || []);
}
