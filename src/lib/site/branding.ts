import type { Metadata, Viewport } from "next";
import type { SiteViewModel } from "./types";

/**
 * What the browser itself says about a school's website.
 *
 * A page is not only its content. The tab icon, the name on a home-screen
 * shortcut, the manifest behind "add to home screen" and the colour of the
 * phone's browser bar are all read by the browser from metadata and fixed
 * addresses it chooses for itself — and before this module existed a school's
 * website inherited every one of them from the platform: a paying school's own
 * domain showed SchoolAid's favicon (found on gsapexstars.com.ng, in
 * production, the day after its certificate was issued).
 *
 * Everything here is derived from the view-model the resolver already returns.
 * It adds no reads, no tables and no new tenant data; it decides, from data
 * the site already carries, what the platform must hand the browser so the
 * school's own branding appears.
 *
 * The fallbacks all point one way, and deliberately: a school with no logo of
 * its own keeps the platform's icon, and a malformed stored value (a relative
 * path, junk, `javascript:`) is treated as no logo. A wrong icon is a blemish;
 * a broken one is a browser error on a page we publish.
 */

/** What the platform shows when a school has no icon of its own. */
export const PLATFORM_ICON_PATH = "/favicon.svg";

/** The address a browser asks when a page declares no icon of its own. */
export const FAVICON_PATH = "/favicon.ico";

/**
 * A usable, absolute icon URL, or null.
 *
 * The value is stored data — the school's own upload, or a website
 * configuration — so it is treated as untrusted input: only an absolute
 * http(s) URL survives. Anything else falls back to the platform mark rather
 * than being handed to a browser as the icon of a public page.
 */
export function resolveIconUrl(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== "string") return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** The icon one school's site should carry, or null to keep the platform's. */
export function schoolIconUrl(site: SiteViewModel): string | null {
  return resolveIconUrl(site.school.logoUrl);
}

/** The platform address a school's site answers at, by slug or by host. */
export function sitePath(identifier: string): string {
  return `/site/${encodeURIComponent(identifier)}`;
}

/**
 * The page metadata a browser reads before it renders anything: the tab
 * title, the school's own icon, and the manifest that names a home-screen
 * shortcut after the school instead of after the platform.
 */
export function siteMetadata(site: SiteViewModel, identifier: string): Metadata {
  const title = site.seo.title ?? site.school.name;
  const icon = schoolIconUrl(site);

  return {
    // `absolute` on purpose: the platform layout appends " | SchoolAid" to
    // every page title, and that suffix is the platform's branding on a page
    // that belongs to somebody else. On the school's own site the title is
    // exactly the school's title.
    title: { absolute: title },
    description: site.seo.description ?? site.school.motto ?? undefined,
    // Path access is never a search result. Indexing becomes a deliberate
    // per-host decision in the host-resolution slice.
    robots: { index: false, follow: false },
    // When the school has a logo of its own it replaces every platform icon —
    // tab, shortcut and iOS home screen alike. Without one the platform's own
    // icons stay, which is still a working page.
    ...(icon ? { icons: { icon, shortcut: icon, apple: icon } } : {}),
    manifest: `${sitePath(identifier)}/manifest.webmanifest`,
    // iOS names the home-screen shortcut from here; without this it would say
    // "SchoolAid" on a school's own domain.
    appleWebApp: { capable: true, statusBarStyle: "black-translucent", title },
  };
}

/**
 * The mobile browser's chrome, coloured by the school's own palette rather
 * than the platform's cobalt.
 */
export function siteViewport(site: SiteViewModel): Viewport {
  return {
    width: "device-width",
    initialScale: 1,
    minimumScale: 1,
    viewportFit: "cover",
    themeColor: site.theme.colors.primary,
  };
}

/**
 * The "add to home screen" manifest for one school's website.
 *
 * Deliberately a small subset of the platform manifest: a school's website is
 * not a SchoolAid app install, so no shortcuts, and nothing here is a promise
 * the site engine cannot keep. Name and colours come from the school's own
 * configuration; the icon from the school's own logo, or the platform's mark
 * when it has none — the same fallback as the tab icon.
 */
export function buildSiteManifest(site: SiteViewModel): Record<string, unknown> {
  const name = site.seo.title?.trim() || site.school.name;
  const icon = schoolIconUrl(site);

  return {
    name,
    short_name: name.slice(0, 30),
    description: site.seo.description ?? site.school.motto ?? undefined,
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: site.theme.colors.primary,
    lang: "en",
    icons: icon
      ? [{ src: icon, sizes: "any" }]
      : [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
        ],
  };
}
