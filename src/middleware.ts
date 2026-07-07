import { NextResponse, type NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Static files and auth page pass through
  if (/\.\w+$/.test(pathname) && !pathname.endsWith(".html"))
    return NextResponse.next();
  if (pathname.startsWith("/auth")) return NextResponse.next();
  if (pathname.startsWith("/_next")) return NextResponse.next();

  // Check for our custom session (bypasses broken Supabase Auth)
  const session = request.cookies.get("schoolaid-session")?.value;
  const sessionEmail = request.cookies.get("schoolaid-email")?.value;

  if (session && sessionEmail) {
    // User is authenticated with custom session
    // Redirect root to dashboard
    if (pathname === "/") {
      return NextResponse.redirect(
        new URL("/super-admin/dashboard", request.url),
      );
    }
    return NextResponse.next();
  }

  // Also try Supabase auth cookie
  const sbToken = request.cookies.get("sb-access-token")?.value;
  if (sbToken) {
    if (pathname === "/") {
      return NextResponse.redirect(
        new URL("/super-admin/dashboard", request.url),
      );
    }
    return NextResponse.next();
  }

  // Not authenticated — redirect to login
  if (!pathname.startsWith("/auth")) {
    return NextResponse.redirect(new URL("/auth/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
