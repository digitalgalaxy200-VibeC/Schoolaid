import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const { pathname } = request.nextUrl;

  // Allow public routes without any auth check
  const isPublicRoute = pathname === "/" || pathname.startsWith("/_next");
  const isAuthRoute = pathname.startsWith("/auth");
  const isStaticFile = pathname.includes(".") && !pathname.endsWith(".html");

  if (isPublicRoute || isStaticFile) {
    return supabaseResponse;
  }

  // Create Supabase client with error handling
  let user = null;

  try {
    const supabaseUrl =
      process.env.NEXT_PUBLIC_SUPABASE_URL ||
      "https://acxgfhvptoluhlxuttly.supabase.co";
    const supabaseKey =
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFjeGdmaHZwdG9sdWhseHV0dGx5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM0MDQzNzksImV4cCI6MjA5ODk4MDM3OX0.aku3B1StfTn2wJBi8DWO5IncpQexQ9zY7_rRMgS34eM";

    if (!supabaseUrl || !supabaseKey) {
      // No Supabase config — block everything except auth
      if (!isAuthRoute) {
        return NextResponse.redirect(new URL("/auth/login", request.url));
      }
      return supabaseResponse;
    }

    const supabase = createServerClient(supabaseUrl, supabaseKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    });

    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch (error) {
    // Auth service unavailable — block protected routes, allow auth pages
    if (!isAuthRoute) {
      return NextResponse.redirect(new URL("/auth/login", request.url));
    }
    return supabaseResponse;
  }

  // ---- Auth routing logic (only if Supabase is reachable) ----

  // User not logged in
  if (!user) {
    // Auth pages always accessible
    if (isAuthRoute) return supabaseResponse;
    // Everything else → login
    return NextResponse.redirect(new URL("/auth/login", request.url));
  }

  // User IS logged in
  const role =
    (user.app_metadata?.role as string) ||
    (user.user_metadata?.role as string) ||
    "student";

  // On auth pages → redirect to dashboard
  if (isAuthRoute) {
    const dashboard = getDashboardPath(role);
    return NextResponse.redirect(new URL(dashboard, request.url));
  }

  // Role-based route protection
  if (pathname.startsWith("/super-admin") && role !== "super_admin") {
    return NextResponse.redirect(new URL("/auth/login", request.url));
  }
  if (pathname.startsWith("/school-admin") && role !== "school_admin") {
    return NextResponse.redirect(new URL("/auth/login", request.url));
  }
  if (pathname.startsWith("/teacher") && role !== "teacher") {
    return NextResponse.redirect(new URL("/auth/login", request.url));
  }
  if (pathname.startsWith("/student") && role !== "student") {
    return NextResponse.redirect(new URL("/auth/login", request.url));
  }

  return supabaseResponse;
}

function getDashboardPath(role: string): string {
  switch (role) {
    case "super_admin":
      return "/super-admin/dashboard";
    case "school_admin":
      return "/school-admin/dashboard";
    case "teacher":
      return "/teacher/dashboard";
    case "student":
      return "/student/dashboard";
    default:
      return "/auth/login";
  }
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
