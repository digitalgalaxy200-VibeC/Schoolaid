import { NextResponse, type NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Always allow these paths
  if (pathname.startsWith("/api")) return NextResponse.next();
  if (pathname.startsWith("/login")) return NextResponse.next();
  if (pathname.startsWith("/_next")) return NextResponse.next();
  if (pathname.startsWith("/public")) return NextResponse.next();
  if (/\.(svg|png|jpg|jpeg|gif|ico|webp|css|js)$/.test(pathname))
    return NextResponse.next();

  const session = request.cookies.get("schoolaid-session")?.value;
  const sbToken = request.cookies.get("sb-access-token")?.value;

  // Authenticated users
  if (session || sbToken) {
    if (pathname === "/")
      return NextResponse.redirect(
        new URL("/super-admin/dashboard", request.url),
      );
    return NextResponse.next();
  }

  // Unauthenticated users — everything redirects to login except login page itself
  if (pathname === "/")
    return NextResponse.redirect(new URL("/login", request.url));
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
