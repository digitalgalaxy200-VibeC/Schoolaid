/**
 * Verification for the website-write capabilities.
 *
 * Website writes are not read back by row id like the table creates: the config
 * is one row per school, and a content block is a section of the home page. So
 * verification reads the same values the editors read (via the read
 * capabilities) and compares them to what the handler claimed it wrote.
 *
 * The comparison is deliberately exact. Copy is normalised by the platform's
 * validators before it is stored, so if a value comes back different from what
 * was sent, that is worth SEEING — a mismatch is recorded, not smoothed over.
 */

import { canonicalize } from "./idempotency";

export interface Verdict {
  verified: boolean;
  mismatches: string[];
}

/** Structural equality, key-order independent. */
export function deepEqual(a: unknown, b: unknown): boolean {
  return canonicalize(a) === canonicalize(b);
}

export interface WebsiteConfigValues {
  palette?: unknown;
  contact?: unknown;
  seo?: unknown;
}

/**
 * Confirm the stored website configuration matches what the handler reported.
 * Only the fields the handler returns are compared.
 */
export function verifyWebsiteConfig(
  stored: WebsiteConfigValues,
  claimed: WebsiteConfigValues,
): Verdict {
  const mismatches: string[] = [];
  if (claimed.palette !== undefined && !deepEqual(stored.palette, claimed.palette)) {
    mismatches.push("palette");
  }
  if (claimed.contact !== undefined && !deepEqual(stored.contact, claimed.contact)) {
    mismatches.push("contact");
  }
  if (claimed.seo !== undefined && !deepEqual(stored.seo, claimed.seo)) {
    mismatches.push("seo");
  }
  return { verified: mismatches.length === 0, mismatches };
}

/**
 * Confirm a saved block is present, has the intended visibility, and still
 * holds the field values that were sent.
 */
export function verifyWebsiteSection(
  stored: Record<string, unknown> | null,
  claimed: { is_visible?: unknown; fields?: Record<string, unknown> },
): Verdict {
  if (!stored) return { verified: false, mismatches: ["block not found"] };

  const mismatches: string[] = [];
  if (claimed.is_visible !== undefined && stored.is_visible !== claimed.is_visible) {
    mismatches.push("is_visible");
  }
  if (claimed.fields) {
    for (const [key, value] of Object.entries(claimed.fields)) {
      if (!deepEqual(stored[key], value)) mismatches.push(key);
    }
  }
  return { verified: mismatches.length === 0, mismatches };
}
