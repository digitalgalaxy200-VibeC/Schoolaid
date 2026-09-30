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

  const fields = normaliseSectionFields(raw, kind, errors, { allowEmpty: false });
  if (!fields) return null;

  // `normaliseSectionFields` builds exactly the fields its case declares — the
  // cast records a guarantee the switch already makes, and every path into a
  // public page calls it with `allowEmpty: false`.
  return { kind, ...fields } as unknown as SiteSection;
}

/**
 * Extracts one section's fields — everything except `kind` — and returns them
 * as a compact object: declared, trimmed and non-empty only. Undeclared fields
 * cannot survive, exactly as in `validateDocument`.
 *
 * TWO MODES, ONE FIELD LIST
 * -------------------------
 * `allowEmpty: false` (the default) is the PUBLISHED contract: every field a
 * kind declares is required, and a section that fails is refused. This is what
 * the public resolver uses, so what a visitor sees is always complete.
 *
 * `allowEmpty: true` is for STORED DRAFTS: a school hides a block until it has
 * written it, so a hidden section may be unfinished. Missing and empty values
 * are dropped rather than refused — but types and length limits are enforced in
 * both modes, and unknown fields are dropped in both. There is one field list
 * and one validator; the modes differ only in whether emptiness is an error.
 */
export function normaliseSectionFields(
  raw: Record<string, unknown>,
  kind: SectionKind,
  errors: ValidationErrors,
  opts: { allowEmpty?: boolean } = {},
): Record<string, unknown> | null {
  const required = opts.allowEmpty !== true;

  switch (kind) {
    case "hero": {
      const headline = text(raw, "headline", errors, { required, max: LIMITS.headline });
      const subheadline = text(raw, "subheadline", errors, { required, max: LIMITS.subheadline });
      if (required && (!headline || !subheadline)) return null;
      return compact({ headline, subheadline });
    }

    case "about": {
      const heading = text(raw, "heading", errors, { required, max: LIMITS.heading });
      const body = text(raw, "body", errors, { required, max: LIMITS.body });
      if (required && (!heading || !body)) return null;
      return compact({ heading, body });
    }

    case "programs": {
      const heading = text(raw, "heading", errors, { required, max: LIMITS.heading });
      const rawItems = objectList(raw, "items", errors, {
        required,
        min: required ? LIMITS.listMin : undefined,
        max: LIMITS.listMax,
      });

      const items: ProgramItem[] = [];
      let skipped = 0;
      if (rawItems) {
        rawItems.forEach((item, itemIndex) => {
          const itemErrors = errors.child(`items[${itemIndex}]`);
          const name = text(item, "name", itemErrors, { required, max: LIMITS.itemName });
          const description = text(item, "description", itemErrors, {
            required,
            max: LIMITS.itemDescription,
          });
          if (name && description) {
            items.push({ name, description });
          } else if (!required && (name || description)) {
            // A draft row being written — keep what it has.
            items.push(compact({ name, description }) as unknown as ProgramItem);
          } else {
            // In published mode a partial item lands here too, and is counted
            // as skipped below: the list is refused rather than half-rendered.
            skipped += 1;
          }
        });
      }

      // Any skipped item means the list is incomplete, and a half-rendered list
      // is worse than a refused one. (In draft mode a blank editor row is not an
      // error — it is simply not content, and is dropped.)
      if (required && (!heading || !rawItems || skipped > 0)) return null;
      return compact({ heading, items: items.length > 0 ? items : undefined });
    }

    case "principal_message": {
      const heading = text(raw, "heading", errors, { required, max: LIMITS.heading });
      const message = text(raw, "message", errors, { required, max: LIMITS.body });
      if (required && (!heading || !message)) return null;
      return compact({ heading, message });
    }

    case "contact": {
      const heading = text(raw, "heading", errors, { required, max: LIMITS.heading });
      const intro = text(raw, "intro", errors, { required, max: LIMITS.body });
      if (required && (!heading || !intro)) return null;
      return compact({ heading, intro });
    }
  }
}

/** Drops null/undefined keys, so a draft stores only what has been written. */
function compact(fields: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value === null || value === undefined) continue;
    out[key] = value;
  }
  return out;
}
