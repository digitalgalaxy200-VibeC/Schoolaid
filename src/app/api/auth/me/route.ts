import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";

const getJwtSecret = () =>
  new TextEncoder().encode(
    process.env.JWT_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  );

export async function GET() {
  const cookieStore = await cookies();
  const session = cookieStore.get("schoolaid-session")?.value;

  if (!session)
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  try {
    const { payload } = await jwtVerify(session, getJwtSecret());

    return NextResponse.json({
      email: payload.email || "",
      role: payload.role || "",
      school_id: payload.school_id || null,
      full_name: payload.full_name || "",
      sub: payload.sub || "",
      impersonated: !!payload.impersonated,
    });
  } catch {
    return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  }
}
