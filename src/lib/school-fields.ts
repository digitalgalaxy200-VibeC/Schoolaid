/**
 * Which school columns a school administrator may change.
 *
 * WHY A PROJECTION RATHER THAN A REJECTION
 * ----------------------------------------
 * The school profile screen loads the whole school row (`select("*")`) and PUTs
 * the whole object back, so a body containing `is_active` or `subscription_status`
 * is ordinary traffic from our own page, not an attack. Rejecting unknown keys
 * with a 400 would break that screen.
 *
 * Projecting onto this list achieves the actual goal — the write cannot touch any
 * column outside it — without changing what the UI is allowed to send.
 *
 * WHAT IS DELIBERATELY ABSENT, AND WHY
 * ------------------------------------
 *   `slug`                 it is in URLs; a school renaming its own slug would
 *                          break links that already exist.
 *   `is_active`, `is_archived`,
 *   `subscription_*`       the platform's business, not the school's. A school
 *                          admin could otherwise mark itself active, un-archive
 *                          itself, or extend its own subscription.
 *   `id`, `created_at`,
 *   `updated_at`           never client-owned.
 *
 * This lives outside the route so it can be unit-tested directly. A rule this
 * consequential should not be reachable only by making an HTTP request.
 */

export const SCHOOL_ADMIN_WRITABLE = [
  "name",
  "address",
  "phone",
  "email",
  "logo_url",
  "grading_scale",
  "motto",
  "website",
  "abbreviation",
  "currency",
] as const;

export type SchoolAdminWritableField = (typeof SCHOOL_ADMIN_WRITABLE)[number];

/**
 * Keeps only the writable fields present in the body.
 *
 * Values pass through untouched, including `null` and `""` — clearing a phone
 * number is a legitimate edit, and coercing either into "leave unchanged" would
 * make a field impossible to empty.
 */
export function pickWritableSchoolFields(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== "object") return {};

  const source = body as Record<string, unknown>;
  const updates: Record<string, unknown> = {};

  for (const key of SCHOOL_ADMIN_WRITABLE) {
    if (key in source) updates[key] = source[key];
  }

  return updates;
}
