import { randomUUID } from "node:crypto";
import { UPLOAD_POLICY } from "@/lib/ai/uploads";

/**
 * Website media policy — where assets live, how big they may be, and when they
 * may be swept away.
 *
 * Nothing here touches the database or storage; it is the set of rules the
 * upload route and the garbage collector both obey, kept in one place so the
 * two can never disagree about, say, what "expired" means.
 *
 * DERIVATIVES ARE NOT BUILT YET (recorded decision). Serving originals today
 * costs nothing and forecloses nothing: `website_media` already carries
 * `width`, `height` and `variants`, so generating smaller renditions later is a
 * backfill, not a migration. The choice to make when it is wanted is between
 * adding `sharp` (a new production dependency) and using Supabase's hosted
 * image transformations.
 */

export const MEDIA_BUCKET = "site-assets";

/**
 * The types the bucket itself will accept. Derived from the same policy the
 * upload route validates against, so the storage layer is a second net rather
 * than a second opinion.
 */
export const MEDIA_ALLOWED_MIME_TYPES: string[] = [...UPLOAD_POLICY.image.allowed];

export const MEDIA_LIMITS = {
  /**
   * Per file. Derived from the platform's existing image policy rather than
   * restated: the upload route validates with `validateUpload`, so a second
   * copy of this number could only ever drift away from the first.
   */
  fileBytes: UPLOAD_POLICY.image.maxBytes,
  /** Per school, across every active asset. */
  schoolBytes: 250 * 1024 * 1024,
  /** How long a tombstoned object stays fetchable before the GC removes it. */
  graceMs: 7 * 24 * 60 * 60 * 1000,
  /** Alt text is part of accessibility, not decoration — it gets a limit too. */
  altTextMax: 200,
} as const;

/**
 * A storage key for a new asset.
 *
 * Opaque by construction: a random UUID and the verified extension, with no
 * school identifier anywhere in the path. The older `avatars/<school_id>/…`
 * convention publishes a tenant's UUID in every image URL (register TD3); this
 * one does not, and ownership is recorded on the row instead.
 */
export function mediaPath(extension: string): string {
  return `site/${randomUUID()}.${extension}`;
}

/** Whether accepting `incomingBytes` would take the school over its ceiling. */
export function quotaExceeded(currentBytes: number, incomingBytes: number): boolean {
  return currentBytes + incomingBytes > MEDIA_LIMITS.schoolBytes;
}

/** The soft-delete patch. The row survives; the object waits out the grace period. */
export function tombstonePatch(now: Date = new Date()): { status: "tombstone"; deleted_at: string } {
  return { status: "tombstone", deleted_at: now.toISOString() };
}

/**
 * Whether a tombstoned row is old enough for the garbage collector to remove
 * its object and the row itself. An active row is never eligible, and a
 * tombstone without a timestamp (which the schema does not allow) is treated as
 * not-yet-eligible rather than as ancient history.
 */
export function gcEligible(
  row: { status: string; deleted_at: string | null },
  now: number = Date.now(),
): boolean {
  if (row.status !== "tombstone" || !row.deleted_at) return false;
  const deletedAt = new Date(row.deleted_at).getTime();
  if (Number.isNaN(deletedAt)) return false;
  return now - deletedAt >= MEDIA_LIMITS.graceMs;
}

/** The public URL of an asset. Public read is the point: school pages are public. */
export function publicMediaUrl(supabaseUrl: string, path: string): string {
  return `${supabaseUrl}/storage/v1/object/public/${MEDIA_BUCKET}/${path}`;
}
