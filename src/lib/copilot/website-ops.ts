/**
 * Pure merge helpers shared by the Copilot's website capabilities.
 *
 * The website engine has two deliberate write rules the Copilot must not
 * bypass: a configuration save REPLACES the whole configuration, and a content
 * save REPLACES the whole page. Turning either into a "change this one field"
 * tool therefore means merging the patch over what is stored BEFORE the very
 * same validators the school-admin screens use see it — which is what these
 * functions do. They are pure so the merge is testable without a database.
 */
import { CONTACT_KEYS, validateSiteConfig, type ContactKey, type SiteConfig } from "@/lib/site/config";
import type { PageSection } from "@/lib/site/content";

export type WebsiteConfigPatch = {
  palette?: string;
  whatsapp?: string;
  facebook?: string;
  instagram?: string;
  x?: string;
  youtube?: string;
  seo_title?: string;
  seo_description?: string;
};

/**
 * Applies a partial patch over the current configuration and validates the
 * result with the platform validator. An empty string clears a contact link or
 * an SEO field; a field absent from the patch is left exactly as it was.
 */
export function applyWebsiteConfigPatch(
  current: SiteConfig,
  patch: WebsiteConfigPatch,
): { ok: true; config: SiteConfig } | { ok: false; errors: string[] } {
  const contact: Record<string, unknown> = { ...current.contact };
  for (const key of CONTACT_KEYS) {
    const value = patch[key as ContactKey];
    if (value === undefined) continue;
    contact[key] = value === "" ? null : value;
  }

  const seo = {
    title:
      patch.seo_title !== undefined ? (patch.seo_title === "" ? null : patch.seo_title) : current.seo.title,
    description:
      patch.seo_description !== undefined
        ? (patch.seo_description === "" ? null : patch.seo_description)
        : current.seo.description,
  };

  return validateSiteConfig({
    theme: { palette: patch.palette ?? current.theme.palette, logo_path: current.theme.logoPath },
    contact,
    seo,
  });
}

export type SectionPatch = {
  is_visible?: boolean;
  fields?: Record<string, unknown>;
};

/**
 * Merges a patch into the page's sections (the editor's flat shape).
 *
 * A kind that is not on the page yet is APPENDED: the schema allows a section
 * to exist before it has been written, and a hidden one is explicitly allowed
 * to be empty. `kind` and `is_visible` cannot be smuggled in through `fields` —
 * they are columns, and the section spread must never let content shadow them.
 *
 * Validity is not judged here: the caller runs the merged result through
 * `validateContentSubmission`, exactly as a save from the website editor does.
 */
export function applySectionPatch(
  sections: PageSection[],
  kind: string,
  patch: SectionPatch,
): PageSection[] {
  const fields: Record<string, unknown> = { ...(patch.fields ?? {}) };
  delete fields.kind;
  delete fields.is_visible;

  const index = sections.findIndex((section) => section.kind === kind);
  if (index === -1) {
    return [...sections, { kind, is_visible: patch.is_visible ?? true, ...fields } as PageSection];
  }

  const merged = {
    ...sections[index],
    ...fields,
    ...(patch.is_visible !== undefined ? { is_visible: patch.is_visible } : {}),
  } as PageSection;

  const next = [...sections];
  next[index] = merged;
  return next;
}

/**
 * Turns the validator's positional errors into names a person recognises.
 *
 * `sections[6].items[0].authorName: is required` is a puzzle: which block is
 * six? Which page? The caller merges ONE page in order, so the index identifies
 * the block, and `block "testimonials" → items[0].authorName: is required`
 * says where to look and what to fill in.
 */
export function nameFailedBlocks(errors: string[], sections: PageSection[]): string[] {
  return errors.map((error) => {
    const match = /^sections\[(\d+)\]\.?(.*)$/.exec(error);
    if (!match) return error;
    const kind = sections[Number(match[1])]?.kind;
    return kind ? `block "${kind}" → ${match[2]}` : error;
  });
}
