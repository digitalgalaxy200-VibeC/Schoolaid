import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const email = request.cookies.get("schoolaid-email")?.value;
  const session = request.cookies.get("schoolaid-session")?.value;
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  return NextResponse.json({ email: email || "Admin" });
}
