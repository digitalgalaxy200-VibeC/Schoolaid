import { NextResponse } from "next/server";
import { findPortalSchool } from "@/lib/site/portal-school";

/**
 * GET /api/public/portal-school?identifier=<slug or domain>
 *
 * The school behind a portal login page. Public by necessity — the login page is
 * reached before anybody has signed in — so it answers with exactly what a login
 * page shows (name, logo, motto, palette) and nothing that is not already on the
 * school's own website.
 *
 * It REPLACED `/api/public/school-by-slug`, which filtered `is_active` alone and
 * so served an ARCHIVED school's login page. Closing a school must close its
 * portal as well as its website: an unknown, inactive or archived school is a
 * 404 here, and the page shows "School not found".
 */
export async function GET(request: Request) {
  const identifier = new URL(request.url).searchParams.get("identifier") ?? "";
  if (!identifier.trim()) {
    return NextResponse.json({ error: "identifier required" }, { status: 400 });
  }

  const school = await findPortalSchool(identifier);
  if (!school) return NextResponse.json({ error: "School not found" }, { status: 404 });

  return NextResponse.json({
    name: school.name,
    slug: school.slug,
    logo_url: school.logoUrl,
    motto: school.motto,
    palette: school.palette,
  });
}
