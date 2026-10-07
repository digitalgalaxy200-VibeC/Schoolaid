/**
 * The Copilot's website capabilities — the database side.
 *
 * Gwin edits a school's website through the SAME rules the school's own editor
 * obeys, never around them:
 *
 *   - the school must hold the `website` entitlement (default-deny, exactly like
 *     the school-admin routes — a capability must not be the way in that the
 *     screens close);
 *   - a configuration save replaces the whole configuration and a content save
 *     replaces the whole page, so a patch is MERGED over what is stored first
 *     (`website-ops.ts`) and then judged by the platform's own validators;
 *   - content goes through the same `replace_website_page_sections` function as
 *     the editor, so the optimistic version claim and the write stay atomic.
 *
 * Every failure is raised as a real error naming what was wrong. Nothing here
 * reports success it did not verify.
 */
import { readSiteConfig } from "@/lib/site/config";
import {
  HOME_PAGE_PATH,
  sectionFromStored,
  validateContentSubmission,
  type PageSection,
} from "@/lib/site/content";
import { readWebsiteEntitlement } from "@/lib/site/entitlement";
import { describeSectionKind } from "@/lib/site/templates/describe";
import { loadTemplate, type SiteTemplate } from "@/lib/site/templates/registry";
import { getServiceClient } from "@/lib/supabase/service";
import { applySectionPatch, applyWebsiteConfigPatch, nameFailedBlocks, type WebsiteConfigPatch } from "./website-ops";

const NOT_ENABLED =
  "The website is not enabled for this school. Turn the Website feature on for the school in " +
  "Super Admin → Schools, then ask me again.";

type ConfigRow = {
  theme?: unknown;
  contact?: unknown;
  seo?: unknown;
  status?: string | null;
  custom_domain?: string | null;
  domain_status?: string | null;
  draft_version?: number | null;
  template_key?: string | null;
};

type WebsiteContext = {
  supabase: ReturnType<typeof getServiceClient>;
  row: ConfigRow | null;
  template: SiteTemplate;
};

/**
 * The gate every website capability passes through: a school has been selected,
 * the entitlement is on, and the school's template exists in this deployment.
 */
async function requireWebsite(schoolId: string): Promise<WebsiteContext> {
  if (!schoolId) {
    throw new Error("Select a school first — a website belongs to one school.");
  }

  const supabase = getServiceClient();
  const entitlement = await readWebsiteEntitlement(supabase, schoolId);
  if (entitlement.error) throw new Error(entitlement.error);
  if (!entitlement.enabled) throw new Error(NOT_ENABLED);

  const { data, error } = await supabase
    .from("website_configs")
    .select("template_key, draft_version, status, theme, contact, seo, custom_domain, domain_status")
    .eq("school_id", schoolId)
    .maybeSingle();
  if (error) {
    throw new Error(`Could not read the school's website configuration: ${error.message}`);
  }

  const template = loadTemplate(String((data as ConfigRow | null)?.template_key ?? "classic"));
  if (!template) {
    throw new Error("This school's website template is not available in this deployment.");
  }

  return { supabase, row: (data ?? null) as ConfigRow | null, template };
}

/** The home page as the editor exchanges it: a page id (maybe none yet) and flat sections. */
async function readHomePage(
  supabase: WebsiteContext["supabase"],
  schoolId: string,
): Promise<{ pageId: string | null; title: string; sections: PageSection[] }> {
  const { data: page, error } = await supabase
    .from("website_pages")
    .select("id, title")
    .eq("school_id", schoolId)
    .eq("path", HOME_PAGE_PATH)
    .maybeSingle();
  if (error) throw new Error(`Could not read the website's home page: ${error.message}`);

  const pageRow = (page ?? null) as { id: string; title: string | null } | null;
  if (!pageRow) return { pageId: null, title: "Home", sections: [] };

  const { data: rows, error: sectionsError } = await supabase
    .from("website_sections")
    .select("kind, is_visible, content")
    .eq("school_id", schoolId)
    .eq("page_id", pageRow.id)
    .order("sort_order", { ascending: true });
  if (sectionsError) throw new Error(`Could not read the website sections: ${sectionsError.message}`);

  return {
    pageId: pageRow.id,
    title: pageRow.title ?? "Home",
    sections: (rows ?? []).map((row) =>
      sectionFromStored(row as { kind: string; is_visible: boolean; content: unknown }),
    ),
  };
}

// ── Reads ───────────────────────────────────────────────────

export async function readWebsiteConfig(schoolId: string) {
  const { row, template } = await requireWebsite(schoolId);
  const config = readSiteConfig(row ?? {});

  return {
    enabled: true,
    // `null` means the school has never saved its website settings; the site then
    // renders with platform defaults.
    status: row ? (row.status ?? "active") : null,
    template: { key: template.key, version: template.version, label: template.label },
    palette: config.theme.palette,
    contact: config.contact,
    seo: config.seo,
    custom_domain: row?.custom_domain ?? null,
    domain_status: row?.domain_status ?? null,
    logo_set: config.theme.logoPath !== null,
  };
}

/**
 * The home page's content.
 *
 * Called WITHOUT `kind` it answers an index: each stored block, whether it is
 * visible, the NAMES of the fields it holds, and what each kind of block
 * requires. Not the values — a full page is far larger than one read result may
 * carry, and a truncated read is a read the model would reason about wrongly.
 *
 * With `kind` it answers that one block in full, plus what the block requires.
 * When the block has never been saved there is nothing to copy from, so it also
 * returns a fill-in shape — the required fields, empty. That is the difference
 * between a model that guesses a testimonials item needs `quote` and one that
 * knows it needs `quote`, `authorName` and `role`.
 */
export async function readWebsiteContent(schoolId: string, kind?: unknown) {
  const { supabase, template } = await requireWebsite(schoolId);
  const page = await readHomePage(supabase, schoolId);

  const base = {
    enabled: true,
    template: { key: template.key, version: template.version, label: template.label },
    page_title: page.title,
    sections_available: [...template.sectionKinds],
  };

  if (typeof kind === "string" && kind.trim()) {
    const wanted = kind.trim();
    const renders = (template.sectionKinds as readonly string[]).includes(wanted);
    if (!renders) {
      throw new Error(
        `"${wanted}" is not a block this template can render. Available blocks: ${template.sectionKinds.join(", ")}.`,
      );
    }
    const described = describeSectionKind(wanted as (typeof template.sectionKinds)[number]);
    const stored = page.sections.find((section) => section.kind === wanted) ?? null;
    // A block the editor has offered but nobody has written holds only `kind`
    // and `is_visible`. Treating that as "saved" would send the model to copy
    // from an empty shell; there is nothing there to copy.
    const hasContent = stored !== null && Object.keys(stored).some((key) => key !== "kind" && key !== "is_visible");

    return {
      ...base,
      section: hasContent ? stored : null,
      stored: hasContent,
      required_fields: described.required,
      list_item_fields: Object.fromEntries(described.lists.map((list) => [list.field, list.item_fields])),
      fill_this_shape: hasContent ? undefined : described.shape,
      note:
        hasContent
          ? "Only the fields you send are changed; the rest of this block is kept as it is."
          : "This block has never been filled in for this school. Send every required field the first time, using fill_this_shape as the shape to fill in.",
    };
  }

  return {
    ...base,
    // What each kind of block requires, so a block with no saved copy can still
    // be written correctly the first time instead of by trial and error.
    required_fields_by_kind: Object.fromEntries(
      template.sectionKinds.map((sectionKind) => [sectionKind, describeSectionKind(sectionKind).required]),
    ),
    sections: page.sections.map((section) => {
      const { kind, is_visible, ...fields } = section;
      return { kind, is_visible, fields_present: Object.keys(fields) };
    }),
  };
}

// ── Writes ──────────────────────────────────────────────────

const PATCH_KEYS = [
  "palette",
  "whatsapp",
  "facebook",
  "instagram",
  "x",
  "youtube",
  "seo_title",
  "seo_description",
] as const;

export async function configureWebsite(params: Record<string, unknown>, schoolId: string) {
  const { supabase, row } = await requireWebsite(schoolId);

  const patch: WebsiteConfigPatch = {};
  for (const key of PATCH_KEYS) {
    const value = params[key];
    if (value === undefined || value === null) continue;
    if (typeof value !== "string") throw new Error(`${key} must be text.`);
    (patch as Record<string, unknown>)[key] = value;
  }
  if (Object.keys(patch).length === 0) {
    throw new Error(
      "Nothing to change — give me at least one of: palette, whatsapp, facebook, instagram, x, youtube, seo_title, seo_description.",
    );
  }

  const applied = applyWebsiteConfigPatch(readSiteConfig(row ?? {}), patch);
  if (!applied.ok) {
    throw new Error(`The website settings were not saved: ${applied.errors.join("; ")}`);
  }
  const { config } = applied;
  const logoPath = config.theme.logoPath;

  // Same write as the school's own config screen, including its two subtleties:
  // the custom domain is preserved (it is managed elsewhere), and unset contact
  // or SEO fields are stored as absent rather than as nulls.
  const { error } = await supabase.from("website_configs").upsert(
    {
      school_id: schoolId,
      custom_domain: row?.custom_domain ?? null,
      theme: { palette: config.theme.palette, ...(logoPath ? { logo_path: logoPath } : {}) },
      contact: Object.fromEntries(Object.entries(config.contact).filter(([, value]) => value !== null)),
      seo: Object.fromEntries(Object.entries(config.seo).filter(([, value]) => value !== null)),
    },
    { onConflict: "school_id" },
  );
  if (error) throw new Error(`The website settings were not saved: ${error.message}`);

  return {
    ok: true,
    changed: Object.keys(patch),
    palette: config.theme.palette,
    contact: config.contact,
    seo: config.seo,
    note: "This is live on the public website now — the website has no draft step.",
  };
}

export async function updateWebsiteSection(params: Record<string, unknown>, schoolId: string) {
  const { supabase, template } = await requireWebsite(schoolId);

  const kind = typeof params.kind === "string" ? params.kind.trim() : "";
  if (!kind) throw new Error("Which block should I change? Give me its kind.");
  if (!(template.sectionKinds as readonly string[]).includes(kind)) {
    throw new Error(
      `"${kind}" is not a block this template can render. Available blocks: ${template.sectionKinds.join(", ")}.`,
    );
  }

  let fields: Record<string, unknown> | undefined;
  if (params.fields !== undefined && params.fields !== null) {
    if (typeof params.fields === "string") {
      try {
        fields = JSON.parse(params.fields) as Record<string, unknown>;
      } catch {
        throw new Error("fields must be an object of content for the block.");
      }
    } else if (typeof params.fields === "object" && !Array.isArray(params.fields)) {
      fields = params.fields as Record<string, unknown>;
    } else {
      throw new Error("fields must be an object of content for the block.");
    }
  }

  const isVisible =
    typeof params.is_visible === "boolean"
      ? params.is_visible
      : params.is_visible === "true"
        ? true
        : params.is_visible === "false"
          ? false
          : undefined;

  if (fields === undefined && isVisible === undefined) {
    throw new Error("Tell me what to change: fields, is_visible, or both.");
  }

  // Two attempts at most: the only thing worth retrying is a lost race with
  // another editor, and then only after re-reading what they wrote.
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data: versionRow, error: versionError } = await supabase
      .from("website_configs")
      .select("draft_version")
      .eq("school_id", schoolId)
      .maybeSingle();
    if (versionError) throw new Error(`Could not read the page version: ${versionError.message}`);

    const page = await readHomePage(supabase, schoolId);
    const wasStored = page.sections.some((section) => section.kind === kind);
    const merged = applySectionPatch(page.sections, kind, { is_visible: isVisible, fields });

    const validated = validateContentSubmission({ sections: merged }, template);
    if (!validated.ok) {
      // The validator counts sections positionally; a person counts blocks by
      // name. "sections[6].items[0].authorName" is a puzzle; "block testimonials"
      // is a place to look.
      const named = nameFailedBlocks(validated.errors, merged);
      const hint = wasStored
        ? ""
        : ` Ask me to read the "${kind}" block first — I will return the shape it needs filled in.`;
      throw new Error(`The block was not saved — ${named.join("; ")}.${hint}`);
    }

    const { data, error } = await supabase.rpc("replace_website_page_sections", {
      p_school_id: schoolId,
      p_page_id: page.pageId,
      p_expected_version: versionRow?.draft_version ?? 0,
      p_sections: validated.sections,
    });
    if (error) throw new Error(`The block was not saved: ${error.message}`);

    const result = (data ?? {}) as { ok?: boolean; reason?: string; draft_version?: number };
    if (result.ok === true) {
      return {
        ok: true,
        kind,
        is_visible: merged.find((section) => section.kind === kind)?.is_visible ?? null,
        draft_version: result.draft_version ?? null,
        note: "This is live on the public website now — the website has no draft step.",
      };
    }
    if (result.reason !== "version_conflict") {
      throw new Error(`The block was not saved (${result.reason ?? "unknown reason"}).`);
    }
    // Someone else saved first — loop once, re-reading their version.
  }

  throw new Error("The page changed twice while I was saving. Ask me again and I will read the newest version.");
}
