import { NextResponse, type NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/api")) return NextResponse.next();
  if (/\.\w+$/.test(pathname) && !pathname.endsWith(".html"))
    return NextResponse.next();
  if (pathname.startsWith("/login")) return NextResponse.next();
  if (pathname.startsWith("/_next")) return NextResponse.next();

  const session = request.cookies.get("schoolaid-session")?.value;
  const sbToken = request.cookies.get("sb-access-token")?.value;

  if (session || sbToken) {
    if (pathname === "/")
      return NextResponse.redirect(
        new URL("/super-admin/dashboard", request.url),
      );
    return NextResponse.next();
  }

  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)]"],
};
