import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import type { SiteViewModel } from "@/lib/site/types";

/**
 * The wiring, not the rules.
 *
 * `lib/site/__tests__/branding.test.ts` proves *what* a school's branding
 * should be; these tests prove each browser-facing surface — the page's
 * metadata and viewport, the icon route, the manifest route — is actually
 * connected to the resolver and to those rules. Both are needed: the leak this
 * covers was a working rules-free surface (a page that set none of them).
 */

vi.mock("@/lib/site/load-published", () => ({ resolveSite: vi.fn() }));
vi.mock("@/components/site/SiteRenderer", () => ({ SiteRenderer: () => null }));

import { resolveSite } from "@/lib/site/load-published";
import { generateMetadata, generateViewport } from "@/app/site/[slug]/page";
import { GET as faviconGET } from "@/app/site/[slug]/favicon.ico/route";
import { GET as manifestGET } from "@/app/site/[slug]/manifest.webmanifest/route";

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

const okResult = (s: SiteViewModel = site()) => ({ ok: true as const, site: s });
const NO_SITE = { ok: false as const, reason: "unknown_school" as const };

const mockedResolve = vi.mocked(resolveSite);

beforeEach(() => {
  mockedResolve.mockReset();
});

describe("the public site page", () => {
  it("serves the school's own metadata and viewport", async () => {
    mockedResolve.mockResolvedValue(okResult());
    const props = { params: Promise.resolve({ slug: "gs-apex-stars" }) };

    const metadata = await generateMetadata(props);
    expect(metadata.title).toEqual({ absolute: "GS Apex Stars School" });
    expect(metadata.icons).toEqual({ icon: LOGO, shortcut: LOGO, apple: LOGO });

    const viewport = await generateViewport(props);
    expect(viewport.themeColor).toBe("#7A2E4E");
  });

  it("stays not-found, with no school branding, when there is no site", async () => {
    mockedResolve.mockResolvedValue(NO_SITE);
    const props = { params: Promise.resolve({ slug: "nope" }) };

    const metadata = await generateMetadata(props);
    expect(metadata.title).toBe("Not found");
    expect(metadata.icons).toBeUndefined();

    const viewport = await generateViewport(props);
    expect(viewport).toEqual({});
  });
});

describe("the school's icon route", () => {
  const request = () => new NextRequest("https://gsapexstars.com.ng/favicon.ico");
  const context = { params: Promise.resolve({ slug: "gsapexstars.com.ng" }) };

  it("sends the browser to the school's own logo", async () => {
    mockedResolve.mockResolvedValue(okResult());
    const res = await faviconGET(request(), context);

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(LOGO);
    expect(res.headers.get("cache-control")).toContain("max-age=300");
  });

  it("falls back to the platform mark when the school has no logo", async () => {
    mockedResolve.mockResolvedValue(
      okResult(site({ school: { ...site().school, logoUrl: null } })),
    );
    const res = await faviconGET(request(), context);

    expect(res.headers.get("location")).toBe("https://gsapexstars.com.ng/favicon.svg");
  });

  it("falls back to the platform mark for a host with no site", async () => {
    mockedResolve.mockResolvedValue(NO_SITE);
    const res = await faviconGET(request(), context);

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://gsapexstars.com.ng/favicon.svg");
  });
});

describe("the school's manifest route", () => {
  const request = () =>
    new NextRequest("https://gsapexstars.com.ng/site/gsapexstars.com.ng/manifest.webmanifest");
  const context = { params: Promise.resolve({ slug: "gsapexstars.com.ng" }) };

  it("returns the school's own manifest", async () => {
    mockedResolve.mockResolvedValue(okResult());
    const res = await manifestGET(request(), context);

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/manifest+json");

    const body = (await res.json()) as Record<string, unknown>;
    expect(body.name).toBe("GS Apex Stars School");
    expect(body.theme_color).toBe("#7A2E4E");
    expect(body.icons).toEqual([{ src: LOGO, sizes: "any" }]);
  });

  it("answers not-found for a host with no site", async () => {
    mockedResolve.mockResolvedValue(NO_SITE);
    const res = await manifestGET(request(), context);
    expect(res.status).toBe(404);
  });
});
