import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceClient } from "@/lib/supabase/service";
import { readSiteConfig } from "./config";
import { resolvePalette, type SitePalette } from "./theme";

/**
 * Which school does this login page belong to?
 *
 * The portal login is reached two ways: at `/school/<slug>/login` on a platform
 * host, and at `/login` on a school's own domain (middleware rewrites the host
 * into the slug position). Both end up here, and this is the one place that
 * answers the question — for the login page's branding, and for whether the page
 * exists at all.
 *
 * IDENTIFIER: a slug or a domain, resolved slug-first exactly as the website
 * resolver does (`load-published.ts`), so a school is identified the same way
 * everywhere and there is no second rule to keep in step.
 *
 * AN ARCHIVED SCHOOL HAS NO LOGIN. The platform closes a school by archiving it;
 * its website already goes dark, and `SchoolX → Student Portal` appearing to
 * still exist for a closed school is worse than a 404. Inactive is refused for
 * the same reason. (The endpoint this replaced filtered `is_active` alone, so an
 * archived school's branded login was still served — the mistake the website
 * resolver's header warns about, repeated in a different corner.)
 *
 * THE PALETTE IS COSMETIC, SO THE WEBSITE FLAG IS NOT REQUIRED. A school can
 * have a portal without a website; refusing to brand its login would be the tail
 * wagging the dog. The palette is read the forgiving way (`readSiteConfig` never
 * throws and falls back to the default), so a broken stored value gives a plain
 * login rather than no login.
 */

export type PortalSchool = {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  motto: string | null;
  palette: SitePalette;
};

/** The exact projection allowed to leave this module. */
const SCHOOL_FIELDS = "id, name, slug, logo_url, motto, is_active, is_archived";

type SchoolRow = {
  id: string;
  name: string | null;
  slug: string | null;
  logo_url: string | null;
  motto: string | null;
  is_active: boolean;
  is_archived: boolean;
};

export async function findPortalSchool(
  identifier: string,
  deps: { supabase?: SupabaseClient } = {},
): Promise<PortalSchool | null> {
  if (typeof identifier !== "string") return null;
  const slug = identifier.trim();
  if (!slug) return null;
  const domain = slug.toLowerCase();

  const supabase = deps.supabase ?? getServiceClient();

  // 1. By slug, exactly as written (slugs are stored lowercase; the website
  //    resolver matches them the same way).
  const first = await supabase.from("schools").select(SCHOOL_FIELDS).eq("slug", slug).maybeSingle();
  if (first.error) {
    console.error("[portal] school lookup by slug failed:", first.error.message);
    return null;
  }

  let row = (first.data ?? null) as SchoolRow | null;

  // 2. Otherwise, by the domain the school pointed at us.
  if (!row) {
    const byDomain = await supabase
      .from("website_configs")
      .select("school_id")
      .eq("custom_domain", domain)
      .maybeSingle();
    if (byDomain.error) {
      console.error("[portal] school lookup by domain failed:", byDomain.error.message);
      return null;
    }

    const schoolId = (byDomain.data as { school_id?: string } | null)?.school_id;
    if (schoolId) {
      const byId = await supabase.from("schools").select(SCHOOL_FIELDS).eq("id", schoolId).maybeSingle();
      if (byId.error) {
        console.error("[portal] school lookup by id failed:", byId.error.message);
        return null;
      }
      row = (byId.data ?? null) as SchoolRow | null;
    }
  }

  if (!row) return null;
  if (row.is_active !== true) return null;
  if (row.is_archived === true) return null;

  const { data: config, error: configError } = await supabase
    .from("website_configs")
    .select("theme")
    .eq("school_id", row.id)
    .maybeSingle();
  if (configError) {
    // Branding is optional; a login that cannot read its palette is still a login.
    console.error("[portal] palette read failed:", configError.message);
  }

  const palette = resolvePalette(
    readSiteConfig((config ?? {}) as Record<string, unknown>).theme.palette,
  );

  return {
    id: row.id,
    name: row.name ?? "",
    slug: row.slug ?? "",
    logoUrl: row.logo_url,
    motto: row.motto,
    palette,
  };
}
