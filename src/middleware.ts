import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

const getJwtSecret = () => new TextEncoder().encode(
  process.env.JWT_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "fallback-insecure-secret"
);

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // API, static files, auth pages, and Next.js internals ALWAYS pass through
  if (pathname.startsWith("/api")) return NextResponse.next();
  if (/\.\w+$/.test(pathname) && !pathname.endsWith(".html"))
    return NextResponse.next();
  if (pathname.startsWith("/login")) return NextResponse.next();
  if (pathname.startsWith("/change-password")) return NextResponse.next();
  if (pathname.startsWith("/_next")) return NextResponse.next();

  // If visiting the root URL, always send them to login
  if (pathname === "/") {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Check custom session
  const session = request.cookies.get("schoolaid-session")?.value;
  if (session) {
    try {
      const { payload } = await jwtVerify(session, getJwtSecret());
      // Force password change for teachers/students on first login
      if (payload.must_change_password === true && !pathname.startsWith("/change-password")) {
        return NextResponse.redirect(new URL("/change-password", request.url));
      }
      return NextResponse.next();
    } catch (err) {
      const res = NextResponse.redirect(new URL("/login", request.url));
      res.cookies.delete("schoolaid-session");
      return res;
    }
  }

  // Check Supabase session
  const sbToken = request.cookies.get("sb-access-token")?.value;
  if (sbToken) {
    return NextResponse.next();
  }

  // Not authenticated, not on auth page → redirect to login
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
