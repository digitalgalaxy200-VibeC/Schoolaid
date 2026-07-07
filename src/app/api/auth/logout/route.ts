import { NextResponse } from "next/server";

export async function POST() {
  const response = NextResponse.json({ success: true });
  response.cookies.set("schoolaid-session", "", { maxAge: 0, path: "/" });
  response.cookies.set("schoolaid-email", "", { maxAge: 0, path: "/" });
  return response;
}
