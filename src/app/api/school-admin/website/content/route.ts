import { NextResponse } from "next/server";
import { verifySchoolAdmin } from "@/lib/school-auth";
import {
  HOME_PAGE_PATH,
  sectionFromStored,
  validateContentSubmission,
  withTemplateKinds,
} from "@/lib/site/content";
import { readWebsiteEntitlement } from "@/lib/site/entitlement";
import { loadTemplate, type SiteTemplate } from "@/lib/site/templates/registry";
import { getServiceClient } from "@/lib/supabase/service";
import { ValidationErrors, number as numberField, uuid } from "@/lib/validate";

/**
 * /api/school-admin/website/content — the school's page content.
 *
 * GET returns the home page as the editor exchanges it: a draft version, the
 * template it renders through, and the ordered sections (flat: kind, visibility
 * and the kind's own fields together), with hidden placeholders for any kind
 * the template can render but the school has not saved yet.
 *
 * PUT replaces the page's sections wholesale — there are no partial updates —
 * and answers 409 when `draft_version` is not the value it read. The write
 * itself is one database function (`replace_website_page_sections`), so the
 * version claim, the replacement and the version bump cannot half-happen.
 *
 * A school without the `website` flag is refused on both verbs — the screens are
 * reachable by URL, so the gate is here rather than in a menu that happens to
 * be hidden.
 */

type ConfigRow = { template_key: string | null; draft_version: number | null };

/**
 * The school's configuration row, and the template its content renders through.
 * A school that has never saved a configuration row is still offered the
 * default template — the row is created on first content save.
 */
async function readTemplate(
  schoolId: string,
): Promise<{ template: SiteTemplate | null; draftVersion: number; error: string | null }> {
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("website_configs")
    .select("template_key, draft_version")
    .eq("school_id", schoolId)
    .maybeSingle();

  if (error) return { template: null, draftVersion: 0, error: error.message };

  const row = (data ?? null) as ConfigRow | null;
  return {
    template: loadTemplate(row?.template_key ?? "classic"),
    draftVersion: row?.draft_version ?? 0,
    error: null,
  };
}

export async function GET() {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized || !school_id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getServiceClient();
  const entitlement = await readWebsiteEntitlement(supabase, school_id);
  if (entitlement.error) {
    return NextResponse.json({ error: entitlement.error }, { status: 500 });
  }
  if (!entitlement.enabled) {
    return NextResponse.json({ enabled: false }, { status: 200 });
  }

  const { template, draftVersion, error: templateError } = await readTemplate(school_id);
  if (templateError) return NextResponse.json({ error: templateError }, { status: 500 });
  if (!template) {
    return NextResponse.json(
      { error: "This website's template is not available in this deployment." },
      { status: 500 },
    );
  }

  const { data: page, error: pageError } = await supabase
    .from("website_pages")
    .select("id, title")
    .eq("school_id", school_id)
    .eq("path", HOME_PAGE_PATH)
    .maybeSingle();
  if (pageError) return NextResponse.json({ error: pageError.message }, { status: 500 });

  const pageRow = (page ?? null) as { id: string; title: string | null } | null;
  let stored: ReturnType<typeof sectionFromStored>[] = [];

  if (pageRow) {
    const { data: rows, error: sectionsError } = await supabase
      .from("website_sections")
      .select("kind, is_visible, content")
      .eq("school_id", school_id)
      .eq("page_id", pageRow.id)
      .order("sort_order", { ascending: true });
    if (sectionsError) return NextResponse.json({ error: sectionsError.message }, { status: 500 });

    stored = (rows ?? []).map((row) =>
      sectionFromStored(row as { kind: string; is_visible: boolean; content: unknown }),
    );
  }

  // Convenience link for the editor. A missing slug is not an error: the school
  // simply gets no "view your website" link rather than a failed screen.
  const { data: school } = await supabase
    .from("schools")
    .select("slug")
    .eq("id", school_id)
    .maybeSingle();
  const slug = (school as { slug: string | null } | null)?.slug ?? null;

  return NextResponse.json({
    enabled: true,
    draft_version: draftVersion,
    template: { key: template.key, version: template.version, label: template.label },
    page: {
      id: pageRow?.id ?? null,
      title: pageRow?.title ?? "Home",
      // Everything the template can render, whether or not the school has saved
      // it yet, so a block that has never been touched is still offered.
      sections: withTemplateKinds(stored, template),
    },
    preview_path: slug ? `/site/${slug}` : null,
  });
}

export async function PUT(request: Request) {
  const { authorized, school_id } = await verifySchoolAdmin();
  if (!authorized || !school_id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getServiceClient();
  const entitlement = await readWebsiteEntitlement(supabase, school_id);
  if (entitlement.error) {
    return NextResponse.json({ error: entitlement.error }, { status: 500 });
  }
  if (!entitlement.enabled) {
    return NextResponse.json(
      { error: "The website is not enabled for this school." },
      { status: 403 },
    );
  }

  const body = await request.json().catch(() => null);

  const routeErrors = new ValidationErrors();
  const expectedVersion = numberField(body, "draft_version", routeErrors, {
    required: true,
    integer: true,
    min: 0,
  });
  const pageId = uuid(body, "page_id", routeErrors);
  if (!routeErrors.ok) {
    return NextResponse.json({ error: routeErrors.summary() }, { status: 400 });
  }

  const { template, error: templateError } = await readTemplate(school_id);
  if (templateError) return NextResponse.json({ error: templateError }, { status: 500 });
  if (!template) {
    return NextResponse.json(
      { error: "This website's template is not available in this deployment." },
      { status: 500 },
    );
  }

  const validated = validateContentSubmission(body, template);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.errors.join("; ") }, { status: 400 });
  }

  // One function, one transaction: claim the version, replace the sections, bump
  // the version. This route has already enforced the flag and the contracts; the
  // function enforces that every id belongs to this school.
  const { data, error } = await supabase.rpc("replace_website_page_sections", {
    p_school_id: school_id,
    p_page_id: pageId,
    p_expected_version: expectedVersion,
    p_sections: validated.sections,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const result = (data ?? {}) as {
    ok?: boolean;
    reason?: string;
    page_id?: string;
    draft_version?: number;
  };
  if (result.ok !== true) {
    if (result.reason === "version_conflict") {
      return NextResponse.json(
        { error: "Someone else changed this page since you loaded it. Reload and try again." },
        { status: 409 },
      );
    }
    if (result.reason === "page_not_found") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "The page could not be saved." }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    page_id: result.page_id ?? null,
    draft_version: result.draft_version ?? null,
  });
}
