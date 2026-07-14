import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { getJwtSecret } from "./jwt-secret";

export async function verifySuperAdmin(request: Request): Promise<{ authorized: boolean; userId: string | null }> {
  // 1. Basic CSRF Protection: Ensure mutating requests come from our own domain
  if (request.method !== "GET") {
    const origin = request.headers.get("origin") || request.headers.get("referer") || "";
    // Allow localhost and vercel deployment domains
    if (origin && !origin.includes("localhost") && !origin.includes("schoolaid")) {
      console.warn("CSRF Blocked request from unauthorized origin:", origin);
      return { authorized: false, userId: null };
    }
  }

  const cookieStore = await cookies();

  // NOTE: a previous version of this function also accepted ANY authenticated
  // Supabase GoTrue session here (cookie "sb-access-token") as proof of
  // super-admin access, without checking the user's role at all — meaning any
  // logged-in teacher/student/school-admin would have passed this check.
  // Nothing in the app currently sets that cookie (login only issues the
  // custom "schoolaid-session" JWT below), so it was dead code in practice —
  // but dangerous dead code. It has been removed. If native Supabase sessions
  // are introduced later, re-add this branch with an explicit lookup of
  // profiles.role === 'super_admin' for that user — never "any valid session".

  const customSession = cookieStore.get("schoolaid-session")?.value;
  if (customSession) {
    try {
      const { payload } = await jwtVerify(customSession, getJwtSecret());
      if (payload.role === "super_admin" && typeof payload.sub === "string") {
        // Use the real user id from the token (previously this returned a
        // hardcoded placeholder UUID for every super admin, which meant the
        // support_logs audit trail for impersonation could never tell which
        // super admin performed a given action — see docs/CORRECTIONS_SECURITE.md).
        return { authorized: true, userId: payload.sub };
      }
    } catch {
      // Invalid JWT -> fallthrough
    }
  }

  return { authorized: false, userId: null }; // Unauthorized
}
