import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/service";
import { SignJWT, jwtVerify } from "jose";
import { verifySuperAdmin } from "@/lib/api-auth";
import { cookies } from "next/headers";

const getJwtSecret = () =>
  new TextEncoder().encode(
    process.env.JWT_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  );

async function getCurrentSession(): Promise<{
  userId: string | null;
  role: string | null;
  school_id: string | null;
  impersonated: boolean;
  impersonated_by: string | null;
} | null> {
  const cookieStore = await cookies();
  const session = cookieStore.get("schoolaid-session")?.value;
  if (!session) return null;
  try {
    const { payload } = await jwtVerify(session, getJwtSecret());
    return {
      userId: (payload.sub as string) || null,
      role: (payload.role as string) || null,
      school_id: (payload.school_id as string) || null,
      impersonated: payload.impersonated === true,
      impersonated_by: (payload.impersonated_by as string) || null,
    };
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const { authorized, userId } = await verifySuperAdmin(request);
  const currentSession = authorized ? null : await getCurrentSession();

  // Allow super admins OR users already impersonating as school_admin to escalate
  const canImpersonate = authorized ||
    (currentSession && currentSession.impersonated && currentSession.role === "school_admin");

  if (!canImpersonate) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getServiceClient();
  const body = await request.json();
  const { school_id, role } = body;

  // For escalation from impersonated school admin, use current session's school_id
  const targetSchoolId = school_id || currentSession?.school_id;
  if (!targetSchoolId) {
    return NextResponse.json({ error: "school_id required" }, { status: 400 });
  }

  const targetRole = role || "school_admin";

  // Extract original session
  const rawCookies = request.headers.get("cookie") || "";
  const sessionCookiePart = rawCookies.split("; ").find(row => row.startsWith("schoolaid-session="));
  const originalSession = sessionCookiePart ? sessionCookiePart.slice("schoolaid-session=".length) : undefined;

  const { data: school } = await supabase
    .from("schools")
    .select("id, name")
    .eq("id", targetSchoolId)
    .single();

  if (!school)
    return NextResponse.json({ error: "School not found" }, { status: 404 });

  const expiresAt = new Date(Date.now() + 45 * 60 * 1000);
  const effectiveUserId = userId || currentSession?.userId || "super_admin";
  const impersonatedBy = userId || currentSession?.impersonated_by || effectiveUserId;

  // Log it
  await supabase.from("support_logs").insert({
    school_id: targetSchoolId,
    super_admin_id: impersonatedBy,
    action: `Impersonation session started for ${school.name} as ${targetRole}`,
    token_expires_at: expiresAt.toISOString(),
  });

  // Build JWT payload
  const jwtPayload: Record<string, unknown> = {
    sub: effectiveUserId,
    role: targetRole,
    school_id: targetSchoolId,
    impersonated: true,
    impersonated_by: impersonatedBy,
  };

  // Teacher gets all_classes flag to see all classes in the school
  if (targetRole === "teacher") {
    jwtPayload.all_classes = true;
  }

  const token = await new SignJWT(jwtPayload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(getJwtSecret());

  const dashboard = targetRole === "teacher" ? "/teacher/dashboard" : "/school-admin/dashboard";

  const response = NextResponse.json({
    success: true,
    school_name: school.name,
    role: targetRole,
    expires_at: expiresAt.toISOString(),
    redirect: dashboard,
  });

  response.cookies.set("schoolaid-session", token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 45 * 60,
    path: "/",
  });

  // Keep original super admin session for exit (don't overwrite if already saved)
  const superCookie = rawCookies.split("; ").find(row => row.startsWith("schoolaid-super-session="));
  if (!superCookie && originalSession) {
    response.cookies.set("schoolaid-super-session", originalSession, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 24 * 60 * 60,
      path: "/",
    });
  }

  // Preserve the exact originating context so "Exit Impersonation" returns
  // the super admin to the page they started from (not always the dashboard).
  const referer = request.headers.get("referer") || "";
  let returnPath = "/super-admin/dashboard";
  if (referer) {
    try {
      const u = new URL(referer);
      if (u.pathname && u.pathname !== "/") returnPath = u.pathname + u.search;
    } catch { /* ignore malformed referer */ }
  }
  response.cookies.set("schoolaid-return-path", returnPath, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 45 * 60,
    path: "/",
  });

  return response;
}
