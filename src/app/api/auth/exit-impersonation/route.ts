import { NextResponse } from "next/server";
import { cookies } from "next/headers";

/** POST /api/auth/exit-impersonation — restore original super admin session */
export async function POST() {
  const cookieStore = await cookies();
  const superSession = cookieStore.get("schoolaid-super-session")?.value;

  if (!superSession) {
    return NextResponse.json({ error: "No original session found" }, { status: 400 });
  }

  // Restore the deterministic originating context captured at impersonation time
  const returnPath = cookieStore.get("schoolaid-return-path")?.value || "/super-admin/dashboard";

  const response = NextResponse.json({ success: true, redirect: returnPath });

  // Restore the original super admin session
  response.cookies.set("schoolaid-session", superSession, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 24 * 60 * 60,
    path: "/",
  });

  // Clear the backup and return-path cookies
  response.cookies.delete("schoolaid-super-session");
  response.cookies.delete("schoolaid-return-path");

  return response;
}
