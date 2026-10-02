import { NextResponse } from "next/server";
import { verifySchoolAdmin } from "@/lib/school-auth";
import { readSiteConfig, validateSiteConfig } from "@/lib/site/config";
import { readWebsiteEntitlement } from "@/lib/site/entitlement";
import { loadTemplate } from "@/lib/site/templates/registry";
import { getServiceClient } from "@/lib/supabase/service";

/**
 * /api/school-admin/website/config — the school's website configuration.
 *
 * GET returns the current configuration plus the template it renders through.
 * PUT replaces it wholesale (no partial updates), validating before anything is
 * written.
 *
 * A school without the `website` flag is refused on both verbs: the CMS screens
 * are reachable by URL, so the gate has to be here rather than in the menu that
 * happens to be hidden.
 */

async function entitlementFor(schoolId: string) {
  const supabase = getServiceClient();
  return readWebsiteEntitlement(supabase, schoolId);
}

export async function GET() {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized || !school_id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const entitlement = await entitlementFor(school_id);
  if (entitlement.error) {
    return NextResponse.json({ error: entitlement.error }, { status: 500 });
  }
  if (!entitlement.enabled) {
    return NextResponse.json({ enabled: false }, { status: 200 });
  }

  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("website_configs")
    .select("template_key, status, theme, contact, seo, custom_domain, domain_status")
    .eq("school_id", school_id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // A missing row is normal: rows are created lazily, on first save.
  const row = (data ?? {}) as Record<string, unknown>;
  const template = data ? loadTemplate(String(row.template_key ?? "")) : null;
  const config = readSiteConfig(row);

  const { data: schoolData } = await supabase
    .from("schools")
    .select("name, slug, motto, logo_url, address, phone, email")
    .eq("id", school_id)
    .maybeSingle();

  return NextResponse.json({
    enabled: true,
    status: data ? (row.status ?? "active") : null,
    template: template
      ? { key: template.key, version: template.version, label: template.label }
      : null,
    school: schoolData ?? null,
    custom_domain: (row.custom_domain as string | null) ?? null,
    domain_status: (row.domain_status as string | null) ?? "active",
    config: {
      theme: { palette: config.theme.palette, logo_path: config.theme.logoPath },
      contact: config.contact,
      seo: config.seo,
    },
  });
}

export async function PUT(request: Request) {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized || !school_id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const entitlement = await entitlementFor(school_id);
  if (entitlement.error) {
    return NextResponse.json({ error: entitlement.error }, { status: 500 });
  }
  if (!entitlement.enabled) {
    return NextResponse.json(
      { error: "The website is not enabled for this school." },
      { status: 403 },
    );
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const validated = validateSiteConfig(body);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.errors.join("; ") }, { status: 400 });
  }

  // Optional custom domain parsing & cleaning
  let cleanDomain: string | null = null;
  if (typeof body?.custom_domain === "string" && body.custom_domain.trim()) {
    cleanDomain = body.custom_domain
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//i, "")
      .replace(/\/.*$/, "");

    if (!/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i.test(cleanDomain)) {
      return NextResponse.json(
        { error: "Invalid domain format (e.g. yourschool.edu.ng or school.com)." },
        { status: 400 },
      );
    }
  }

  const supabase = getServiceClient();

  // A logo chosen from the library must be THIS school's, active, and an image
  // we issued a path for. A foreign path would otherwise render another
  // school's asset on this school's page.
  const logoPath = validated.config.theme.logoPath;
  if (logoPath) {
    const { data: media, error: mediaError } = await supabase
      .from("website_media")
      .select("id")
      .eq("school_id", school_id)
      .eq("path", logoPath)
      .eq("status", "active")
      .maybeSingle();

    if (mediaError) return NextResponse.json({ error: mediaError.message }, { status: 500 });
    if (!media) {
      return NextResponse.json(
        { error: "That image is not in this school's media library." },
        { status: 400 },
      );
    }
  }

  // Upsert: the configuration row is created on first save, which is why no
  // migration ever needed to backfill one row per school.
  const { error: writeError } = await supabase.from("website_configs").upsert(
    {
      school_id,
      custom_domain: cleanDomain,
      theme: { palette: validated.config.theme.palette, ...(logoPath ? { logo_path: logoPath } : {}) },
      contact: Object.fromEntries(
        Object.entries(validated.config.contact).filter(([, value]) => value !== null),
      ),
      seo: Object.fromEntries(
        Object.entries(validated.config.seo).filter(([, value]) => value !== null),
      ),
    },
    { onConflict: "school_id" },
  );

  if (writeError) {
    if (writeError.code === "23505" || writeError.message?.includes("unique")) {
      return NextResponse.json(
        { error: "This domain is already registered to another school." },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: writeError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, config: validated.config, custom_domain: cleanDomain });
}
