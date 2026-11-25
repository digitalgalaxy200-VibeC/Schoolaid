/** Bump this number manually before each deployment. */
export const APP_VERSION = "v2.0";

export const APP_NAME = "SchoolAid";

/**
 * The label shown in every sidebar footer.
 *
 * The version constant already carries its `v`; the school-admin footer used to
 * prefix another one and rendered "SchoolAid vv2.0". Normalising here means a
 * future bump to `2.1` (or `v2.1`) still reads correctly, and the other layouts
 * cannot drift into the same mistake.
 */
export function versionLabel(): string {
  const version = APP_VERSION.trim().replace(/^v/i, "");
  return `${APP_NAME} v${version}`;
}
