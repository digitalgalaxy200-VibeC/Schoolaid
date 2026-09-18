import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { getJwtSecret } from "@/lib/jwt-secret";

const ROLE_ROUTES: Record<string, string> = {
  super_admin: "/super-admin",
  school_admin: "/school-admin",
  teacher: "/teacher",
  student: "/student",
};

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // API, static files, auth pages always pass through
  if (pathname.startsWith("/api")) return NextResponse.next();
  if (/\.\w+$/.test(pathname) && !pathname.endsWith(".html")) return NextResponse.next();
  if (pathname.startsWith("/login")) return NextResponse.next();
  if (pathname.startsWith("/school/") && pathname.endsWith("/login")) return NextResponse.next();
  if (pathname.startsWith("/change-password")) return NextResponse.next();
  if (pathname.startsWith("/_next")) return NextResponse.next();

  if (pathname === "/") return NextResponse.redirect(new URL("/login", request.url));

  const session = request.cookies.get("schoolaid-session")?.value;
  if (session) {
    try {
      const { payload } = await jwtVerify(session, getJwtSecret());

      if (payload.must_change_password === true && !pathname.startsWith("/change-password")) {
        return NextResponse.redirect(new URL("/change-password", request.url));
      }

      // Role-based route protection
      const role = payload.role as string;
      for (const [roleKey, routePrefix] of Object.entries(ROLE_ROUTES)) {
        if (pathname.startsWith(routePrefix) && role !== roleKey) {
          // User is trying to access a different role's area — redirect to their own dashboard
          const ownPrefix = ROLE_ROUTES[role];
          if (ownPrefix) {
            return NextResponse.redirect(new URL(`${ownPrefix}/dashboard`, request.url));
          }
          return NextResponse.redirect(new URL("/login", request.url));
        }
      }

      return NextResponse.next();
    } catch {
      const res = NextResponse.redirect(new URL("/login", request.url));
      res.cookies.delete("schoolaid-session");
      return res;
    }
  }

  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
