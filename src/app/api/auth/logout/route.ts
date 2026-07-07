import { NextResponse } from "next/server";

export async function POST() {
  const response = NextResponse.json({ success: true });

  // Clear all possible session cookies
  response.cookies.set("schoolaid-session", "", { maxAge: 0, path: "/" });
  response.cookies.set("schoolaid-email", "", { maxAge: 0, path: "/" });
  response.cookies.set("sb-access-token", "", { maxAge: 0, path: "/" });
  response.cookies.set("sb-refresh-token", "", { maxAge: 0, path: "/" });

  return response;
}
