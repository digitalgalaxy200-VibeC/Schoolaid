import { NextResponse, type NextRequest } from "next/server";
import { resolveSite } from "@/lib/site/load-published";
import { buildSiteManifest } from "@/lib/site/branding";

/**
 * The "add to home screen" identity of one school's website.
 *
 * Without this, a phone that installs a school's site from its own domain
 * would install it under the platform's name and platform icons — the same
 * leak as the favicon, one surface further along. The manifest a school's
 * site declares is built here from the school's own configuration, by the
 * same rules as every other branding surface (`lib/site/branding.ts`).
 *
 * An unknown host or a school with no site answers 404, exactly like the
 * website it belongs to; a browser ignores a manifest it cannot load, so the
 * failure mode is "no custom install identity", never a broken page.
 */
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function GET(_request: NextRequest, { params }: Props) {
  const { slug } = await params;
  const result = await resolveSite(slug);
  if (!result.ok) return new NextResponse("Not found", { status: 404 });

  return NextResponse.json(buildSiteManifest(result.site), {
    headers: {
      "Content-Type": "application/manifest+json",
      "Cache-Control": "public, max-age=300",
    },
  });
}
