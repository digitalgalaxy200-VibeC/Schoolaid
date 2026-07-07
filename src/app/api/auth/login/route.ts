import { NextResponse } from "next/server";
import { SignJWT } from "jose";
import { checkRateLimit } from "@/lib/rate-limit";
import { createClient } from "@supabase/supabase-js";

const getJwtSecret = () =>
  new TextEncoder().encode(
    process.env.JWT_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  );

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for") || "127.0.0.1";
  if (!(await checkRateLimit(ip, 5, 60000))) {
    return NextResponse.json({ error: "Too many attempts." }, { status: 429 });
  }

  const { email, password } = await request.json();
  if (!email || !password) {
    return NextResponse.json(
      { error: "Email and password required" },
      { status: 400 },
    );
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  try {
    // Try signing in via Supabase Auth
    const { data: authData, error: authError } =
      await supabase.auth.signInWithPassword({ email, password });

    if (authError) {
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 },
      );
    }

    const userId = authData.user?.id;
    if (!userId) {
      return NextResponse.json({ error: "Account not found" }, { status: 401 });
    }

    // Look up the user's profile to get role and school_id
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, school_id, full_name")
      .eq("id", userId)
      .single();

    if (!profile) {
      return NextResponse.json(
        { error: "Profile not found. Contact admin." },
        { status: 401 },
      );
    }

    // Generate JWT with all claims
    const token = await new SignJWT({
      sub: userId,
      email,
      role: profile.role,
      school_id: profile.school_id,
      full_name: profile.full_name,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("24h")
      .sign(getJwtSecret());

    const response = NextResponse.json({
      success: true,
      role: profile.role,
      redirect: getDashboardPath(profile.role),
    });

    response.cookies.set("schoolaid-session", token, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 86400,
      path: "/",
    });
    response.cookies.set("schoolaid-email", email, {
      secure: true,
      sameSite: "lax",
      maxAge: 86400,
      path: "/",
    });

    return response;
  } catch {
    return NextResponse.json(
      { error: "Login failed. Please try again." },
      { status: 500 },
    );
  }
}

function getDashboardPath(role: string): string {
  switch (role) {
    case "super_admin":
      return "/super-admin/dashboard";
    case "school_admin":
      return "/school-admin/dashboard";
    case "teacher":
      return "/teacher/dashboard";
    case "student":
      return "/student/dashboard";
    default:
      return "/";
  }
}
