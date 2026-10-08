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
  "www.schoolaid.online",
  "staging.schoolaid.online",
  "schoolaid.app",
] as const;

/**
 * Suffixes that are ours: anything under them is a platform address, so a
 * preview `*.vercel.app` deploy is ours too. A leading dot is required —
 * without it `notschoolaid.online` would match.
 *
 * THERE IS DELIBERATELY NO `.schoolaid.online` SUFFIX HERE. Subdomains of the
 * production domain are reserved for SCHOOLS (`<school>.schoolaid.online`), so a
 * blanket suffix rule would classify every one of them as a platform address —
 * and a school's own address would silently serve the platform instead of that
 * school's website. The platform's own subdomains are named one by one above.
 */
const PLATFORM_SUFFIXES = [".schoolaid.app", ".vercel.app"] as const;

/**
 * The platform's landing page, for links that leave a school's site.
 *
 * A school's website is served on the school's own host — a custom domain, or
 * `<slug>.schoolaid.online` — so `/` there is the SCHOOL's front page. The
 * footer attribution on every school website therefore cannot use a relative
 * link without sending that school's own visitors straight back to the same
 * school. This is the one place the platform's public address is written down;
 * `hosts.test.ts` holds it to the platform-host list above, so it can never
 * drift into pointing at a school.
 */
export const PLATFORM_LANDING_URL = "https://schoolaid.online";

/**
 * The platform's own login page, absolute — for the same reason as the landing
 * URL above, and one more: on a school's own domain middleware rewrites
 * `/login` to THAT school's login, so a relative link on a "school not found"
 * screen would rewrite straight back to the page the visitor is already on.
 */
export const PLATFORM_LOGIN_URL = `${PLATFORM_LANDING_URL}/login`;

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
