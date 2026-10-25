import { describe, it, expect } from "vitest";
import { CLASSIC_V1 } from "../fixtures/classic.v1.document";
import { LIMITS, validateDocument } from "../templates/contracts";

/**
 * The section contracts are the enforcement point for everything a school will
 * eventually put on a public page, so these cases are the accept/reject matrix
 * plus the normalisation guarantee: whatever comes out contains only declared
 * fields, whatever went in.
 */

/** A deep copy, so a test can damage one field without touching the fixture. */
const doc = () => JSON.parse(JSON.stringify(CLASSIC_V1)) as Record<string, unknown>;
const sectionsOf = (d: Record<string, unknown>) => d.sections as Record<string, unknown>[];
const errorText = (result: ReturnType<typeof validateDocument>) =>
  result.ok ? "" : result.errors.join(" | ");

describe("validateDocument — accepts", () => {
  it("accepts the shipped fixture document", () => {
    const result = validateDocument(CLASSIC_V1);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.document.sections.length).toBe(CLASSIC_V1.sections.length);
  });

  it("returns sections containing only the fields their kind declares", () => {
    const result = validateDocument(CLASSIC_V1);
    if (!result.ok) throw new Error("unreachable");
    expect(Object.keys(result.document.sections[0]).sort()).toEqual([
      "headline",
      "kind",
      "subheadline",
    ]);
  });

  it("keeps the programs list, item by item", () => {
    const result = validateDocument(CLASSIC_V1);
    if (!result.ok) throw new Error("unreachable");
    const programs = result.document.sections.find((s) => s.kind === "programs");
    if (programs?.kind !== "programs") throw new Error("expected a programs section");
    expect(programs.items.length).toBe(3);
    expect(Object.keys(programs.items[0]).sort()).toEqual(["description", "name"]);
  });
});

describe("validateDocument — normalisation", () => {
  it("drops an undeclared field instead of passing it through", () => {
    const d = doc();
    sectionsOf(d)[0].evil = "<script>alert(1)</script>";
    d.somethingElse = "payload";

    const result = validateDocument(d);
    if (!result.ok) throw new Error("unreachable");

    expect(JSON.stringify(result.document)).not.toContain("evil");
    expect(JSON.stringify(result.document)).not.toContain("somethingElse");
    // The payload, not the substring "script" — "description" contains it.
    expect(JSON.stringify(result.document)).not.toContain("alert(1)");
  });

  it("trims surrounding whitespace on text fields", () => {
    const d = doc();
    sectionsOf(d)[0].headline = "   Spaces around   ";
    const result = validateDocument(d);
    if (!result.ok) throw new Error("unreachable");
    const hero = result.document.sections[0];
    if (hero.kind !== "hero") throw new Error("expected a hero section");
    expect(hero.headline).toBe("Spaces around");
  });
});

describe("validateDocument — rejects", () => {
  it("rejects a document with no templateKey, naming the field", () => {
    const d = doc();
    delete d.templateKey;
    const result = validateDocument(d);
    expect(result.ok).toBe(false);
    expect(errorText(result)).toContain("templateKey");
  });

  it("rejects an empty section list", () => {
    const d = doc();
    d.sections = [];
    expect(validateDocument(d).ok).toBe(false);
  });

  it("rejects an unknown section kind", () => {
    const d = doc();
    sectionsOf(d)[0].kind = "chat_widget";
    const result = validateDocument(d);
    expect(result.ok).toBe(false);
    expect(errorText(result)).toContain("kind");
  });

  it("rejects a section missing a required field", () => {
    const d = doc();
    delete sectionsOf(d)[0].subheadline;
    const result = validateDocument(d);
    expect(result.ok).toBe(false);
    expect(errorText(result)).toContain("subheadline");
  });

  it("rejects a field of the wrong type", () => {
    const d = doc();
    sectionsOf(d)[1].body = 42;
    const result = validateDocument(d);
    expect(result.ok).toBe(false);
    expect(errorText(result)).toContain("body");
  });

  it("rejects text over its declared limit", () => {
    const d = doc();
    sectionsOf(d)[1].body = "x".repeat(LIMITS.body + 1);
    const result = validateDocument(d);
    expect(result.ok).toBe(false);
    expect(errorText(result)).toContain("at most");
  });

  it("rejects a list longer than the contract allows", () => {
    const d = doc();
    const programs = sectionsOf(d)[2];
    programs.items = Array.from({ length: LIMITS.listMax + 1 }, (_, i) => ({
      name: "Programme " + i,
      description: "Description",
    }));
    expect(validateDocument(d).ok).toBe(false);
  });

  it("rejects a list item missing a field", () => {
    const d = doc();
    const items = sectionsOf(d)[2].items as Record<string, unknown>[];
    delete items[1].description;
    const result = validateDocument(d);
    expect(result.ok).toBe(false);
    expect(errorText(result)).toContain("description");
  });

  it("accumulates every problem in one pass rather than stopping at the first", () => {
    const d = doc();
    delete sectionsOf(d)[0].headline;
    sectionsOf(d)[1].body = 42;
    sectionsOf(d)[2].kind = "nope";

    const result = validateDocument(d);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.errors.length).toBeGreaterThanOrEqual(3);
  });
});

/**
 * Every block may carry an optional dimmed background image. These cases pin the
 * three decisions that matter: it is stored with a default strength, a strength
 * without an image is discarded, and nonsense is refused rather than clamped
 * silently (a clamp would save 38% as 100% and look like the slider was ignored).
 */
describe("validateDocument — section backgrounds", () => {
  const hero = (d: Record<string, unknown>) => sectionsOf(d)[0];

  it("keeps a background image and its opacity", () => {
    const d = doc();
    hero(d).backgroundImageUrl = "https://cdn.example.test/campus.jpg";
    hero(d).backgroundOpacity = 35;

    const result = validateDocument(d);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.document.sections[0]).toMatchObject({
      backgroundImageUrl: "https://cdn.example.test/campus.jpg",
      backgroundOpacity: 35,
    });
  });

  it("defaults the opacity when only an image is given", () => {
    const d = doc();
    hero(d).backgroundImageUrl = "https://cdn.example.test/campus.jpg";

    const result = validateDocument(d);
    if (!result.ok) throw new Error("unreachable");
    expect(result.document.sections[0]).toMatchObject({ backgroundOpacity: 15 });
  });

  it("accepts the ends of the range", () => {
    for (const value of [0, 100]) {
      const d = doc();
      hero(d).backgroundImageUrl = "https://cdn.example.test/campus.jpg";
      hero(d).backgroundOpacity = value;
      expect(validateDocument(d).ok, `opacity ${value}`).toBe(true);
    }
  });

  it("discards an opacity that has no image to apply to", () => {
    const d = doc();
    hero(d).backgroundOpacity = 40;

    const result = validateDocument(d);
    if (!result.ok) throw new Error("unreachable");
    expect(result.document.sections[0]).not.toHaveProperty("backgroundOpacity");
    expect(result.document.sections[0]).not.toHaveProperty("backgroundImageUrl");
  });

  it("refuses an opacity outside 0–100, or a fraction", () => {
    for (const value of [-1, 101, 12.5, "dense"]) {
      const d = doc();
      hero(d).backgroundImageUrl = "https://cdn.example.test/campus.jpg";
      hero(d).backgroundOpacity = value;

      const result = validateDocument(d);
      expect(result.ok, `opacity ${String(value)}`).toBe(false);
      expect(errorText(result)).toContain("backgroundOpacity");
    }
  });

  it("refuses a background that would execute", () => {
    const d = doc();
    hero(d).backgroundImageUrl = "javascript:alert(1)";

    const result = validateDocument(d);
    expect(result.ok).toBe(false);
    expect(errorText(result)).toContain("backgroundImageUrl");
  });

  it("is available to every kind, not only the hero", () => {
    const d = doc();
    const about = sectionsOf(d).find((s) => s.kind === "about");
    if (!about) throw new Error("expected an about section");
    about.backgroundImageUrl = "https://cdn.example.test/classroom.jpg";
    about.backgroundOpacity = 20;

    const result = validateDocument(d);
    if (!result.ok) throw new Error("unreachable");
    const stored = result.document.sections.find((s) => s.kind === "about");
    expect(stored).toMatchObject({
      backgroundImageUrl: "https://cdn.example.test/classroom.jpg",
      backgroundOpacity: 20,
    });
  });
});
