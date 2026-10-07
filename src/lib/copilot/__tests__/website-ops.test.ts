import { describe, it, expect } from "vitest";
import { applySectionPatch, applyWebsiteConfigPatch, nameFailedBlocks } from "../website-ops";
import type { SiteConfig } from "@/lib/site/config";
import type { PageSection } from "@/lib/site/content";

/**
 * The website engine REPLACES whole configurations and whole pages on save, so
 * the Copilot's "change one field" tools are really "merge, then validate".
 * These tests pin the merge: nothing unturned is lost, "" clears, and content
 * can never shadow a section's kind or visibility.
 */

const current: SiteConfig = {
  theme: { palette: "cobalt", logoPath: null },
  contact: { whatsapp: "https://wa.me/2341", facebook: null, instagram: null, x: null, youtube: null },
  seo: { title: "Old title", description: null },
};

describe("applyWebsiteConfigPatch", () => {
  it("keeps every field the patch does not mention", () => {
    const result = applyWebsiteConfigPatch(current, { instagram: "https://instagram.com/qvs" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config.contact.whatsapp).toBe("https://wa.me/2341");
    expect(result.config.contact.instagram).toBe("https://instagram.com/qvs");
    expect(result.config.theme.palette).toBe("cobalt");
    expect(result.config.seo.title).toBe("Old title");
  });

  it("changes the palette when it is one of the platform palettes", () => {
    const result = applyWebsiteConfigPatch(current, { palette: "forest" });
    expect(result.ok && result.config.theme.palette).toBe("forest");
  });

  it("refuses an unknown palette instead of writing it", () => {
    const result = applyWebsiteConfigPatch(current, { palette: "hot-pink" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(" ")).toMatch(/theme\.palette/);
  });

  it("clears a link or SEO field with an empty string", () => {
    const result = applyWebsiteConfigPatch(current, {
      whatsapp: "",
      seo_title: "",
      seo_description: "New description",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config.contact.whatsapp).toBeNull();
    expect(result.config.seo.title).toBeNull();
    expect(result.config.seo.description).toBe("New description");
  });

  it("refuses a contact link that is not https", () => {
    const result = applyWebsiteConfigPatch(current, { facebook: "facebook.com/qvs" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(" ")).toMatch(/contact\.facebook/);
  });
});

describe("applySectionPatch", () => {
  const hero: PageSection = { kind: "hero", is_visible: true, headline: "Welcome" };
  const about: PageSection = { kind: "about", is_visible: true, body: "Old about" };

  it("merges fields into an existing section and keeps the rest of the page", () => {
    const merged = applySectionPatch([hero, about], "about", { fields: { body: "New about" } });
    expect(merged).toHaveLength(2);
    expect(merged[1]).toEqual({ kind: "about", is_visible: true, body: "New about" });
    expect(merged[0]).toEqual(hero);
  });

  it("appends a section the page does not have yet, visible by default", () => {
    const merged = applySectionPatch([hero], "principal_message", {
      fields: { message: "Dear parents…" },
    });
    expect(merged[1]).toEqual({
      kind: "principal_message",
      is_visible: true,
      message: "Dear parents…",
    });
  });

  it("respects an explicit is_visible, including false", () => {
    const merged = applySectionPatch([hero, about], "about", { is_visible: false });
    expect(merged[1].is_visible).toBe(false);
  });

  it("cannot let fields shadow kind or is_visible", () => {
    const merged = applySectionPatch([hero, about], "about", {
      fields: { body: "x", kind: "hero", is_visible: false },
    });
    expect(merged[1].kind).toBe("about");
    expect(merged[1].is_visible).toBe(true);
  });
});

describe("nameFailedBlocks", () => {
  // Gwin's failing step reported "sections[6].items[0].authorName: is required",
  // which says nothing about the block a school administrator would look for.
  const page: PageSection[] = [
    { kind: "hero", is_visible: true, headline: "Welcome" },
    { kind: "testimonials", is_visible: true, items: [{ quote: "Great school" }] },
  ];

  it("names the block instead of counting sections", () => {
    const named = nameFailedBlocks(
      ["sections[1].items[0].authorName: is required"],
      page,
    );
    expect(named).toEqual(['block "testimonials" → items[0].authorName: is required']);
  });

  it("leaves an error it cannot place exactly as it was", () => {
    const errors = ["sections: at least one section must be visible"];
    expect(nameFailedBlocks(errors, page)).toEqual(errors);
  });

  it("does not invent a block name for an index that is not on the page", () => {
    expect(nameFailedBlocks(["sections[9].heading: is required"], page)).toEqual([
      "sections[9].heading: is required",
    ]);
  });
});
