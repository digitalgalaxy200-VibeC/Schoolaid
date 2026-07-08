import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const superSession = cookieStore.get("schoolaid-super-session")?.value;

  const response = NextResponse.json({ success: true, redirect: "/super-admin/dashboard" });

  if (superSession) {
    // Restore original super admin session
    response.cookies.set("schoolaid-session", superSession, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 86400,
      path: "/",
    });
    // Clear the backup cookie
    response.cookies.delete("schoolaid-super-session");
  } else {
    // If somehow missing, just log them out
    response.cookies.delete("schoolaid-session");
    response.cookies.delete("schoolaid-email");
    return NextResponse.json({ success: true, redirect: "/login" });
  }

  return response;
}
