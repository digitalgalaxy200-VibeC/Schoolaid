import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Dashboard path for each role
function getDashboard(role: string): string {
  switch (role) {
    case "super_admin":    return "/super-admin/dashboard";
    case "school_admin":   return "/school-admin/dashboard";
    case "teacher":        return "/teacher/dashboard";
    case "student":        return "/student/dashboard";
    default:               return "/auth/login";
  }
}

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const { pathname } = request.nextUrl;
  const isAuthRoute   = pathname.startsWith("/auth");
  const isStaticFile  = /\.(.+)$/.test(pathname);   // e.g. .png, .svg

  // Let static files through immediately — no auth needed
  if (isStaticFile) return supabaseResponse;

  // Build Supabase client from env (reads .env.local automatically)
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Get the current logged-in user (safe — never trusts the client)
  const { data: { user } } = await supabase.auth.getUser();

  // ── NOT logged in ──────────────────────────────────────────────
  if (!user) {
    // Auth pages (login) are always accessible
    if (isAuthRoute) return supabaseResponse;
    // Everything else → send to login
    return NextResponse.redirect(new URL("/auth/login", request.url));
  }

  // ── LOGGED IN ──────────────────────────────────────────────────
  const role =
    (user.app_metadata?.role as string) ||
    (user.user_metadata?.role as string) ||
    "";

  // Already on an auth page → send them to their dashboard
  if (isAuthRoute) {
    return NextResponse.redirect(new URL(getDashboard(role), request.url));
  }

  // Wrong role trying to access another role's area → back to their dashboard
  if (pathname.startsWith("/super-admin")  && role !== "super_admin")  {
    return NextResponse.redirect(new URL(getDashboard(role), request.url));
  }
  if (pathname.startsWith("/school-admin") && role !== "school_admin") {
    return NextResponse.redirect(new URL(getDashboard(role), request.url));
  }
  if (pathname.startsWith("/teacher")      && role !== "teacher")      {
    return NextResponse.redirect(new URL(getDashboard(role), request.url));
  }
  if (pathname.startsWith("/student")      && role !== "student")      {
    return NextResponse.redirect(new URL(getDashboard(role), request.url));
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    // Run on all routes except Next.js internals
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
