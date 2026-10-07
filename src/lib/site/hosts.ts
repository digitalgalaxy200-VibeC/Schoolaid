/**
 * Which hosts belong to the platform, and which belong to a school.
 *
 * This list is not cosmetic. On a PLATFORM host the root path is ours (the app,
 * or the marketing page); on a SCHOOL host the root is that school's website.
 * Middleware decides which by asking this question, and a mistake here is a
 * mistake made on every request.
 *
 * It has already been wrong once: production is `schoolaid.online` and was
 * missing from the list, so the platform's own domain was treated as somebody's
 * custom domain — the web address a school points at us was, by our own rules,
 * a school. The list lives here, with tests, rather than inline in middleware
 * where nothing could check it.
 */

/** Hostnames that are exactly ours. */
export const PLATFORM_HOSTS = [
  "localhost",
  "127.0.0.1",
  "schoolaid.online",
  "schoolaid.app",
] as const;

/**
 * Suffixes that are ours: anything under them is a platform address, so
 * `staging.schoolaid.online` and a preview `*.vercel.app` deploy are ours too.
 * A leading dot is required — without it `notschoolaid.online` would match.
 */
const PLATFORM_SUFFIXES = [".schoolaid.online", ".schoolaid.app", ".vercel.app"] as const;

/** Strips the port and lowercases, so `Localhost:3000` and `localhost` agree. */
export function normaliseHost(rawHost: string | null | undefined): string {
  return (rawHost ?? "").split(":")[0].trim().toLowerCase();
}

/**
 * True when the host is ours.
 *
 * An absent or empty host answers TRUE: with nothing to go on, the safe
 * direction is the platform and its ordinary login, never a school's branding.
 */
export function isPlatformHost(host: string): boolean {
  if (!host) return true;
  if ((PLATFORM_HOSTS as readonly string[]).includes(host)) return true;
  return PLATFORM_SUFFIXES.some((suffix) => host.endsWith(suffix));
}
