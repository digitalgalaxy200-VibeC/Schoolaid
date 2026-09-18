import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { getJwtSecret } from "@/lib/jwt-secret";

/**
 * POST /api/auth/exit-impersonation — restore the original Super Admin session.
 *
 * The stored backup is validated before being promoted back into the app. A
 * school-scoped, expired or tampered cookie must never become an active
 * session, and the redirect target is constrained to a local path so a
 * manipulated cookie cannot turn this into an open redirect.
 */
export async function POST() {
  const cookieStore = await cookies();
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

  return response;
}
