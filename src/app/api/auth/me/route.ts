import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function GET() {
  const cookieStore = await cookies();
  const email = cookieStore.get("schoolaid-email")?.value;
  const session = cookieStore.get("schoolaid-session")?.value;
  if (!session)
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  return NextResponse.json({ email: email || "Admin" });
}
