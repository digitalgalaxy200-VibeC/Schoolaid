import { NextResponse, type NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // API, static files, auth pages, and Next.js internals ALWAYS pass through
  if (pathname.startsWith("/api")) return NextResponse.next();
  if (/\.\w+$/.test(pathname) && !pathname.endsWith(".html"))
    return NextResponse.next();
  if (pathname.startsWith("/auth")) return NextResponse.next();
  if (pathname.startsWith("/_next")) return NextResponse.next();

  // If visiting the root URL, always send them to login
  if (pathname === "/") {
    return NextResponse.redirect(new URL("/auth/login", request.url));
  }

  // Check custom session
  const session = request.cookies.get("schoolaid-session")?.value;
  if (session) {
    return NextResponse.next();
  }

  // Check Supabase session
  const sbToken = request.cookies.get("sb-access-token")?.value;
  if (sbToken) {
    return NextResponse.next();
  }

  // Not authenticated, not on auth page → redirect to login
  return NextResponse.redirect(new URL("/auth/login", request.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
