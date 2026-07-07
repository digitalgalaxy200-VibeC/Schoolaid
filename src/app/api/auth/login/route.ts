import { NextResponse } from "next/server";
import { SignJWT } from "jose";
import { checkRateLimit } from "@/lib/rate-limit";

// Use environment variables for signing
const getJwtSecret = () => new TextEncoder().encode(
  process.env.JWT_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "fallback-insecure-secret"
);

export async function POST(request: Request) {
  // 1. Rate Limiting
  const ip = request.headers.get("x-forwarded-for") || "127.0.0.1";
  if (!checkRateLimit(ip, 5, 60000)) {
    return NextResponse.json(
      { error: "Too many login attempts. Please try again later." },
      { status: 429 }
    );
  }

  const { email, password } = await request.json();
  if (!email || !password) {
    return NextResponse.json(
      { error: "Email and password required" },
      { status: 400 },
    );
  }

  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  try {
    // Use service role to create a session via admin API
    const tokenRes = await fetch(
      `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: ANON_KEY },
        body: JSON.stringify({ email, password }),
      },
    );

    if (tokenRes.ok) {
      // Auth actually worked! Use the token directly.
      const data = await tokenRes.json();
      const response = NextResponse.json({
        success: true,
        role: "super_admin",
      });

      response.cookies.set("sb-access-token", data.access_token, {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        maxAge: data.expires_in || 3600,
        path: "/",
      });
      if (data.refresh_token) {
        response.cookies.set("sb-refresh-token", data.refresh_token, {
          httpOnly: true,
          secure: true,
          sameSite: "lax",
          maxAge: 60 * 60 * 24 * 30,
          path: "/",
        });
      }
      return response;
    }

    // GoTrue is broken. Verify password against database directly.
    // Query the auth user to check credentials via the REST API (which works fine)
    const userRes = await fetch(
      `${SUPABASE_URL}/rest/v1/rpc/verify_login_credentials`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({ p_email: email, p_password: password }),
      },
    );

    if (userRes.ok) {
      const result = await userRes.json();
      if (result?.valid && result?.token) {
        const response = NextResponse.json({
          success: true,
          role: result.role || "super_admin",
        });
        response.cookies.set("sb-access-token", result.token, {
          httpOnly: true,
          secure: true,
          sameSite: "lax",
          maxAge: 3600,
          path: "/",
        });
        return response;
      }
    }
  } catch (err) {
    // Fall through to error
  }

  // For MVP: hardcoded demo login that bypasses Supabase Auth entirely
  if (email === "admin@schoolaid.com" && password === "Admin123!") {
    // Generate a secure JWT instead of random hex
    const sessionToken = await new SignJWT({ email, role: "super_admin" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(getJwtSecret());

    const response = NextResponse.json({ success: true, role: "super_admin" });

    response.cookies.set("schoolaid-session", sessionToken, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 3600,
      path: "/",
    });
    // This is ok to keep for UI, it's not trusted for auth
    response.cookies.set("schoolaid-email", email, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 3600,
      path: "/",
    });

    return response;
  }

  return NextResponse.json(
    { error: "Invalid email or password" },
    { status: 401 },
  );
}
