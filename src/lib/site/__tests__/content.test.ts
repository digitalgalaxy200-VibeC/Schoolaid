import { describe, it, expect } from "vitest";
import {
  HOME_PAGE_PATH,
  sectionFromStored,
  validateContentSubmission,
  withTemplateKinds,
} from "../content";
import { LIMITS } from "../templates/contracts";
import { loadTemplate, type SiteTemplate } from "../templates/registry";

/**
 * Content is the write side of the public page: whatever survives
 * `validateContentSubmission` is what the resolver will later read and render.
 * These cases pin the two modes that matter — a VISIBLE section is held to the
 * full published contract, a HIDDEN one may be unfinished — plus the mappings
 * that keep the editor, the database and the renderer from drifting apart.
 */

const CLASSIC: SiteTemplate = (() => {
  const template = loadTemplate("classic");
  if (!template) throw new Error("the classic template is missing from the registry");
  return template;
})();

/** A template that can render only a hero, for contract-narrowing cases. */
const HERO_ONLY: SiteTemplate = { ...CLASSIC, sectionKinds: ["hero"] };

const contact = (over: Record<string, unknown> = {}) => ({
  kind: "contact",
  is_visible: true,
  heading: "Contact us",
  intro: "We are happy to hear from you.",
  ...over,
});

const submit = (sections: unknown[], template: SiteTemplate = CLASSIC) =>
  validateContentSubmission({ sections }, template);

describe("validateContentSubmission — accepts", () => {
  it("stores a visible section as kind, visibility and content", () => {
    const result = submit([
      { kind: "hero", is_visible: true, headline: "Welcome", subheadline: "Hello there" },
    ]);
    if (!result.ok) throw new Error("unreachable");

    expect(result.sections).toEqual([
      {
        kind: "hero",
        is_visible: true,
        content: { headline: "Welcome", subheadline: "Hello there" },
      },
    ]);
  });

  it("trims surrounding whitespace, as the published contract does", () => {
    const result = submit([
      { kind: "hero", is_visible: true, headline: "  Welcome  ", subheadline: " Hello there " },
    ]);
    if (!result.ok) throw new Error("unreachable");

    expect(result.sections[0].content).toEqual({
      headline: "Welcome",
      subheadline: "Hello there",
    });
  });

  it("drops undeclared fields instead of passing them through", () => {
    const result = submit([
      {
        kind: "hero",
        is_visible: true,
        headline: "Welcome",
        subheadline: "Hello",
        evil: "<script>alert(1)</script>",
      },
    ]);
    if (!result.ok) throw new Error("unreachable");

    expect(Object.keys(result.sections[0].content).sort()).toEqual(["headline", "subheadline"]);
    expect(JSON.stringify(result.sections)).not.toContain("alert(1)");
  });

  it("allows a HIDDEN section to be unfinished", () => {
    const result = submit([contact(), { kind: "hero", is_visible: false }]);
    if (!result.ok) throw new Error("unreachable");

    const hero = result.sections.find((section) => section.kind === "hero");
    expect(hero).toEqual({ kind: "hero", is_visible: false, content: {} });
  });

  it("keeps a half-written hidden programme item, and drops blank rows", () => {
    const result = submit([
      contact(),
      {
        kind: "programs",
        is_visible: false,
        items: [
          { name: "", description: "" },
          { name: "Primary", description: "" },
        ],
      },
    ]);
    if (!result.ok) throw new Error("unreachable");

    const programs = result.sections.find((section) => section.kind === "programs");
    expect(programs?.content).toEqual({ items: [{ name: "Primary" }] });
  });

  it("accepts every template kind, in the order submitted", () => {
    const result = submit([
      contact(),
      { kind: "hero", is_visible: true, headline: "Welcome", subheadline: "Hello" },
    ]);
    if (!result.ok) throw new Error("unreachable");

    expect(result.sections.map((section) => section.kind)).toEqual(["contact", "hero"]);
  });
});

describe("validateContentSubmission — refuses", () => {
  const errorText = (result: ReturnType<typeof validateContentSubmission>) =>
    result.ok ? "" : result.errors.join(" | ");

  it("refuses a VISIBLE section missing a required field", () => {
    const result = submit([{ kind: "hero", is_visible: true, headline: "Welcome" }]);
    expect(result.ok).toBe(false);
    expect(errorText(result)).toContain("subheadline");
  });

  it("refuses a visible programs list with an incomplete item", () => {
    const result = submit([
      {
        kind: "programs",
        is_visible: true,
        heading: "Programmes",
        items: [{ name: "Primary", description: "" }],
      },
    ]);
    expect(result.ok).toBe(false);
    expect(errorText(result)).toContain("description");
  });

  it("still enforces length limits on a hidden section", () => {
    const result = submit([
      contact(),
      { kind: "about", is_visible: false, body: "x".repeat(LIMITS.body + 1) },
    ]);
    expect(result.ok).toBe(false);
    expect(errorText(result)).toContain("at most");
  });

  it("still enforces field types on a hidden section", () => {
    const result = submit([
      contact(),
      { kind: "hero", is_visible: false, headline: 42, subheadline: "Hello" },
    ]);
    expect(result.ok).toBe(false);
    expect(errorText(result)).toContain("must be a string");
  });

  it("refuses a kind the template does not declare", () => {
    const result = submit([{ kind: "about", is_visible: true, heading: "A", body: "B" }], HERO_ONLY);
    expect(result.ok).toBe(false);
    expect(errorText(result)).toContain("kind");
  });

  it("refuses the same kind twice on a page", () => {
    const result = submit([contact(), contact({ heading: "Again" })]);
    expect(result.ok).toBe(false);
    expect(errorText(result)).toContain("more than once");
  });

  it("refuses an empty section list", () => {
    expect(submit([]).ok).toBe(false);
  });

  it("refuses more sections than the contract allows", () => {
    const many = Array.from({ length: LIMITS.sectionsMax + 1 }, (_, i) =>
      contact({ heading: `Contact ${i}` }),
    );
    expect(submit(many).ok).toBe(false);
  });

  it("refuses a save that would leave nothing visible", () => {
    const result = submit([{ kind: "hero", is_visible: false }]);
    expect(result.ok).toBe(false);
    expect(errorText(result)).toContain("at least one section must be visible");
  });

  it("requires every section to say whether it is visible", () => {
    const result = submit([{ kind: "hero", headline: "Welcome", subheadline: "Hello" }]);
    expect(result.ok).toBe(false);
    expect(errorText(result)).toContain("is_visible");
  });
});

describe("sectionFromStored — the canonical mapping", () => {
  it("lets the row's kind and visibility win over keys inside the content", () => {
    const section = sectionFromStored({
      kind: "hero",
      is_visible: true,
      content: { kind: "about", is_visible: false, headline: "Welcome", subheadline: "Hello" },
    });

    expect(section).toEqual({
      kind: "hero",
      is_visible: true,
      headline: "Welcome",
      subheadline: "Hello",
    });
  });

  it("treats content that is not an object as empty", () => {
    expect(sectionFromStored({ kind: "hero", is_visible: true, content: null })).toEqual({
      kind: "hero",
      is_visible: true,
    });
    expect(sectionFromStored({ kind: "hero", is_visible: true, content: "junk" })).toEqual({
      kind: "hero",
      is_visible: true,
    });
    expect(sectionFromStored({ kind: "hero", is_visible: true, content: [1, 2] })).toEqual({
      kind: "hero",
      is_visible: true,
    });
  });

  it("round-trips a validated submission unchanged", () => {
    const wire = { kind: "hero", is_visible: true, headline: "Welcome", subheadline: "Hello" };
    const result = validateContentSubmission({ sections: [wire] }, CLASSIC);
    if (!result.ok) throw new Error("unreachable");

    const stored = result.sections[0];
    expect(
      sectionFromStored({ kind: stored.kind, is_visible: stored.is_visible, content: stored.content }),
    ).toEqual(wire);
  });
});

describe("withTemplateKinds — the editor sees every block", () => {
  const stored = [
    { kind: "contact" as const, is_visible: true, heading: "Contact us", intro: "Hello" },
  ];

  it("offers every kind the template declares, hidden, after the stored ones", () => {
    const merged = withTemplateKinds(stored, CLASSIC);

    expect(merged.map((section) => section.kind)).toEqual([
      "contact",
      "notice",
      "hero",
      "values",
      "about",
      "programs",
      "facilities",
      "principal_message",
      "highlights",
      "testimonials",
      "admissions_steps",
      "events",
      "faq",
      "gallery",
      "blog",
    ]);
    expect(merged[2]).toEqual({ kind: "hero", is_visible: false });
  });

  it("changes nothing when every kind is already stored", () => {
    const complete = [
      { kind: "notice" as const, is_visible: false, message: "A" },
      { kind: "hero" as const, is_visible: true, headline: "A", subheadline: "B" },
      { kind: "values" as const, is_visible: false, mission: "M" },
      { kind: "about" as const, is_visible: true, heading: "C", body: "D" },
      { kind: "programs" as const, is_visible: false, items: [] },
      { kind: "facilities" as const, is_visible: false, items: [] },
      { kind: "principal_message" as const, is_visible: false, message: "E" },
      { kind: "highlights" as const, is_visible: false, items: [] },
      { kind: "testimonials" as const, is_visible: false, items: [] },
      { kind: "admissions_steps" as const, is_visible: false, steps: [] },
      { kind: "events" as const, is_visible: false, events: [] },
      { kind: "faq" as const, is_visible: false, faqs: [] },
      { kind: "gallery" as const, is_visible: false, images: [] },
      { kind: "blog" as const, is_visible: false, posts: [] },
      { kind: "contact" as const, is_visible: false, intro: "F" },
    ];
    expect(withTemplateKinds(complete, CLASSIC)).toEqual(complete);
  });
});

describe("the home page address", () => {
  it("is the site root", () => {
    expect(HOME_PAGE_PATH).toBe("/");
  });
});
