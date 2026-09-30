import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { getJwtSecret } from "@/lib/jwt-secret";

/**
 * POST /api/auth/exit-impersonation — walk back one level of impersonation.
 *
 * Nested chain: Super Admin → School Admin → Teacher
 *   - Exiting from Teacher restores the School Admin session (immediate parent).
 *   - Exiting from School Admin restores the original Super Admin session.
 *
 * The stored backup is validated before being promoted back into the app. A
 * school-scoped, expired or tampered cookie must never become an active
 * session, and the redirect target is constrained to a local path so a
 * manipulated cookie cannot turn this into an open redirect.
 */

const IMPERSONATION_MINUTES = 45;

function dashboardForRole(role: string): string {
  switch (role) {
    case "teacher": return "/teacher/dashboard";
    case "school_admin": return "/school-admin/dashboard";
    case "student": return "/student/dashboard";
    default: return "/super-admin/dashboard";
  }
}

export async function POST() {
  const cookieStore = await cookies();

  // ── Nested exit: restore the immediate parent (e.g. teacher → school admin) ──
  const prevSession = cookieStore.get("schoolaid-prev-session")?.value;
  if (prevSession) {
    let role = "school_admin";
    try {
      const { payload } = await jwtVerify(prevSession, getJwtSecret());
      if (payload.impersonated !== true || !payload.sub || !payload.school_id) {
        return NextResponse.json(
          { error: "Stored parent session is not a valid impersonation session" },
          { status: 400 },
        );
      }
      role = (payload.role as string) || "school_admin";
    } catch {
      return NextResponse.json({ error: "Stored parent session is no longer valid" }, { status: 400 });
    }

    const response = NextResponse.json({
      success: true,
      redirect: dashboardForRole(role),
      restored_role: role,
    });

    response.cookies.set("schoolaid-session", prevSession, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: IMPERSONATION_MINUTES * 60,
      path: "/",
    });
    // Drop the consumed parent; the super admin backup stays intact for the next exit.
    response.cookies.delete("schoolaid-prev-session");

    return response;
  }

  // ── Final exit: restore the original Super Admin session ──
  const superSession = cookieStore.get("schoolaid-super-session")?.value;
  if (!superSession) {
    return NextResponse.json({ error: "No original session found" }, { status: 400 });
  }

  let userId: string;
  try {
    const { payload } = await jwtVerify(superSession, getJwtSecret());
    if (payload.role !== "super_admin" || payload.impersonated === true || !payload.sub) {
      return NextResponse.json(
        { error: "Stored session is not a Super Admin session" },
        { status: 400 },
      );
    }
    userId = payload.sub as string;
  } catch {
    return NextResponse.json({ error: "Stored session is no longer valid" }, { status: 400 });
  }

  const rawReturn = cookieStore.get("schoolaid-return-path")?.value || "";
  const returnPath =
    rawReturn.startsWith("/") && !rawReturn.startsWith("//")
      ? rawReturn
      : "/super-admin/dashboard";

  const response = NextResponse.json({ success: true, redirect: returnPath, user_id: userId });

  response.cookies.set("schoolaid-session", superSession, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 24 * 60 * 60,
    path: "/",
  });

  response.cookies.delete("schoolaid-super-session");
  response.cookies.delete("schoolaid-return-path");
  response.cookies.delete("schoolaid-prev-session");

  return response;
}
