import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import crypto from "crypto";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.role !== "super_admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { school_id } = await request.json();
  if (!school_id) {
    return NextResponse.json({ error: "school_id required" }, { status: 400 });
  }

  // Verify school exists
  const { data: school } = await supabase
    .from("schools")
    .select("id, name")
    .eq("id", school_id)
    .single();

  if (!school) {
    return NextResponse.json({ error: "School not found" }, { status: 404 });
  }

  const expiresAt = new Date(Date.now() + 45 * 60 * 1000); // 45 minutes

  // Write support log BEFORE granting access (audit first, access second)
  const { error: logError } = await supabase.from("support_logs").insert({
    school_id,
    super_admin_id: user.id,
    action: `Impersonation session started for ${school.name}`,
    token_expires_at: expiresAt.toISOString(),
  });

  if (logError) {
    return NextResponse.json({ error: logError.message }, { status: 500 });
  }

  // Generate a signed impersonation token
  const payload = {
    school_id,
    super_admin_id: user.id,
    role: "school_admin",
    impersonated: true,
    exp: Math.floor(expiresAt.getTime() / 1000),
    iat: Math.floor(Date.now() / 1000),
  };

  const token = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto
    .createHmac(
      "sha256",
      process.env.SUPABASE_SERVICE_ROLE_KEY || "schoolaid-impersonation-secret",
    )
    .update(token)
    .digest("base64url");

  const signedToken = `${token}.${signature}`;

  return NextResponse.json({
    token: signedToken,
    expires_at: expiresAt.toISOString(),
    school_name: school.name,
  });
}
