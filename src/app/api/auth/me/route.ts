import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { getServiceClient } from "@/lib/supabase/service";

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

    const response: Record<string, unknown> = {
      email: payload.email || "",
      role: payload.role || "",
      school_id: payload.school_id || null,
      full_name: payload.full_name || "",
      sub: payload.sub || "",
      impersonated: !!payload.impersonated,
    };

    // For students, check if they must change their password
    if (payload.role === "student" && payload.sub) {
      try {
        const supabase = getServiceClient();
        const { data: student } = await supabase
          .from("students")
          .select("must_change_password")
          .eq("profile_id", payload.sub)
          .single();
        response.must_change_password = student?.must_change_password ?? false;
      } catch {
        response.must_change_password = false;
      }
    }

    return NextResponse.json(response);
  } catch {
    return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  }
}
