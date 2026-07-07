import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/service";
import crypto from "crypto";
import { verifySuperAdmin } from "@/lib/api-auth";

export async function POST(request: Request) {
  if (!(await verifySuperAdmin(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getServiceClient();
  const { school_id } = await request.json();
  if (!school_id) {
    return NextResponse.json({ error: "school_id required" }, { status: 400 });
  }

  const { data: school } = await supabase
    .from("schools")
    .select("id, name")
    .eq("id", school_id)
    .single();

  if (!school)
    return NextResponse.json({ error: "School not found" }, { status: 404 });

  const expiresAt = new Date(Date.now() + 45 * 60 * 1000);

  // Log first, access second
  await supabase.from("support_logs").insert({
    school_id,
    super_admin_id: "00000000-0000-0000-0000-000000000000", // super admin UUID
    action: `Impersonation session started for ${school.name}`,
    token_expires_at: expiresAt.toISOString(),
  });

  // Generate signed impersonation token
  const payload = {
    school_id,
    role: "school_admin",
    impersonated: true,
    exp: Math.floor(expiresAt.getTime() / 1000),
  };
  const token = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto
    .createHmac(
      "sha256",
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
    .update(token)
    .digest("base64url");

  return NextResponse.json({
    token: `${token}.${signature}`,
    expires_at: expiresAt.toISOString(),
    school_name: school.name,
  });
}
