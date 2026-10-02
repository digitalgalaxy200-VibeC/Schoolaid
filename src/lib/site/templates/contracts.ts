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
  badge: 40,
  author: 80,
  url: 300,
  statValue: 30,
  statLabel: 60,
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
      const ctaText = text(raw, "ctaText", errors, { required: false, max: LIMITS.badge });
      const ctaLink = text(raw, "ctaLink", errors, { required: false, max: LIMITS.url });
      const secondaryCtaText = text(raw, "secondaryCtaText", errors, { required: false, max: LIMITS.badge });
      const secondaryCtaLink = text(raw, "secondaryCtaLink", errors, { required: false, max: LIMITS.url });
      const imageUrl = text(raw, "imageUrl", errors, { required: false, max: LIMITS.url });
      const badgeText = text(raw, "badgeText", errors, { required: false, max: LIMITS.badge });

      const rawStats = objectList(raw, "stats", errors, { required: false, max: 4 });
      const stats: { label: string; value: string }[] = [];
      if (rawStats) {
        rawStats.forEach((st, i) => {
          const sErr = errors.child(`stats[${i}]`);
          const value = text(st, "value", sErr, { required, max: LIMITS.statValue });
          const label = text(st, "label", sErr, { required, max: LIMITS.statLabel });
          if (value && label) stats.push({ value, label });
        });
      }

      if (required && (!headline || !subheadline)) return null;
      return compact({
        headline,
        subheadline,
        ctaText,
        ctaLink,
        secondaryCtaText,
        secondaryCtaLink,
        imageUrl,
        badgeText,
        stats: stats.length > 0 ? stats : undefined,
      });
    }

    case "about": {
      const heading = text(raw, "heading", errors, { required, max: LIMITS.heading });
      const body = text(raw, "body", errors, { required, max: LIMITS.body });
      const imageUrl = text(raw, "imageUrl", errors, { required: false, max: LIMITS.url });

      if (required && (!heading || !body)) return null;
      return compact({ heading, body, imageUrl });
    }

    case "programs": {
      const heading = text(raw, "heading", errors, { required, max: LIMITS.heading });
      const intro = text(raw, "intro", errors, { required: false, max: LIMITS.body });
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
          const badge = text(item, "badge", itemErrors, { required: false, max: LIMITS.badge });
          const imageUrl = text(item, "imageUrl", itemErrors, { required: false, max: LIMITS.url });

          if (name && description) {
            items.push(compact({ name, description, badge, imageUrl }) as unknown as ProgramItem);
          } else if (!required && (name || description)) {
            items.push(compact({ name, description, badge, imageUrl }) as unknown as ProgramItem);
          } else {
            skipped += 1;
          }
        });
      }

      if (required && (!heading || !rawItems || skipped > 0)) return null;
      return compact({ heading, intro, items: items.length > 0 ? items : undefined });
    }

    case "principal_message": {
      const heading = text(raw, "heading", errors, { required, max: LIMITS.heading });
      const message = text(raw, "message", errors, { required, max: LIMITS.body });
      const authorName = text(raw, "authorName", errors, { required: false, max: LIMITS.author });
      const authorTitle = text(raw, "authorTitle", errors, { required: false, max: LIMITS.author });
      const imageUrl = text(raw, "imageUrl", errors, { required: false, max: LIMITS.url });

      if (required && (!heading || !message)) return null;
      return compact({ heading, message, authorName, authorTitle, imageUrl });
    }

    case "highlights": {
      const heading = text(raw, "heading", errors, { required, max: LIMITS.heading });
      const subheading = text(raw, "subheading", errors, { required: false, max: LIMITS.subheadline });
      const rawItems = objectList(raw, "items", errors, {
        required,
        min: required ? LIMITS.listMin : undefined,
        max: LIMITS.listMax,
      });

      const items: { title: string; description: string; icon?: string | null }[] = [];
      let skipped = 0;
      if (rawItems) {
        rawItems.forEach((item, itemIndex) => {
          const itemErrors = errors.child(`items[${itemIndex}]`);
          const title = text(item, "title", itemErrors, { required, max: LIMITS.itemName });
          const description = text(item, "description", itemErrors, {
            required,
            max: LIMITS.itemDescription,
          });
          const icon = text(item, "icon", itemErrors, { required: false, max: 40 });
          if (title && description) {
            items.push({ title, description, icon: icon || undefined });
          } else if (!required && (title || description)) {
            items.push(compact({ title, description, icon }) as unknown as { title: string; description: string });
          } else {
            skipped += 1;
          }
        });
      }

      if (required && (!heading || !rawItems || skipped > 0)) return null;
      return compact({ heading, subheading, items: items.length > 0 ? items : undefined });
    }

    case "gallery": {
      const heading = text(raw, "heading", errors, { required, max: LIMITS.heading });
      const subheading = text(raw, "subheading", errors, { required: false, max: LIMITS.subheadline });
      const rawItems = objectList(raw, "items", errors, {
        required,
        min: required ? LIMITS.listMin : undefined,
        max: 12,
      });

      const items: { imageUrl: string; caption?: string | null }[] = [];
      let skipped = 0;
      if (rawItems) {
        rawItems.forEach((item, itemIndex) => {
          const itemErrors = errors.child(`items[${itemIndex}]`);
          const imageUrl = text(item, "imageUrl", itemErrors, { required, max: LIMITS.url });
          const caption = text(item, "caption", itemErrors, { required: false, max: LIMITS.itemName });
          if (imageUrl) {
            items.push({ imageUrl, caption: caption || undefined });
          } else {
            skipped += 1;
          }
        });
      }

      if (required && (!heading || !rawItems || skipped > 0)) return null;
      return compact({ heading, subheading, items: items.length > 0 ? items : undefined });
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
