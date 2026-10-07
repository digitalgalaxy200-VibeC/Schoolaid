import { ValidationErrors, oneOf, text } from "@/lib/validate";
import { whatsAppLink } from "@/lib/finance/phone";
import { DEFAULT_PALETTE, PALETTE_IDS, isKnownPalette } from "./theme";

/**
 * The school-facing website configuration: branding, contact links, SEO.
 *
 * TWO DIFFERENT ATTITUDES TO BAD INPUT, DELIBERATELY
 * --------------------------------------------------
 *   READ  — junk degrades to "not set". A stored palette id that no longer
 *           exists must not take a live school site down, so the reader falls
 *           back to the default and the page still renders.
 *   WRITE — junk is refused, with a message naming the field. Nothing enters
 *           the database that the reader would have to paper over.
 *
 * Both halves live here so they can never drift apart: the writer only accepts
 * what the reader is prepared to produce.
 */

export const CONFIG_LIMITS = {
  url: 300,
  seoTitle: 80,
  seoDescription: 200,
  logoPath: 200,
} as const;

export const CONTACT_KEYS = ["whatsapp", "facebook", "instagram", "x", "youtube"] as const;

export type ContactKey = (typeof CONTACT_KEYS)[number];

export type SiteContact = Record<ContactKey, string | null>;
export type SiteSeo = { title: string | null; description: string | null };
export type SiteThemeConfig = { palette: string; logoPath: string | null };
export type SiteConfig = { theme: SiteThemeConfig; contact: SiteContact; seo: SiteSeo };

/** A media path this platform issues: `site/<uuid>.<ext>`. */
const MEDIA_PATH = /^site\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]{2,5}$/i;

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function isHttpsUrl(value: string): boolean {
  return /^https:\/\/[^\s]+$/i.test(value);
}

function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max) return null;
  return trimmed;
}

/**
 * READ SIDE — turns whatever is stored into something a template can trust.
 * Never throws, never returns a partial object.
 */
export function readSiteConfig(row: {
  theme?: unknown;
  contact?: unknown;
  seo?: unknown;
}): SiteConfig {
  const theme = asObject(row.theme);
  const contact = asObject(row.contact);
  const seo = asObject(row.seo);

  const palette =
    typeof theme.palette === "string" && isKnownPalette(theme.palette)
      ? theme.palette
      : DEFAULT_PALETTE.id;

  const contactOut = {} as SiteContact;
  for (const key of CONTACT_KEYS) {
    const value = contact[key];
    contactOut[key] = typeof value === "string" && isHttpsUrl(value) ? value : null;
  }

  return {
    theme: {
      palette,
      logoPath: typeof theme.logo_path === "string" && MEDIA_PATH.test(theme.logo_path)
        ? theme.logo_path
        : null,
    },
    contact: contactOut,
    seo: {
      title: cleanText(seo.title, CONFIG_LIMITS.seoTitle),
      description: cleanText(seo.description, CONFIG_LIMITS.seoDescription),
    },
  };
}

/**
 * WRITE SIDE — validates a configuration submitted by the CMS.
 *
 * The whole configuration is replaced on save (no partial updates), and every
 * problem is reported at once. Ownership of `logo_path` is checked by the route
 * against the school's own library; this only checks its shape.
 *
 * WhatsApp is the one contact link a school is asked for as a NUMBER rather
 * than a URL — nobody knows their wa.me URL by heart, they know their phone
 * number. A number is normalised here into the link WhatsApp needs, so
 * everything downstream (the renderer, the preview, the Copilot) still reads
 * one kind of value: an https link.
 */
export function validateSiteConfig(
  input: unknown,
): { ok: true; config: SiteConfig } | { ok: false; errors: string[] } {
  const errors = new ValidationErrors();
  const body = asObject(input);
  const themeBody = asObject(body.theme);
  const contactBody = asObject(body.contact);
  const seoBody = asObject(body.seo);

  const palette = oneOf(themeBody, "palette", PALETTE_IDS, errors.child("theme"), {
    required: true,
  });

  const logoPath = text(themeBody, "logo_path", errors.child("theme"), {
    max: CONFIG_LIMITS.logoPath,
  });
  if (logoPath && !MEDIA_PATH.test(logoPath)) {
    errors.child("theme").add("logo_path", "must be an image from this school's library");
  }

  const contact = {} as SiteContact;
  for (const key of CONTACT_KEYS) {
    const value = text(contactBody, key, errors.child("contact"), { max: CONFIG_LIMITS.url });

    if (key === "whatsapp" && value && !isHttpsUrl(value)) {
      // "0803 123 4567" → https://wa.me/2348031234567   (+234 … , 00234 … too)
      const link = whatsAppLink(value);
      contact.whatsapp = link;
      if (!link) {
        errors
          .child("contact")
          .add("whatsapp", "must be a phone number (e.g. 0803 123 4567) or an https:// link");
      }
      continue;
    }

    if (value && !isHttpsUrl(value)) {
      errors.child("contact").add(key, "must start with https://");
    }
    contact[key] = value;
  }

  const title = text(seoBody, "title", errors.child("seo"), { max: CONFIG_LIMITS.seoTitle });
  const description = text(seoBody, "description", errors.child("seo"), {
    max: CONFIG_LIMITS.seoDescription,
  });

  if (!errors.ok || !palette) {
    return { ok: false, errors: errors.list.map((error) => `${error.field}: ${error.message}`) };
  }

  return {
    ok: true,
    config: {
      theme: { palette, logoPath: logoPath ?? null },
      contact,
      seo: { title, description },
    },
  };
}
