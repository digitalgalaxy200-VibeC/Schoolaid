import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { getJwtSecret } from "@/lib/jwt-secret";
import { isPlatformHost, normaliseHost } from "@/lib/site/hosts";

const ROLE_ROUTES: Record<string, string> = {
  super_admin: "/super-admin",
  school_admin: "/school-admin",
  teacher: "/teacher",
  student: "/student",
};

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Which host is this? Decided first, because it changes what the root path
  // and the login page MEAN: on a school's own domain both belong to the school.
  const host = normaliseHost(request.headers.get("host"));
  const platformHost = isPlatformHost(host);

  // API, static files, auth pages always pass through
  if (pathname.startsWith("/api")) return NextResponse.next();
  if (/\.\w+$/.test(pathname) && !pathname.endsWith(".html")) return NextResponse.next();

  // A school's own domain: the root is its website, and /login is ITS login
  // (with its logo and colours) rather than the platform's. Both rewrites are
  // the same idea — the school is identified by host, and the page resolves and
  // refuses it itself, so middleware never needs a database on the hot path.
  if (!platformHost && (pathname === "/" || pathname === "")) {
    return NextResponse.rewrite(new URL(`/site/${encodeURIComponent(host)}`, request.url));
  }
  if (!platformHost && pathname === "/login") {
    return NextResponse.rewrite(new URL(`/school/${encodeURIComponent(host)}/login`, request.url));
  }

  if (pathname.startsWith("/login")) return NextResponse.next();
  if (pathname.startsWith("/school/") && pathname.endsWith("/login")) return NextResponse.next();
  if (pathname.startsWith("/change-password")) return NextResponse.next();
  if (pathname.startsWith("/_next")) return NextResponse.next();

  // Public school websites (Website Engine). Unauthenticated by design: the
  // renderer enforces every gate itself — feature flag, school state (active and
  // not archived), configuration status — and answers 404 for all of them.
  if (pathname.startsWith("/site/")) return NextResponse.next();

  // Public marketing landing page (custom school domains were rewritten above).
  if (pathname === "/") return NextResponse.next();

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
