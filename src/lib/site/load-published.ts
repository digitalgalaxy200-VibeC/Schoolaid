import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceClient } from "@/lib/supabase/service";
import { readWebsiteEntitlement } from "./entitlement";
import { loadFixtureDocument } from "./fixtures/classic.v1.document";
import { validateDocument } from "./templates/contracts";
import { loadTemplate } from "./templates/registry";
import type { PublishedSiteDocument, SiteLoadResult, SiteViewModel } from "./types";

/**
 * The one place public website data is read.
 *
 * THE SECURITY BOUNDARY
 * ---------------------
 * `/site/*` is unauthenticated, so this module is the only gate between the
 * public internet and the database. Three rules hold it together:
 *
 *   1. It reads EXACTLY THREE TABLES — `schools`, `website_configs` and
 *      `school_features`. Adding a fourth is an architectural decision, not an
 *      edit: `src/lib/site/__tests__` asserts the set.
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

/**
 * Resolves a public site for a slug, or explains why there is none.
 *
 * The client and the document loader are injectable so the cause matrix
 * (archived, disabled, failing entitlement read, invalid document, …) can be
 * tested against a fake without a database.
 */
export async function resolveSite(
  slug: string,
  deps: {
    supabase?: SupabaseClient;
    loadDocument?: (templateKey: string) => unknown;
  } = {},
): Promise<SiteLoadResult> {
  if (!slug || typeof slug !== "string") return { ok: false, reason: "unknown_school" };

  const supabase = deps.supabase ?? getServiceClient();

  const { data: schoolData, error: schoolError } = await supabase
    .from("schools")
    .select(SCHOOL_FIELDS)
    .eq("slug", slug)
    .maybeSingle();

  if (schoolError) return { ok: false, reason: "error" };
  if (!schoolData) return { ok: false, reason: "unknown_school" };

  const school = schoolData as SchoolRow;
  if (!school.is_active) return { ok: false, reason: "school_inactive" };
  if (school.is_archived) return { ok: false, reason: "school_archived" };

  const entitlement = await readWebsiteEntitlement(supabase, school.id);
  if (entitlement.error) return { ok: false, reason: "error" };
  if (!entitlement.enabled) return { ok: false, reason: "feature_disabled" };

  const { data: configData, error: configError } = await supabase
    .from("website_configs")
    .select("template_key, status")
    .eq("school_id", school.id)
    .maybeSingle();

  if (configError) return { ok: false, reason: "error" };
  if (!configData) return { ok: false, reason: "not_configured" };

  const config = configData as { template_key: string | null; status: string | null };
  if (config.status === "suspended") return { ok: false, reason: "suspended" };
  if (config.status !== "active") return { ok: false, reason: "disabled" };

  const template = loadTemplate(config.template_key ?? "");
  if (!template) return { ok: false, reason: "not_configured" };

  const loadDocument = deps.loadDocument ?? loadFixtureDocument;
  const rawDocument = loadDocument(template.key);
  if (!rawDocument) return { ok: false, reason: "not_configured" };

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

  return { ok: true, site: toViewModel(school, validated.document) };
}

/**
 * Builds the public view-model field by field.
 *
 * A spread (`{ ...school }`) would be shorter and would also publish every
 * column anyone adds to `schools` in future — grading scale, currency,
 * subscription state and whatever comes next. Naming the fields is the point.
 */
function toViewModel(school: SchoolRow, document: PublishedSiteDocument): SiteViewModel {
  return {
    school: {
      name: school.name ?? "",
      slug: school.slug ?? "",
      motto: school.motto,
      logoUrl: school.logo_url,
      address: school.address,
      phone: school.phone,
      email: school.email,
    },
    templateKey: document.templateKey,
    templateVersion: document.templateVersion,
    // Already normalised by the section contracts: a section cannot carry a
    // field its kind does not declare.
    sections: document.sections,
  };
}
