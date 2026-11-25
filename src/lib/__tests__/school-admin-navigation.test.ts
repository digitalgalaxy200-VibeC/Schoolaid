import { describe, expect, it } from "vitest";
import {
  BOTTOM_NAV_HREFS,
  NAV_SECTIONS,
  SECTION_TABS,
  bottomNavItems,
  sectionForPath,
  visibleNavSections,
  visibleSectionTabs,
} from "@/lib/school-admin/navigation";

describe("school-admin navigation", () => {
  it("has exactly the seven top-level destinations", () => {
    expect(NAV_SECTIONS.map((section) => section.label)).toEqual([
      "Home",
      "People",
      "Academics",
      "Finance",
      "Term",
      "Website",
      "Settings",
    ]);
  });

  it("gives every section and every tab strip a unique destination", () => {
    const sectionHrefs = NAV_SECTIONS.map((section) => section.href);
    expect(new Set(sectionHrefs).size).toBe(sectionHrefs.length);

    // A section's own href intentionally appears again as its first tab, so
    // uniqueness is checked per strip, not across sections.
    for (const tabs of Object.values(SECTION_TABS)) {
      const hrefs = tabs.map((tab) => tab.href);
      expect(new Set(hrefs).size, hrefs.join(", ")).toBe(hrefs.length);
    }
  });

  it("keeps every destination inside the school-admin area", () => {
    for (const section of NAV_SECTIONS) {
      expect(section.href, section.label).toMatch(/^\/school-admin(\/|$)/);
      expect(section.icon.trim(), section.label).not.toBe("");
    }
    for (const tab of Object.values(SECTION_TABS).flat()) {
      expect(tab.href, tab.label).toMatch(/^\/school-admin(\/|$)/);
    }
  });

  it("resolves the four phone bottom-bar destinations by href", () => {
    expect(bottomNavItems(NAV_SECTIONS).map((section) => section.href)).toEqual([
      ...BOTTOM_NAV_HREFS,
    ]);
  });

  it("maps old screen URLs onto their new section", () => {
    expect(sectionForPath("/school-admin/dashboard")).toBe("home");
    expect(sectionForPath("/school-admin/students")).toBe("people");
    expect(sectionForPath("/school-admin/classes/123")).toBe("people");
    expect(sectionForPath("/school-admin/report-cards")).toBe("academics");
    expect(sectionForPath("/school-admin/score-entry")).toBe("academics");
    expect(sectionForPath("/school-admin/finance/payments")).toBe("finance");
    expect(sectionForPath("/school-admin/promotion")).toBe("year-end");
    expect(sectionForPath("/school-admin/graduated")).toBe("year-end");
    expect(sectionForPath("/school-admin/website/content")).toBe("website");
    expect(sectionForPath("/school-admin/profile")).toBe("settings");
    expect(sectionForPath("/school-admin/assessment")).toBe("settings");
  });

  it("keeps the more specific Settings route ahead of Report Cards", () => {
    // /report-cards/settings is a Settings screen, not an Academics screen.
    expect(sectionForPath("/school-admin/report-cards/settings")).toBe("settings");
  });

  it("hides Website until the engine is enabled", () => {
    const hidden = visibleNavSections(NAV_SECTIONS, {
      websiteEnabled: false,
      cbtEnabled: false,
      impersonated: false,
    }).map((section) => section.label);
    expect(hidden).not.toContain("Website");

    const shown = visibleNavSections(NAV_SECTIONS, {
      websiteEnabled: true,
      cbtEnabled: false,
      impersonated: false,
    }).map((section) => section.label);
    expect(shown).toContain("Website");
  });

  it("hides School Setup from the school's own admin", () => {
    const ownAdmin = visibleSectionTabs("settings", {
      websiteEnabled: true,
      cbtEnabled: false,
      impersonated: false,
    }).map((tab) => tab.label);
    expect(ownAdmin).not.toContain("School Setup");

    const operator = visibleSectionTabs("settings", {
      websiteEnabled: true,
      cbtEnabled: false,
      impersonated: true,
    }).map((tab) => tab.label);
    expect(operator).toContain("School Setup");
  });

  it("shows the CBT tab only when the school has the entitlement", () => {
    const off = visibleSectionTabs("academics", {
      websiteEnabled: true,
      cbtEnabled: false,
      impersonated: false,
    }).map((tab) => tab.label);
    expect(off).not.toContain("CBT");

    const on = visibleSectionTabs("academics", {
      websiteEnabled: true,
      cbtEnabled: true,
      impersonated: false,
    }).map((tab) => tab.label);
    expect(on).toContain("CBT");
  });
});
