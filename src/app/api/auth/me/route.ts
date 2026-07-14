import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { getServiceClient } from "@/lib/supabase/service";
import { getJwtSecret } from "@/lib/jwt-secret";

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
      must_change_password: false,
    };

    // Check must_change_password for students, teachers, and school admins
    if (payload.sub && payload.role) {
      try {
        const supabase = getServiceClient();
        const table =
          payload.role === "student"
            ? "students"
            : payload.role === "teacher"
              ? "teachers"
              : payload.role === "school_admin"
                ? "school_admins"
                : null;

        if (table) {
          const { data: record } = await supabase
            .from(table)
            .select("must_change_password")
            .eq("profile_id", payload.sub)
            .single();
          response.must_change_password = record?.must_change_password ?? false;
        }
      } catch {
        response.must_change_password = false;
      }
    }

    return NextResponse.json(response);
  } catch {
    return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  }
}
