import { describe, it, expect } from "vitest";
import { CONFIG_LIMITS, readSiteConfig, validateSiteConfig } from "../config";
import { DEFAULT_PALETTE } from "../theme";

const VALID_PATH = "site/11111111-2222-3333-4444-555555555555.png";

const validInput = () => ({
  theme: { palette: "plum", logo_path: VALID_PATH },
  contact: {
    whatsapp: "https://wa.me/2348000000000",
    facebook: "",
    instagram: "https://instagram.com/school",
  },
  seo: { title: "Green Valley Academy", description: "A school in Lagos." },
});

const errorText = (result: ReturnType<typeof validateSiteConfig>) =>
  result.ok ? "" : result.errors.join(" | ");

describe("validateSiteConfig — accepts", () => {
  it("accepts a complete configuration and normalises it", () => {
    const result = validateSiteConfig(validInput());
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");

    expect(result.config.theme.palette).toBe("plum");
    expect(result.config.theme.logoPath).toBe(VALID_PATH);
    expect(result.config.contact.whatsapp).toBe("https://wa.me/2348000000000");
    expect(result.config.seo.title).toBe("Green Valley Academy");
  });

  it("turns an empty social field into null rather than an empty string", () => {
    const result = validateSiteConfig(validInput());
    if (!result.ok) throw new Error("unreachable");
    expect(result.config.contact.facebook).toBeNull();
  });

  it("accepts a configuration with no logo", () => {
    const input = validInput();
    input.theme.logo_path = "";
    const result = validateSiteConfig(input);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.config.theme.logoPath).toBeNull();
  });
});

describe("validateSiteConfig — the WhatsApp number", () => {
  // Nobody knows their wa.me URL by heart; they know their phone number. The
  // school types a number and the platform stores the link WhatsApp needs, so
  // every reader downstream still sees one kind of value.
  const withWhatsapp = (number: string) => {
    const input = validInput();
    input.contact.whatsapp = number;
    return validateSiteConfig(input);
  };

  it("turns a local number into a wa.me link", () => {
    const result = withWhatsapp("0803 123 4567");
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.config.contact.whatsapp).toBe("https://wa.me/2348031234567");
  });

  it("turns the same number in other spellings into the same link", () => {
    for (const spelling of [
      "+234 803 123 4567",
      "08031234567",
      "0803-123-4567",
      "(0803) 123 4567",
      "002348031234567",
    ]) {
      const result = withWhatsapp(spelling);
      expect(result.ok, spelling).toBe(true);
      if (!result.ok) continue;
      expect(result.config.contact.whatsapp, spelling).toBe("https://wa.me/2348031234567");
    }
  });

  it("leaves a wa.me link exactly as the school wrote it", () => {
    const linked = "https://wa.me/2348031234567?text=Hello%20SchoolAid";
    const result = withWhatsapp(linked);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.config.contact.whatsapp).toBe(linked);
  });

  it("refuses something that is neither a number nor a link, and says which", () => {
    const result = withWhatsapp("call the office");
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.errors.join(" | ")).toContain("contact.whatsapp");
  });

  it("still holds every OTHER link to https", () => {
    const input = validInput();
    input.contact.instagram = "08031234567";
    const result = validateSiteConfig(input);
    expect(result.ok).toBe(false);
    expect(errorText(result)).toContain("contact.instagram");
  });
});

describe("validateSiteConfig — rejects", () => {
  it("requires a palette and names the field", () => {
    const result = validateSiteConfig({ theme: {}, contact: {}, seo: {} });
    expect(result.ok).toBe(false);
    expect(errorText(result)).toContain("theme.palette");
  });

  it("refuses a palette it does not ship", () => {
    const input = validInput();
    input.theme.palette = "neon";
    const result = validateSiteConfig(input);
    expect(result.ok).toBe(false);
    expect(errorText(result)).toContain("theme.palette");
  });

  it("refuses a social link that is not https", () => {
    const input = validInput();
    input.contact.facebook = "http://facebook.com/school";
    const result = validateSiteConfig(input);
    expect(result.ok).toBe(false);
    expect(errorText(result)).toContain("contact.facebook");
  });

  it("refuses a logo that is not a media path this platform issues", () => {
    const input = validInput();
    input.theme.logo_path = "https://example.com/logo.png";
    const result = validateSiteConfig(input);
    expect(result.ok).toBe(false);
    expect(errorText(result)).toContain("theme.logo_path");
  });

  it("refuses an over-long title", () => {
    const input = validInput();
    input.seo.title = "x".repeat(CONFIG_LIMITS.seoTitle + 1);
    expect(validateSiteConfig(input).ok).toBe(false);
  });

  it("reports every problem in one pass", () => {
    const input = validInput();
    input.theme.palette = "neon";
    input.contact.instagram = "ftp://example.com";
    input.seo.description = "y".repeat(CONFIG_LIMITS.seoDescription + 1);

    const result = validateSiteConfig(input);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.errors.length).toBeGreaterThanOrEqual(3);
  });
});

describe("readSiteConfig — degenerate input degrades, it never throws", () => {
  it("returns the defaults for an empty (or absent) configuration", () => {
    const config = readSiteConfig({});
    expect(config.theme.palette).toBe(DEFAULT_PALETTE.id);
    expect(config.theme.logoPath).toBeNull();
    expect(config.contact.whatsapp).toBeNull();
    expect(config.seo.title).toBeNull();
  });

  it("falls back to the default palette when the stored one no longer exists", () => {
    expect(readSiteConfig({ theme: { palette: "retired-palette" } }).theme.palette).toBe(
      DEFAULT_PALETTE.id,
    );
  });

  it("drops a stored URL that is not https, rather than publishing it", () => {
    // Nothing validated what is already in the column; a page must not link it.
    const config = readSiteConfig({ contact: { whatsapp: "javascript:alert(1)" } });
    expect(config.contact.whatsapp).toBeNull();
  });

  it("drops a stored logo path that is not one of ours", () => {
    const config = readSiteConfig({ theme: { logo_path: "/etc/passwd" } });
    expect(config.theme.logoPath).toBeNull();
  });

  it("drops over-long metadata instead of truncating it", () => {
    const config = readSiteConfig({ seo: { title: "x".repeat(500) } });
    expect(config.seo.title).toBeNull();
  });

  it("survives a column holding something that is not an object at all", () => {
    const config = readSiteConfig({ theme: "not an object", contact: 42, seo: [] });
    expect(config.theme.palette).toBe(DEFAULT_PALETTE.id);
    expect(config.contact.x).toBeNull();
    expect(config.seo.description).toBeNull();
  });

  it("keeps a configuration the writer would accept — the two halves agree", () => {
    const validated = validateSiteConfig(validInput());
    if (!validated.ok) throw new Error("unreachable");

    const read = readSiteConfig({
      theme: { palette: validated.config.theme.palette, logo_path: validated.config.theme.logoPath },
      contact: validated.config.contact,
      seo: validated.config.seo,
    });
    expect(read).toEqual(validated.config);
  });
});
