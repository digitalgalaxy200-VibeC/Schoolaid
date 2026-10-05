import type { SiteContact, SiteSeo } from "./config";
import type { ThemeSlot } from "./theme";

/**
 * The contract between the Website Engine's resolver and whatever renders it.
 *
 * WHY A VIEW-MODEL AND NOT A DATABASE ROW
 * ---------------------------------------
 * A public page is the one place in this platform where tenant data leaves the
 * boundary on purpose. Templates therefore never receive a database row and
 * never query anything: they receive this object, built field by field by the
 * resolver from an explicit whitelist. A column that is not named here cannot
 * reach a public page by accident — adding one is a deliberate act with a
 * reviewer looking at it.
 *
 * `school.id` is deliberately absent. No public page needs a tenant's primary
 * key, and publishing it would hand out a stable correlation id for free.
 *
 * SECTIONS ARE PLATFORM-OWNED
 * ---------------------------
 * The union below is the whole vocabulary a school's website can be built from.
 * Schools never add a kind, and a section's fields are declared here and
 * enforced by `templates/contracts.ts`. The first set is deliberately the five
 * kinds that need no other subsystem: news, events and gallery arrive with the
 * publications and media slices, and staff attribution arrives with the staff
 * listing so a person is never recorded twice.
 */

export type StatItem = { label: string; value: string };
export type HighlightItem = { title: string; description: string; icon?: string | null };
export type GalleryItem = { imageUrl: string; caption?: string | null; category?: string | null };
export type FacilityItem = { title: string; description: string; imageUrl?: string | null };
export type TestimonialItem = { quote: string; authorName: string; role: string; avatarUrl?: string | null };
export type AdmissionStepItem = { stepNumber: string; title: string; description: string };
export type EventItem = { title: string; date: string; time?: string | null; location?: string | null; category?: string | null };
export type FaqItem = { question: string; answer: string };
export type ValueItem = { title: string; description: string; icon?: string | null };
export type BlogPostItem = {
  title: string;
  excerpt?: string | null;
  date?: string | null;
  author?: string | null;
  category?: string | null;
  imageUrl?: string | null;
};

export type ProgramItem = {
  name: string;
  description: string;
  badge?: string | null;
  imageUrl?: string | null;
};

export type SiteSection =
  | {
      kind: "notice";
      message: string;
      linkText?: string | null;
      linkUrl?: string | null;
    }
  | {
      kind: "hero";
      headline: string;
      subheadline: string;
      ctaText?: string | null;
      ctaLink?: string | null;
      secondaryCtaText?: string | null;
      secondaryCtaLink?: string | null;
      imageUrl?: string | null;
      badgeText?: string | null;
      stats?: StatItem[];
    }
  | {
      kind: "values";
      heading: string;
      mission?: string | null;
      vision?: string | null;
      items: ValueItem[];
    }
  | {
      kind: "about";
      heading: string;
      body: string;
      imageUrl?: string | null;
      stats?: StatItem[];
      highlights?: string[];
    }
  | {
      kind: "programs";
      heading: string;
      intro?: string | null;
      items: ProgramItem[];
    }
  | {
      kind: "facilities";
      heading: string;
      subheading?: string | null;
      items: FacilityItem[];
    }
  | {
      kind: "principal_message";
      heading: string;
      message: string;
      authorName?: string | null;
      authorTitle?: string | null;
      imageUrl?: string | null;
    }
  | {
      kind: "highlights";
      heading: string;
      subheading?: string | null;
      items: HighlightItem[];
    }
  | {
      kind: "testimonials";
      heading: string;
      subheading?: string | null;
      items: TestimonialItem[];
    }
  | {
      kind: "admissions_steps";
      heading: string;
      subheading?: string | null;
      prospectusUrl?: string | null;
      items: AdmissionStepItem[];
    }
  | {
      kind: "events";
      heading: string;
      subheading?: string | null;
      items: EventItem[];
    }
  | {
      kind: "faq";
      heading: string;
      subheading?: string | null;
      items: FaqItem[];
    }
  | {
      kind: "gallery";
      heading: string;
      subheading?: string | null;
      items: GalleryItem[];
    }
  | {
      kind: "blog";
      heading: string;
      subheading?: string | null;
      posts: BlogPostItem[];
    }
  | {
      kind: "contact";
      heading: string;
      intro: string;
    };

/** The public-safe projection of a school. Exactly these fields, no more. */
export type PublicSchool = {
  name: string;
  slug: string;
  motto: string | null;
  logoUrl: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
};

/**
 * A published website document. For now it is supplied by a code fixture; the
 * storage-backed implementation will produce the same shape from a published
 * revision without changing the resolver, the route or the rendering.
 */
export type PublishedSiteDocument = {
  templateKey: string;
  templateVersion: string;
  sections: SiteSection[];
};

export type SiteViewModel = {
  school: PublicSchool;
  templateKey: string;
  templateVersion: string;
  sections: SiteSection[];
  /**
   * The resolved palette, not its id: a template should never have to look one
   * up, and the resolver has already dealt with an id that no longer exists.
   */
  theme: { paletteId: string; colors: Record<ThemeSlot, string> };
  contact: SiteContact;
  seo: SiteSeo;
};

/**
 * Why a school has no public site. Distinct internal reasons, one public
 * outcome (404): the difference exists for logs and tests, not for visitors —
 * a stranger should not be able to tell "no such school" from "switched off".
 *
 * `invalid_document` means a stored document failed its section contracts. That
 * must never be visible content: a public page renders only what the platform
 * has validated.
 *
 * `no_content` means the school has a website, but nothing it could legally
 * serve: no home page yet, or every section hidden. One outcome (404), like the
 * rest — but a different thing to go and fix.
 */
export type SiteFailureReason =
  | "unknown_school"
  | "school_inactive"
  | "school_archived"
  | "feature_disabled"
  | "not_configured"
  | "no_content"
  | "invalid_document"
  | "suspended"
  | "disabled"
  | "error";

export type SiteLoadResult =
  | { ok: true; site: SiteViewModel }
  | { ok: false; reason: SiteFailureReason };
