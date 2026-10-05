import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceClient } from "@/lib/supabase/service";
import { readWebsiteEntitlement } from "./entitlement";
import { readSiteConfig } from "./config";
import { HOME_PAGE_PATH, sectionFromStored } from "./content";
import { publicMediaUrl } from "./media";
import { validateDocument } from "./templates/contracts";
import { loadTemplate, type SiteTemplate } from "./templates/registry";
import { resolvePalette, type SitePalette } from "./theme";
import type { PublishedSiteDocument, SiteLoadResult, SiteViewModel } from "./types";
import type { SiteConfig } from "./config";

/**
 * The one place public website data is read.
 *
 * THE SECURITY BOUNDARY
 * ---------------------
 * `/site/*` is unauthenticated, so this module is the only gate between the
 * public internet and the database. Three rules hold it together:
 *
 *   1. It reads EXACTLY FIVE TABLES — `schools`, `website_configs`,
 *      `school_features`, `website_pages` and `website_sections`. The first
 *      three are the school's existence, entitlement and configuration; the
 *      last two are the content a school has published. Each addition is an
 *      architectural decision, not an edit: `src/lib/site/__tests__` asserts
 *      the set.
 *   2. Every failure path returns a typed reason; nothing throws to the page.
 *      The caller renders 404 for all of them, so a database problem can never
 *      become a 500 that leaks a stack trace to a stranger.
 *   3. It never returns a database row. The template receives a view-model built
 *      field by field from `types.ts` (see `toViewModel`).
 *   4. The document is validated against the template's section contracts before
 *      anything is returned — see `templates/contracts.ts`. A document that
 *      fails is refused, never partially rendered.
 *
 * ARCHIVED IS NOT ACTIVE
 * ----------------------
 * The pre-existing `/api/public/school-by-slug` endpoint filters `is_active`
 * only, so an archived school is still served there (verified on staging
 * 2026-09-26: slug `test` returns 200 with `is_archived = true`). The Website
 * Engine must not repeat that mistake — an archived school is one the platform
 * has closed, and its public site must go dark with it.
 */

/** The exact projection the resolver is allowed to select from `schools`. */
const SCHOOL_FIELDS = "id, name, slug, motto, logo_url, address, phone, email, is_active, is_archived";

type SchoolRow = {
  id: string;
  name: string | null;
  slug: string | null;
  motto: string | null;
  logo_url: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  is_active: boolean;
  is_archived: boolean;
};

/** The exact projection the resolver is allowed to select from `website_sections`. */
const SECTION_FIELDS = "kind, sort_order, is_visible, content";

type SectionRow = {
  kind: string;
  sort_order: number;
  is_visible: boolean;
  content: unknown;
};

/**
 * Loads the school's stored document from its home page, or explains itself.
 *
 * Absent is not broken: a school that has not authored its page yet, or whose
 * home page is switched off, returns `document: null, error: false` — the
 * caller reports `no_content`, which is a 404 to a visitor either way. A read
 * that FAILS is `error`, never an empty page, because a database problem must
 * not be dressed up as "no website here".
 *
 * Visibility and order are decided here rather than in SQL on purpose: a row
 * that this table cannot filter — a column a query forgot, a value that is
 * neither true nor false — must not be able to reach a page, and a hidden
 * section is dropped before validation rather than after.
 */
async function loadStoredDocument(
  supabase: SupabaseClient,
  schoolId: string,
  template: SiteTemplate,
): Promise<{ document: unknown | null; error: boolean }> {
  const { data: page, error: pageError } = await supabase
    .from("website_pages")
    .select("id, is_enabled")
    .eq("school_id", schoolId)
    .eq("path", HOME_PAGE_PATH)
    .maybeSingle();

  if (pageError) return { document: null, error: true };
  if (!page) return { document: null, error: false };

  const pageRow = page as { id: string; is_enabled: boolean };
  if (pageRow.is_enabled !== true) return { document: null, error: false };

  const { data: rows, error: sectionsError } = await supabase
    .from("website_sections")
    .select(SECTION_FIELDS)
    .eq("school_id", schoolId)
    .eq("page_id", pageRow.id);

  if (sectionsError) return { document: null, error: true };

  const visible = ((rows ?? []) as SectionRow[])
    .filter((row) => row.is_visible === true && typeof row.kind === "string")
    .sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0))
    .map((row) => sectionFromStored(row));

  if (visible.length === 0) return { document: null, error: false };

  return {
    document: {
      templateKey: template.key,
      templateVersion: template.version,
      sections: visible,
    },
    error: false,
  };
}

/**
 * Resolves a public site for a slug, or explains why there is none.
 *
 * The client and the document loader are injectable so the cause matrix
 * (archived, disabled, failing entitlement read, invalid document, …) can be
 * tested against a fake without a database.
 */
export async function resolveSite(
  identifier: string,
  deps: {
    supabase?: SupabaseClient;
    loadDocument?: (templateKey: string) => unknown | Promise<unknown>;
  } = {},
): Promise<SiteLoadResult> {
  if (!identifier || typeof identifier !== "string") return { ok: false, reason: "unknown_school" };

  const supabase = deps.supabase ?? getServiceClient();
  const cleanId = identifier.trim().toLowerCase();

  // 1. Try resolving by slug first
  let { data: schoolData, error: schoolError } = await supabase
    .from("schools")
    .select(SCHOOL_FIELDS)
    .eq("slug", identifier.trim())
    .maybeSingle();

  if (schoolError) return { ok: false, reason: "error" };

  // 2. If no school by slug, try resolving by custom domain on website_configs
  if (!schoolData) {
    const { data: configData, error: domainError } = await supabase
      .from("website_configs")
      .select("school_id")
      .eq("custom_domain", cleanId)
      .maybeSingle();

    if (domainError) return { ok: false, reason: "error" };

    if (configData?.school_id) {
      const res = await supabase
        .from("schools")
        .select(SCHOOL_FIELDS)
        .eq("id", configData.school_id)
        .maybeSingle();

      if (res.error) return { ok: false, reason: "error" };
      schoolData = res.data;
    }
  }

  if (!schoolData) return { ok: false, reason: "unknown_school" };

  const school = schoolData as SchoolRow;
  if (!school.is_active) return { ok: false, reason: "school_inactive" };
  if (school.is_archived) return { ok: false, reason: "school_archived" };

  const entitlement = await readWebsiteEntitlement(supabase, school.id);
  if (entitlement.error) return { ok: false, reason: "error" };
  if (!entitlement.enabled) return { ok: false, reason: "feature_disabled" };

  const { data: configData, error: configError } = await supabase
    .from("website_configs")
    .select("template_key, status, theme, contact, seo")
    .eq("school_id", school.id)
    .maybeSingle();

  if (configError) return { ok: false, reason: "error" };
  if (!configData) return { ok: false, reason: "not_configured" };

  const config = configData as { template_key: string | null; status: string | null };
  if (config.status === "suspended") return { ok: false, reason: "suspended" };
  if (config.status !== "active") return { ok: false, reason: "disabled" };

  // Branding, contact and SEO. `readSiteConfig` never throws and never returns
  // a partial object: a stored value this platform no longer recognises (a
  // removed palette, a malformed URL) degrades to the default rather than
  // taking a live school site down.
  const siteConfig = readSiteConfig(configData as Record<string, unknown>);
  const palette = resolvePalette(siteConfig.theme.palette);

  // A school may put its own logo on the website; otherwise the site shows the
  // school's own logo, which is what every other surface uses.
  const logoUrl = siteConfig.theme.logoPath
    ? publicMediaUrl(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", siteConfig.theme.logoPath)
    : null;

  const template = loadTemplate(config.template_key ?? "");
  if (!template) return { ok: false, reason: "not_configured" };

  // The document loader is injectable for tests; in production the document is
  // read from the school's stored pages and sections, never from code.
  let rawDocument: unknown | null;
  if (deps.loadDocument) {
    rawDocument = await deps.loadDocument(template.key);
  } else {
    const loaded = await loadStoredDocument(supabase, school.id, template);
    if (loaded.error) return { ok: false, reason: "error" };
    rawDocument = loaded.document;
  }
  if (!rawDocument) return { ok: false, reason: "no_content" };

  // A public page renders only what the platform has validated. A document that
  // fails its contracts is refused outright rather than partially rendered —
  // half a page is a worse failure than none, because nobody looks for it.
  const validated = validateDocument(rawDocument);
  if (!validated.ok) {
    console.error(
      `[site] refusing to render an invalid document for school ${school.id} (${template.key}): ${validated.errors.join("; ")}`,
    );
    return { ok: false, reason: "invalid_document" };
  }

  return { ok: true, site: toViewModel(school, validated.document, { logoUrl, palette, siteConfig }) };
}

/**
 * Builds the public view-model field by field.
 *
 * A spread (`{ ...school }`) would be shorter and would also publish every
 * column anyone adds to `schools` in future — grading scale, currency,
 * subscription state and whatever comes next. Naming the fields is the point.
 */
function toViewModel(
  school: SchoolRow,
  document: PublishedSiteDocument,
  extras: { logoUrl: string | null; palette: SitePalette; siteConfig: SiteConfig },
): SiteViewModel {
  return {
    school: {
      name: school.name ?? "",
      slug: school.slug ?? "",
      motto: school.motto,
      logoUrl: extras.logoUrl ?? school.logo_url,
      address: school.address,
      phone: school.phone,
      email: school.email,
    },
    templateKey: document.templateKey,
    templateVersion: document.templateVersion,
    // Already normalised by the section contracts: a section cannot carry a
    // field its kind does not declare.
    sections: document.sections,
    theme: { paletteId: extras.palette.id, colors: extras.palette.colors },
    contact: extras.siteConfig.contact,
    seo: extras.siteConfig.seo,
  };
}
