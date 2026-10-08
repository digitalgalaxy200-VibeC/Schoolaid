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
  "notice",
  "hero",
  "values",
  "about",
  "programs",
  "facilities",
  "principal_message",
  "highlights",
  "testimonials",
  "admissions_steps",
  "events",
  "faq",
  "gallery",
  "blog",
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
  sectionsMax: 25,
} as const;

/**
 * URL-shaped fields — where a school points a page.
 *
 * React blocks `javascript:` hrefs at render today, but a contract the platform
 * enforces must not depend on the renderer's good behaviour: the schemes that
 * execute or leave the web (javascript:, data:, vbscript:, file:) are refused
 * here, so they are never stored and never reach a page. Everything a school
 * legitimately types — https://, http://, #anchors, paths, mailto:, tel: — is
 * accepted unchanged, and a value with no scheme is left alone: the rule
 * blocks what executes, not what looks untidy.
 */
const DANGEROUS_URL_SCHEME = /^(?:javascript|data|vbscript|file):/;

function isDangerousUrl(value: string): boolean {
  // Browsers strip ASCII controls and whitespace from a URL before parsing a
  // scheme, so `java\nscript:` navigates exactly like `javascript:`.
  return DANGEROUS_URL_SCHEME.test(value.replace(/[\u0000-\u0020\u007f]/g, "").toLowerCase());
}

/** `text` plus the scheme rule above. On violation the field is refused. */
function url(
  body: unknown,
  field: string,
  errors: ValidationErrors,
  opts: { required?: boolean } = {},
): string | null {
  const value = text(body, field, errors, { required: opts.required, max: LIMITS.url });
  if (value && isDangerousUrl(value)) {
    errors.add(field, "must not be a javascript:, data:, vbscript: or file: link");
    return null;
  }
  return value;
}

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

  return { kind, ...fields } as unknown as SiteSection;
}

/**
 * Extracts one section's fields — everything except `kind` — and returns them
 * as a compact object: declared, trimmed and non-empty only.
 */
export function normaliseSectionFields(
  raw: Record<string, unknown>,
  kind: SectionKind,
  errors: ValidationErrors,
  opts: { allowEmpty?: boolean } = {},
): Record<string, unknown> | null {
  const required = opts.allowEmpty !== true;

  switch (kind) {
    case "notice": {
      const message = text(raw, "message", errors, { required, max: LIMITS.subheadline });
      const linkText = text(raw, "linkText", errors, { required: false, max: LIMITS.badge });
      const linkUrl = url(raw, "linkUrl", errors);
      if (required && !message) return null;
      return compact({ message, linkText, linkUrl });
    }

    case "hero": {
      const headline = text(raw, "headline", errors, { required, max: LIMITS.headline });
      const subheadline = text(raw, "subheadline", errors, { required, max: LIMITS.subheadline });
      const ctaText = text(raw, "ctaText", errors, { required: false, max: LIMITS.badge });
      const ctaLink = url(raw, "ctaLink", errors);
      const secondaryCtaText = text(raw, "secondaryCtaText", errors, { required: false, max: LIMITS.badge });
      const secondaryCtaLink = url(raw, "secondaryCtaLink", errors);
      const imageUrl = url(raw, "imageUrl", errors);
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

    case "values": {
      const heading = text(raw, "heading", errors, { required, max: LIMITS.heading });
      const mission = text(raw, "mission", errors, { required: false, max: LIMITS.body });
      const vision = text(raw, "vision", errors, { required: false, max: LIMITS.body });
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
            items.push(compact({ title, description, icon }) as unknown as { title: string; description: string });
          } else {
            skipped += 1;
          }
        });
      }

      if (required && (!heading || !rawItems || skipped > 0)) return null;
      return compact({ heading, mission, vision, items: items.length > 0 ? items : undefined });
    }

    case "about": {
      const heading = text(raw, "heading", errors, { required, max: LIMITS.heading });
      const body = text(raw, "body", errors, { required, max: LIMITS.body });
      const imageUrl = url(raw, "imageUrl", errors);

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
          const imageUrl = url(item, "imageUrl", itemErrors);

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

    case "facilities": {
      const heading = text(raw, "heading", errors, { required, max: LIMITS.heading });
      const subheading = text(raw, "subheading", errors, { required: false, max: LIMITS.subheadline });
      const rawItems = objectList(raw, "items", errors, {
        required,
        min: required ? LIMITS.listMin : undefined,
        max: LIMITS.listMax,
      });

      const items: { title: string; description: string; imageUrl?: string | null }[] = [];
      let skipped = 0;
      if (rawItems) {
        rawItems.forEach((item, itemIndex) => {
          const itemErrors = errors.child(`items[${itemIndex}]`);
          const title = text(item, "title", itemErrors, { required, max: LIMITS.itemName });
          const description = text(item, "description", itemErrors, {
            required,
            max: LIMITS.itemDescription,
          });
          const imageUrl = url(item, "imageUrl", itemErrors);
          if (title && description) {
            items.push(compact({ title, description, imageUrl }) as unknown as { title: string; description: string });
          } else {
            skipped += 1;
          }
        });
      }

      if (required && (!heading || !rawItems || skipped > 0)) return null;
      return compact({ heading, subheading, items: items.length > 0 ? items : undefined });
    }

    case "principal_message": {
      const heading = text(raw, "heading", errors, { required, max: LIMITS.heading });
      const message = text(raw, "message", errors, { required, max: LIMITS.body });
      const authorName = text(raw, "authorName", errors, { required: false, max: LIMITS.author });
      const authorTitle = text(raw, "authorTitle", errors, { required: false, max: LIMITS.author });
      const imageUrl = url(raw, "imageUrl", errors);

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

    case "testimonials": {
      const heading = text(raw, "heading", errors, { required, max: LIMITS.heading });
      const subheading = text(raw, "subheading", errors, { required: false, max: LIMITS.subheadline });
      const rawItems = objectList(raw, "items", errors, {
        required,
        min: required ? LIMITS.listMin : undefined,
        max: LIMITS.listMax,
      });

      const items: { quote: string; authorName: string; role: string; avatarUrl?: string | null }[] = [];
      let skipped = 0;
      if (rawItems) {
        rawItems.forEach((item, itemIndex) => {
          const itemErrors = errors.child(`items[${itemIndex}]`);
          const quote = text(item, "quote", itemErrors, { required, max: LIMITS.body });
          const authorName = text(item, "authorName", itemErrors, { required, max: LIMITS.author });
          const role = text(item, "role", itemErrors, { required, max: LIMITS.itemName });
          const avatarUrl = url(item, "avatarUrl", itemErrors);
          if (quote && authorName && role) {
            items.push(compact({ quote, authorName, role, avatarUrl }) as unknown as { quote: string; authorName: string; role: string });
          } else {
            skipped += 1;
          }
        });
      }

      if (required && (!heading || !rawItems || skipped > 0)) return null;
      return compact({ heading, subheading, items: items.length > 0 ? items : undefined });
    }

    case "admissions_steps": {
      const heading = text(raw, "heading", errors, { required, max: LIMITS.heading });
      const subheading = text(raw, "subheading", errors, { required: false, max: LIMITS.subheadline });
      const prospectusUrl = url(raw, "prospectusUrl", errors);
      const rawItems = objectList(raw, "items", errors, {
        required,
        min: required ? LIMITS.listMin : undefined,
        max: 6,
      });

      const items: { stepNumber: string; title: string; description: string }[] = [];
      let skipped = 0;
      if (rawItems) {
        rawItems.forEach((item, itemIndex) => {
          const itemErrors = errors.child(`items[${itemIndex}]`);
          const stepNumber = text(item, "stepNumber", itemErrors, { required, max: 10 });
          const title = text(item, "title", itemErrors, { required, max: LIMITS.itemName });
          const description = text(item, "description", itemErrors, {
            required,
            max: LIMITS.itemDescription,
          });
          if (stepNumber && title && description) {
            items.push(compact({ stepNumber, title, description }) as unknown as { stepNumber: string; title: string; description: string });
          } else {
            skipped += 1;
          }
        });
      }

      if (required && (!heading || !rawItems || skipped > 0)) return null;
      return compact({ heading, subheading, prospectusUrl, items: items.length > 0 ? items : undefined });
    }

    case "events": {
      const heading = text(raw, "heading", errors, { required, max: LIMITS.heading });
      const subheading = text(raw, "subheading", errors, { required: false, max: LIMITS.subheadline });
      const rawItems = objectList(raw, "items", errors, {
        required,
        min: required ? LIMITS.listMin : undefined,
        max: 8,
      });

      const items: { title: string; date: string; time?: string | null; location?: string | null; category?: string | null }[] = [];
      let skipped = 0;
      if (rawItems) {
        rawItems.forEach((item, itemIndex) => {
          const itemErrors = errors.child(`items[${itemIndex}]`);
          const title = text(item, "title", itemErrors, { required, max: LIMITS.itemName });
          const date = text(item, "date", itemErrors, { required, max: 40 });
          const time = text(item, "time", itemErrors, { required: false, max: 40 });
          const location = text(item, "location", itemErrors, { required: false, max: LIMITS.itemName });
          const category = text(item, "category", itemErrors, { required: false, max: LIMITS.badge });
          if (title && date) {
            items.push(compact({ title, date, time, location, category }) as unknown as { title: string; date: string });
          } else {
            skipped += 1;
          }
        });
      }

      if (required && (!heading || !rawItems || skipped > 0)) return null;
      return compact({ heading, subheading, items: items.length > 0 ? items : undefined });
    }

    case "faq": {
      const heading = text(raw, "heading", errors, { required, max: LIMITS.heading });
      const subheading = text(raw, "subheading", errors, { required: false, max: LIMITS.subheadline });
      const rawItems = objectList(raw, "items", errors, {
        required,
        min: required ? LIMITS.listMin : undefined,
        max: 12,
      });

      const items: { question: string; answer: string }[] = [];
      let skipped = 0;
      if (rawItems) {
        rawItems.forEach((item, itemIndex) => {
          const itemErrors = errors.child(`items[${itemIndex}]`);
          const question = text(item, "question", itemErrors, { required, max: LIMITS.headline });
          const answer = text(item, "answer", itemErrors, { required, max: LIMITS.body });
          if (question && answer) {
            items.push(compact({ question, answer }) as unknown as { question: string; answer: string });
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

      const items: { imageUrl: string; caption?: string | null; category?: string | null }[] = [];
      let skipped = 0;
      if (rawItems) {
        rawItems.forEach((item, itemIndex) => {
          const itemErrors = errors.child(`items[${itemIndex}]`);
          const imageUrl = url(item, "imageUrl", itemErrors, { required });
          const caption = text(item, "caption", itemErrors, { required: false, max: LIMITS.itemName });
          const category = text(item, "category", itemErrors, { required: false, max: LIMITS.badge });
          if (imageUrl) {
            items.push(compact({ imageUrl, caption, category }) as unknown as { imageUrl: string });
          } else {
            skipped += 1;
          }
        });
      }

      if (required && (!heading || !rawItems || skipped > 0)) return null;
      return compact({ heading, subheading, items: items.length > 0 ? items : undefined });
    }

    case "blog": {
      const heading = text(raw, "heading", errors, { required, max: LIMITS.heading });
      const subheading = text(raw, "subheading", errors, { required: false, max: LIMITS.subheadline });
      const rawItems = objectList(raw, "posts", errors, {
        required,
        min: required ? LIMITS.listMin : undefined,
        max: 12,
      });

      const posts: { title: string; excerpt?: string | null; date?: string | null; author?: string | null; category?: string | null; imageUrl?: string | null }[] = [];
      let skipped = 0;
      if (rawItems) {
        rawItems.forEach((item, itemIndex) => {
          const itemErrors = errors.child(`posts[${itemIndex}]`);
          const title = text(item, "title", itemErrors, { required, max: LIMITS.headline });
          const excerpt = text(item, "excerpt", itemErrors, { required: false, max: LIMITS.body });
          const date = text(item, "date", itemErrors, { required: false, max: 40 });
          const author = text(item, "author", itemErrors, { required: false, max: LIMITS.author });
          const category = text(item, "category", itemErrors, { required: false, max: LIMITS.badge });
          const imageUrl = url(item, "imageUrl", itemErrors);
          if (title) {
            posts.push(compact({ title, excerpt, date, author, category, imageUrl }) as unknown as { title: string });
          } else {
            skipped += 1;
          }
        });
      }

      if (required && (!heading || !rawItems || skipped > 0)) return null;
      return compact({ heading, subheading, posts: posts.length > 0 ? posts : undefined });
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
