import { describe, it, expect } from "vitest";
import {
  buildSiteManifest,
  resolveIconUrl,
  schoolIconUrl,
  siteMetadata,
  sitePath,
  siteViewport,
} from "@/lib/site/branding";
import type { SiteViewModel } from "@/lib/site/types";

/**
 * The branding a browser reads for itself — tab icon, home-screen name,
 * manifest, browser-bar colour.
 *
 * These tests exist because the failure they cover happened in production: a
 * school's paid-for domain showed the platform's favicon. They pin the two
 * properties that matter — the school's own data is used when it exists, and
 * every absent or hostile value falls back to the platform mark instead of a
 * broken reference.
 */

const LOGO = "https://cdn.example/media/site/logo.png";

function site(over: Partial<SiteViewModel> = {}): SiteViewModel {
  return {
    school: {
      name: "GS Apex Stars School",
      slug: "gs-apex-stars",
      motto: "Knowledge and character",
      logoUrl: LOGO,
      address: null,
      phone: null,
      email: null,
    },
    templateKey: "classic",
    templateVersion: "v1",
    sections: [],
    theme: {
      paletteId: "plum",
      colors: {
        primary: "#7A2E4E",
        primaryDark: "#5A1F39",
        accent: "#D4A017",
        tint: "#FBF3F6",
        onPrimary: "#FFFFFF",
      },
    },
    contact: { whatsapp: null, facebook: null, instagram: null, x: null, youtube: null },
    seo: { title: null, description: null },
    ...over,
  };
}

describe("resolveIconUrl", () => {
  it("accepts an absolute http(s) URL", () => {
    expect(resolveIconUrl(LOGO)).toBe(LOGO);
    expect(resolveIconUrl("http://cdn.example/logo.png")).toBe("http://cdn.example/logo.png");
  });

  it("refuses anything a browser should not be pointed at", () => {
    // Stored data, treated as untrusted: a relative path, a script URL and
    // junk all mean "no icon of your own" rather than a broken tab.
    expect(resolveIconUrl("javascript:alert(1)")).toBeNull();
    expect(resolveIconUrl("data:image/svg+xml,<svg/>")).toBeNull();
    expect(resolveIconUrl("/favicon.svg")).toBeNull();
    expect(resolveIconUrl("not a url")).toBeNull();
    expect(resolveIconUrl("")).toBeNull();
    expect(resolveIconUrl(null)).toBeNull();
    expect(resolveIconUrl(undefined)).toBeNull();
  });
});

describe("schoolIconUrl", () => {
  it("uses the school's own logo", () => {
    expect(schoolIconUrl(site())).toBe(LOGO);
  });

  it("reports no icon when the school has none, or has junk", () => {
    expect(schoolIconUrl(site({ school: { ...site().school, logoUrl: null } }))).toBeNull();
    expect(schoolIconUrl(site({ school: { ...site().school, logoUrl: "/etc/passwd" } }))).toBeNull();
  });
});

describe("sitePath", () => {
  it("addresses a site by slug and by host alike", () => {
    expect(sitePath("gs-apex-stars")).toBe("/site/gs-apex-stars");
    expect(sitePath("gsapexstars.com.ng")).toBe("/site/gsapexstars.com.ng");
  });
});

describe("siteMetadata", () => {
  it("carries the school's own identity into the browser", () => {
    const md = siteMetadata(site(), "gsapexstars.com.ng");

    // Absolute, so the platform's " | SchoolAid" suffix — branding on a page
    // that belongs to somebody else — does not appear.
    expect(md.title).toEqual({ absolute: "GS Apex Stars School" });
    expect(md.icons).toEqual({ icon: LOGO, shortcut: LOGO, apple: LOGO });
    expect(md.manifest).toBe("/site/gsapexstars.com.ng/manifest.webmanifest");
    expect(md.appleWebApp).toEqual({
      capable: true,
      statusBarStyle: "black-translucent",
      title: "GS Apex Stars School",
    });
    expect(md.robots).toEqual({ index: false, follow: false });
  });

  it("prefers the website's configured SEO title and description", () => {
    const md = siteMetadata(
      site({ seo: { title: "GS Apex", description: "A school in Port Harcourt." } }),
      "gs-apex-stars",
    );

    expect(md.title).toEqual({ absolute: "GS Apex" });
    expect(md.description).toBe("A school in Port Harcourt.");
    expect(md.manifest).toBe("/site/gs-apex-stars/manifest.webmanifest");
  });

  it("keeps the platform's icons when the school has no logo of its own", () => {
    const md = siteMetadata(site({ school: { ...site().school, logoUrl: null } }), "gs-apex-stars");

    expect("icons" in md).toBe(false);
    expect(md.title).toEqual({ absolute: "GS Apex Stars School" });
  });
});

describe("siteViewport", () => {
  it("colours the browser bar from the school's own palette", () => {
    expect(siteViewport(site()).themeColor).toBe("#7A2E4E");
  });
});

describe("buildSiteManifest", () => {
  it("names the install after the school and icons it with the school's logo", () => {
    const manifest = buildSiteManifest(site({ seo: { title: "GS Apex", description: null } }));

    expect(manifest.name).toBe("GS Apex");
    expect(manifest.short_name).toBe("GS Apex");
    expect(manifest.theme_color).toBe("#7A2E4E");
    expect(manifest.background_color).toBe("#ffffff");
    expect(manifest.start_url).toBe("/");
    expect(manifest.display).toBe("standalone");
    expect(manifest.icons).toEqual([{ src: LOGO, sizes: "any" }]);
  });

  it("falls back to the school's name and the platform's icons", () => {
    const manifest = buildSiteManifest(site({ school: { ...site().school, logoUrl: null } }));

    expect(manifest.name).toBe("GS Apex Stars School");
    expect(manifest.icons).toEqual([
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ]);
  });

  it("does not install a whitespace title as the app name", () => {
    // A stored SEO title of spaces is not a name; the school's own is.
    const manifest = buildSiteManifest(site({ seo: { title: "   ", description: null } }));
    expect(manifest.name).toBe("GS Apex Stars School");
  });
});
