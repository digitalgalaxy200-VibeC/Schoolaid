import { ValidationErrors, bool, objectList, oneOf } from "@/lib/validate";
import { LIMITS, normaliseSectionFields, type SectionKind } from "./templates/contracts";
import type { SiteTemplate } from "./templates/registry";

/**
 * Website content — the vocabulary of a page, shared by the CMS and the resolver.
 *
 * WHAT LIVES WHERE
 * ----------------
 *   `templates/contracts.ts`  validates a section's fields (the platform vocabulary).
 *   this module               validates a SUBMISSION (an ordered list of sections)
 *                             and maps between the wire shape, the storage shape
 *                             and the renderer's shape.
 *
 * THE THREE SHAPES, AND WHY THEY DIFFER
 * -------------------------------------
 *   wire    { kind, is_visible, ...fields }   what the editor sends and receives —
 *                                             flat, because that is what a form holds
 *   stored  { kind, is_visible, content }     what the database holds — `kind` is a
 *                                             column, so it may not also live inside
 *                                             the JSON where it could shadow itself
 *   render  { kind, ...fields }               what the resolver hands the contracts
 *
 * DRAFTS AND PUBLISHING
 * ---------------------
 * There is no draft/publish split yet (that slice arrives later): a save is live.
 * What "draft" means here is only that a HIDDEN section may be unfinished — a
 * school hides a block until it has written it. Visible sections are held to the
 * full published contract on every save, and the resolver holds the rendered
 * document to it again on every read.
 */

/** The public address of the site's first page. V1 serves exactly this one. */
export const HOME_PAGE_PATH = "/";

/** A section as the database stores it: content fields separate from `kind`. */
export type StoredSection = {
  kind: SectionKind;
  is_visible: boolean;
  content: Record<string, unknown>;
};

/** A section as the editor exchanges it: flat, kind and visibility among fields. */
export type PageSection = { kind: SectionKind; is_visible: boolean } & Record<string, unknown>;

export type ContentValidation =
  | { ok: true; sections: StoredSection[] }
  | { ok: false; errors: string[] };

/**
 * Validates a whole content submission (the PUT body's `sections`).
 *
 * Rules, and where they come from:
 *   - every section validates against its kind's contract (strictly when
 *     visible, leniently when hidden — see `normaliseSectionFields`);
 *   - `kind` must be one the school's TEMPLATE declares it can render;
 *   - at most one section per kind on a page (a V1 rule of the editor, which
 *     presents one block per kind — the schema does not forbid more);
 *   - at least one section must be visible. A save that would leave the page
 *     with nothing to render is refused here rather than publishing a page the
 *     resolver would rightly refuse to serve.
 */
export function validateContentSubmission(
  input: unknown,
  template: SiteTemplate,
): ContentValidation {
  const errors = new ValidationErrors();

  const rawSections = objectList(input, "sections", errors, {
    required: true,
    min: 1,
    max: LIMITS.sectionsMax,
  });

  const sections: StoredSection[] = [];
  const seen = new Set<string>();

  if (rawSections) {
    rawSections.forEach((raw, index) => {
      const sectionErrors = errors.child(`sections[${index}]`);
      const kind = oneOf(raw, "kind", template.sectionKinds, sectionErrors, { required: true });
      const isVisible = bool(raw, "is_visible", sectionErrors, { required: true });
      if (!kind) return;

      if (seen.has(kind)) {
        sectionErrors.add("kind", "appears more than once on this page");
        return;
      }
      seen.add(kind);

      const fields = normaliseSectionFields(raw, kind, sectionErrors, {
        allowEmpty: isVisible !== true,
      });
      if (!fields) return;

      sections.push({ kind, is_visible: isVisible === true, content: fields });
    });
  }

  if (!errors.ok) {
    return { ok: false, errors: errors.list.map((error) => `${error.field}: ${error.message}`) };
  }
  if (!sections.some((section) => section.is_visible)) {
    return { ok: false, errors: ["sections: at least one section must be visible"] };
  }

  return { ok: true, sections };
}

/**
 * The canonical mapping from a stored row to the editor/renderer shape.
 *
 * `kind` and `is_visible` are spread LAST so a key inside `content` can never
 * shadow either — a content payload with its own `kind` loses to the column.
 */
export function sectionFromStored(row: {
  kind: string;
  is_visible: boolean;
  content: unknown;
}): PageSection {
  const content =
    row.content && typeof row.content === "object" && !Array.isArray(row.content)
      ? (row.content as Record<string, unknown>)
      : {};

  return { ...content, kind: row.kind as SectionKind, is_visible: row.is_visible };
}

/**
 * Ensures the editor shows every kind the template can render.
 *
 * A page saved before a template gained a kind has no row for it; rather than
 * hiding the new block from whoever could switch it on, it is offered — hidden
 * and empty — after the sections that were stored. Stored order is preserved;
 * new kinds take their place at the end.
 */
export function withTemplateKinds(stored: PageSection[], template: SiteTemplate): PageSection[] {
  const present = new Set(stored.map((section) => section.kind));
  const missing = template.sectionKinds.filter((kind) => !present.has(kind));

  return [...stored, ...missing.map((kind) => ({ kind, is_visible: false }))];
}
