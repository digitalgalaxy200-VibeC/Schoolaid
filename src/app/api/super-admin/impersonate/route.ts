import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/service";
import { SignJWT } from "jose";
import { verifySuperAdmin } from "@/lib/api-auth";
import { getJwtSecret } from "@/lib/jwt-secret";

export async function POST(request: Request) {
  const { authorized, userId } = await verifySuperAdmin(request);
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getServiceClient();
  const { school_id } = await request.json();
  if (!school_id) {
    return NextResponse.json({ error: "school_id required" }, { status: 400 });
  }

  // Backup the original super admin session before overwriting it
  const originalSession = request.headers.get("cookie")?.split("; ").find(row => row.startsWith("schoolaid-session="))?.split("=")[1];

  const { data: school } = await supabase
    .from("schools")
    .select("id, name")
    .eq("id", school_id)
    .single();

  if (!school)
    return NextResponse.json({ error: "School not found" }, { status: 404 });

  const expiresAt = new Date(Date.now() + 45 * 60 * 1000); // 45 mins

  // Log the impersonation action
  await supabase.from("support_logs").insert({
    school_id,
    super_admin_id: userId,
    action: `Impersonation session started for ${school.name}`,
    token_expires_at: expiresAt.toISOString(),
  });

  // Issue a proper signed JWT the school-admin middleware will accept
  const token = await new SignJWT({
    sub: userId || "super_admin",
    role: "school_admin",
    school_id,
    impersonated: true,
    impersonated_by: userId,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(getJwtSecret());

  const response = NextResponse.json({
    success: true,
    school_name: school.name,
    expires_at: expiresAt.toISOString(),
    redirect: "/school-admin/dashboard",
  });

  // Set the session cookie so the super admin IS the school admin
  response.cookies.set("schoolaid-session", token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 45 * 60,
    path: "/",
  });

  // Save the backup so they can exit
  if (originalSession) {
    response.cookies.set("schoolaid-super-session", originalSession, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 24 * 60 * 60,
      path: "/",
    });
  }

  return response;
}
