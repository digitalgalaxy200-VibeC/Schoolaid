import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/service";
import { SignJWT, jwtVerify } from "jose";
import { verifySuperAdmin } from "@/lib/api-auth";
import { cookies } from "next/headers";
import { getJwtSecret } from "@/lib/jwt-secret";

/**
 * Super Admin impersonation.
 *
 * Impersonation is an intentional, required Super Admin capability: entering a
 * school to view classes, inspect users, reproduce issues and make legitimate
 * corrections. It is NOT being removed or narrowed.
 *
 * What this route guarantees:
 *   - Only a GENUINE Super Admin may start or re-target an impersonation.
 *     A school-scoped impersonation session on its own can never widen itself
 *     into platform-wide reach — that was the cross-school pivot.
 *   - Re-targeting (e.g. switching from the school_admin view to the teacher
 *     view inside the same school) is still supported, proven by the original
 *     Super Admin session kept in the httpOnly `schoolaid-super-session` cookie.
 *   - The audit row is mandatory: if it cannot be written, no session is issued.
 *   - The impersonated token is short-lived and scoped to exactly one school_id.
 */

const IMPERSONATION_MINUTES = 45;

async function getCurrentSession(): Promise<{
  school_id: string | null;
  impersonated: boolean;
} | null> {
  const cookieStore = await cookies();
  const session = cookieStore.get("schoolaid-session")?.value;
  if (!session) return null;
  try {
    const { payload } = await jwtVerify(session, getJwtSecret());
    return {
      school_id: (payload.school_id as string) || null,
      impersonated: payload.impersonated === true,
    };
  } catch {
    return null;
  }
}

/**
 * Proves the caller holds the ORIGINAL Super Admin session captured when
 * impersonation began. A school-scoped impersonation token is never accepted
 * here, which is what prevents privilege escalation.
 */
async function getOriginatingSuperAdmin(): Promise<{ userId: string | null } | null> {
  const cookieStore = await cookies();
  const backup = cookieStore.get("schoolaid-super-session")?.value;
  if (!backup) return null;
  try {
    const { payload } = await jwtVerify(backup, getJwtSecret());
    if (payload.role !== "super_admin") return null;
    if (payload.impersonated === true) return null;
    return { userId: (payload.sub as string) || null };
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  // `verifySuperAdmin` also enforces the same-origin (CSRF) check.
  const { authorized, userId } = await verifySuperAdmin(request);
  const originating = authorized ? null : await getOriginatingSuperAdmin();

  if (!authorized && !originating) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const superAdminId = userId || originating?.userId || null;
  if (!superAdminId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getServiceClient();
  const body = await request.json().catch(() => ({}));
  const { school_id, role } = body as { school_id?: string; role?: string };

  const targetRole = role || "school_admin";

  // Only school-level roles may be impersonated — never super_admin, since an
  // impersonated super_admin token would satisfy the role-only checks.
  if (!["school_admin", "teacher", "student"].includes(targetRole)) {
    return NextResponse.json(
      { error: "Role must be school_admin, teacher or student" },
      { status: 400 },
    );
  }

  // Super-admin identity is already proven above, so an explicit target school
  // is legitimate. Falling back to the school we are already inside only ever
  // performs a role switch within the same school.
  const current = await getCurrentSession();
  const targetSchoolId = school_id || (current?.impersonated ? current.school_id : null);

  if (!targetSchoolId) {
    return NextResponse.json({ error: "school_id required" }, { status: 400 });
  }

  const { data: school, error: schoolError } = await supabase
    .from("schools")
    .select("id, name")
    .eq("id", targetSchoolId)
    .single();

  if (schoolError || !school) {
    return NextResponse.json({ error: "School not found" }, { status: 404 });
  }

  const expiresAt = new Date(Date.now() + IMPERSONATION_MINUTES * 60 * 1000);

  // Mandatory audit. Fail closed: no audit row means no impersonation session.
  const { error: logError } = await supabase.from("support_logs").insert({
    school_id: targetSchoolId,
    super_admin_id: superAdminId,
    action: `Impersonation session started for ${school.name} as ${targetRole}`,
    token_expires_at: expiresAt.toISOString(),
  });

  if (logError) {
    console.error("[impersonate] audit write failed, refusing to issue session:", logError.message);
    return NextResponse.json(
      { error: "Could not record the impersonation audit entry. Session not created." },
      { status: 500 },
    );
  }

  const jwtPayload: Record<string, unknown> = {
    sub: superAdminId,
    role: targetRole,
    school_id: targetSchoolId,
    impersonated: true,
    impersonated_by: superAdminId,
  };

  // Teacher impersonation sees every class in that school.
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
    maxAge: IMPERSONATION_MINUTES * 60,
    path: "/",
  });

  // Preserve the ORIGINAL Super Admin session so "Exit Impersonation" can
  // restore it and so re-targeting can prove super-admin identity. Never
  // overwrite it: that keeps the true originator, not a nested impersonation.
  const rawCookies = request.headers.get("cookie") || "";
  const existingBackup = rawCookies
    .split("; ")
    .find((row) => row.startsWith("schoolaid-super-session="));
  const originalSession = rawCookies
    .split("; ")
    .find((row) => row.startsWith("schoolaid-session="))
    ?.slice("schoolaid-session=".length);

  if (!existingBackup && originalSession && !current?.impersonated) {
    response.cookies.set("schoolaid-super-session", originalSession, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 24 * 60 * 60,
      path: "/",
    });
  }

  // Return the Super Admin to the page they started from.
  const referer = request.headers.get("referer") || "";
  let returnPath = "/super-admin/dashboard";
  if (referer) {
    try {
      const u = new URL(referer);
      if (u.pathname && u.pathname !== "/") returnPath = u.pathname + u.search;
    } catch {
      /* ignore malformed referer */
    }
  }
  response.cookies.set("schoolaid-return-path", returnPath, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: IMPERSONATION_MINUTES * 60,
    path: "/",
  });

  return response;
}
