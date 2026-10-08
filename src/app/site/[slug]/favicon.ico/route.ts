import { NextResponse, type NextRequest } from "next/server";
import { resolveSite } from "@/lib/site/load-published";
import { PLATFORM_ICON_PATH, schoolIconUrl } from "@/lib/site/branding";

/**
 * A school's tab icon, at the one address browsers pick for themselves.
 *
 * A browser that finds no declared icon asks for /favicon.ico — a fixed
 * address, on whatever host it is visiting. On a school's own domain the
 * platform's middleware rewrites that request here (see `src/middleware.ts`),
 * and this route answers it with the school's own logo: the website's
 * configured logo when the school set one, the school's profile logo
 * otherwise — the same preference every other branding surface uses.
 *
 * Every failure falls back to the platform's mark rather than an error: an
 * unknown host, a school without a logo, a malformed stored URL. A stranger
 * probing a host also learns nothing new — the homepage itself already says
 * whose site this is.
 *
 * It redirects instead of copying bytes: the logo already lives in public
 * storage behind a CDN, and streaming it through the renderer would put an
 * image download on the application's critical path. The redirect is itself
 * cacheable, so a browser asks this route once per visit, not once per page.
 */
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function GET(request: NextRequest, { params }: Props) {
  const { slug } = await params;
  const result = await resolveSite(slug);

  const icon = result.ok ? schoolIconUrl(result.site) : null;
  const target = icon ?? new URL(PLATFORM_ICON_PATH, request.url).toString();

  return NextResponse.redirect(target, {
    status: 307,
    headers: { "Cache-Control": "public, max-age=300" },
  });
}
