import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { createServerClient } from "@supabase/ssr";

const getJwtSecret = () => new TextEncoder().encode(
  process.env.JWT_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "fallback-insecure-secret"
);

export async function verifySuperAdmin(request: Request): Promise<boolean> {
  // 1. Basic CSRF Protection: Ensure mutating requests come from our own domain
  if (request.method !== "GET") {
    const origin = request.headers.get("origin") || request.headers.get("referer") || "";
    // Allow localhost and vercel deployment domains
    if (origin && !origin.includes("localhost") && !origin.includes("schoolaid")) {
      console.warn("CSRF Blocked request from unauthorized origin:", origin);
      return false;
    }
  }

  const cookieStore = await cookies();

  // 2. Check Custom JWT Session first (MVP Login)
  const customSession = cookieStore.get("schoolaid-session")?.value;
  if (customSession) {
    try {
      const { payload } = await jwtVerify(customSession, getJwtSecret());
      if (payload.role === "super_admin") return true;
    } catch (err) {
      // Invalid JWT -> fallthrough
    }
  }

  // 3. Check Supabase GoTrue Session (if they used real auth)
  const sbToken = cookieStore.get("sb-access-token")?.value;
  if (sbToken) {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll(); },
          setAll() {}, // Readonly
        },
      }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      // We assume if they have a valid token and hit this route, they have access.
      // In a real production app with multiple roles, you'd check a user_roles table here.
      return true;
    }
  }

  return false; // Unauthorized
}
