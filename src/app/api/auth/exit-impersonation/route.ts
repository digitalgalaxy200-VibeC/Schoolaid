import { NextResponse } from "next/server";
import { cookies } from "next/headers";

/** POST /api/auth/exit-impersonation — restore original super admin session */
export async function POST() {
  const cookieStore = await cookies();
  const superSession = cookieStore.get("schoolaid-super-session")?.value;

  if (!superSession) {
    return NextResponse.json({ error: "No original session found" }, { status: 400 });
  }

  const response = NextResponse.json({ success: true, redirect: "/super-admin/dashboard" });

  // Restore the original super admin session
  response.cookies.set("schoolaid-session", superSession, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 24 * 60 * 60,
    path: "/",
  });

  // Clear the backup
  response.cookies.delete("schoolaid-super-session");

  return response;
}
