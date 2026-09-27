import { ValidationErrors, objectList, oneOf, text } from "@/lib/validate";
import type { ProgramItem, PublishedSiteDocument, SiteSection } from "../types";

/**
 * Section contracts — what a section of a school website is allowed to contain.
 *
 * WHY THIS IS THE ENFORCEMENT POINT
 * ---------------------------------
 * Everything a school puts on a public page passes through here. The CMS (a
 * later slice) will write whatever a browser sends; this module is what decides
 * whether it is a section at all, and it returns a NORMALISED section — a new
 * object containing only declared fields. An undeclared field is not rejected
 * with an error; it simply cannot survive the round trip, so a future editor
 * cannot smuggle arbitrary data onto a page by adding a key to a payload.
 *
 * Limits are declared once, in `LIMITS`, and enforced on the way in. Type and
 * length checks are the platform's, not the template's: a template may trust
 * every field it receives.
 *
 * Validation accumulates errors (the platform's `ValidationErrors` collector)
 * rather than throwing on the first problem, so a caller learns every bad field
 * in one pass — the same behaviour as every other validated input in SchoolAid.
 */

export type SectionKind = SiteSection["kind"];

/** The kinds this platform can render. Adding one is a code change with review. */
export const SECTION_KINDS = [
  "hero",
  "about",
  "programs",
  "principal_message",
  "contact",
] as const satisfies readonly SectionKind[];

export const LIMITS = {
  key: 40,
  heading: 80,
  headline: 120,
  subheadline: 200,
  body: 1200,
  itemName: 60,
  itemDescription: 200,
  listMin: 1,
  listMax: 12,
  sectionsMin: 1,
  sectionsMax: 20,
} as const;

export type DocumentValidation =
  | { ok: true; document: PublishedSiteDocument }
  | { ok: false; errors: string[] };

/**
 * Validates and normalises a published document.
 *
 * Returns the document rebuilt from validated fields only — never the input.
 * On failure it reports every problem at once, in `field: message` form.
 */
export function validateDocument(input: unknown): DocumentValidation {
  const errors = new ValidationErrors();

  const templateKey = text(input, "templateKey", errors, { required: true, max: LIMITS.key });
  const templateVersion = text(input, "templateVersion", errors, { required: true, max: LIMITS.key });
  const rawSections = objectList(input, "sections", errors, {
    required: true,
    min: LIMITS.sectionsMin,
    max: LIMITS.sectionsMax,
  });

  const sections: SiteSection[] = [];
  if (rawSections) {
    rawSections.forEach((raw, index) => {
      const section = validateSection(raw, index, errors);
      if (section) sections.push(section);
    });
  }

  if (!errors.ok || !templateKey || !templateVersion) {
    return { ok: false, errors: errors.list.map((e) => `${e.field}: ${e.message}`) };
  }

  return { ok: true, document: { templateKey, templateVersion, sections } };
}

/** Validates one section and returns its normalised form, or null. */
function validateSection(
  raw: Record<string, unknown>,
  index: number,
  shared: ValidationErrors,
): SiteSection | null {
  const errors = shared.child(`sections[${index}]`);
  const kind = oneOf(raw, "kind", SECTION_KINDS, errors, { required: true });
  if (!kind) return null;

  switch (kind) {
    case "hero": {
      const headline = text(raw, "headline", errors, { required: true, max: LIMITS.headline });
      const subheadline = text(raw, "subheadline", errors, { required: true, max: LIMITS.subheadline });
      if (!headline || !subheadline) return null;
      return { kind: "hero", headline, subheadline };
    }

    case "about": {
      const heading = text(raw, "heading", errors, { required: true, max: LIMITS.heading });
      const body = text(raw, "body", errors, { required: true, max: LIMITS.body });
      if (!heading || !body) return null;
      return { kind: "about", heading, body };
    }

    case "programs": {
      const heading = text(raw, "heading", errors, { required: true, max: LIMITS.heading });
      const rawItems = objectList(raw, "items", errors, {
        required: true,
        min: LIMITS.listMin,
        max: LIMITS.listMax,
      });

      const items: ProgramItem[] = [];
      if (rawItems) {
        rawItems.forEach((item, itemIndex) => {
          const itemErrors = errors.child(`items[${itemIndex}]`);
          const name = text(item, "name", itemErrors, { required: true, max: LIMITS.itemName });
          const description = text(item, "description", itemErrors, {
            required: true,
            max: LIMITS.itemDescription,
          });
          if (name && description) items.push({ name, description });
        });
      }

      // Any skipped item means the list is incomplete, and a half-rendered list
      // is worse than a refused one.
      if (!heading || !rawItems || items.length !== rawItems.length) return null;
      return { kind: "programs", heading, items };
    }

    case "principal_message": {
      const heading = text(raw, "heading", errors, { required: true, max: LIMITS.heading });
      const message = text(raw, "message", errors, { required: true, max: LIMITS.body });
      if (!heading || !message) return null;
      return { kind: "principal_message", heading, message };
    }

    case "contact": {
      const heading = text(raw, "heading", errors, { required: true, max: LIMITS.heading });
      const intro = text(raw, "intro", errors, { required: true, max: LIMITS.body });
      if (!heading || !intro) return null;
      return { kind: "contact", heading, intro };
    }
  }
}
