import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { getJwtSecret } from "@/lib/jwt-secret";

/**
 * CSRF guard for mutating requests.
 *
 * Browsers send `Origin` on cross-origin AND same-origin POSTs, so requiring it
 * to match the request's own host is sufficient and robust.
 *
 * The previous implementation substring-matched the origin against
 * "schoolaid"/"vercel.app"/"localhost", which any attacker-controlled host such
 * as `https://notschoolaid.evil.com` satisfied.
 *
 * Non-browser callers (scripts, curl) send no Origin and present no CSRF
 * surface, so they pass through.
 *
 * Extra hosts can be allowed via a comma-separated `ALLOWED_ORIGINS` env var.
 *
 * Exported for reuse (Phase 16): the CBT guard applies the same rule to new
 * routes rather than growing a second, weaker copy of it.
 */
export function originAllowed(request: Request): boolean {
  if (request.method === "GET" || request.method === "HEAD") return true;

  const source = request.headers.get("origin") || request.headers.get("referer");
  if (!source) return true;

  let host: string;
  try {
    host = new URL(source).host;
  } catch {
    return false;
  }

  // Use forwarded/host headers: behind Vercel the internal request URL host is
  // not the public host the browser sent.
  const requestHost =
    request.headers.get("x-forwarded-host") ||
    request.headers.get("host") ||
    new URL(request.url).host;

  if (host === requestHost) return true;

  const extra = (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  for (const entry of extra) {
    try {
      if (new URL(entry).host === host) return true;
    } catch {
      /* ignore malformed allowlist entries */
    }
  }

  return false;
}

/**
 * Verifies a genuine, platform-level Super Admin session.
 *
 * Only the custom `schoolaid-session` JWT is accepted. The previous Supabase
 * GoTrue branch was removed: it queried a `users` table that does not exist in
 * any migration or in the live staging database, and nothing in the codebase
 * ever sets `sb-access-token`, so it could only ever fail.
 *
 * Impersonation tokens (`impersonated: true`) are explicitly rejected here. An
 * impersonated session is school-scoped and must never widen into platform
 * reach; such sessions are handled by their own dedicated code paths.
 */
export async function verifySuperAdmin(
  request: Request,
): Promise<{ authorized: boolean; userId: string | null }> {
  if (!originAllowed(request)) {
    console.warn("[api-auth] CSRF blocked: request origin does not match host");
    return { authorized: false, userId: null };
  }

  const cookieStore = await cookies();
  const customSession = cookieStore.get("schoolaid-session")?.value;

  if (customSession) {
    try {
      const { payload } = await jwtVerify(customSession, getJwtSecret());
      if (
        payload.role === "super_admin" &&
        payload.impersonated !== true &&
        payload.sub
      ) {
        return { authorized: true, userId: payload.sub as string };
      }
    } catch {
      /* invalid JWT -> unauthorized */
    }
  }

  return { authorized: false, userId: null };
}
