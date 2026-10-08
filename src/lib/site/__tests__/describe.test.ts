import { describe, it, expect } from "vitest";
import { ValidationErrors } from "@/lib/validate";
import { CONFIG_LIMITS } from "../config";
import { LIMITS, SECTION_KINDS, normaliseSectionFields } from "../templates/contracts";
import { describeContentLimits, describeSectionKind } from "../templates/describe";

/**
 * Gwin filled a testimonials block with quotes but no author names, then asked
 * for a blog block with no posts, because nothing told him what a block
 * requires. These tests exist because `describeSectionKind` is what tells him —
 * and the last one proves the description is COMPLETE rather than plausible:
 * fill in the described shape and the platform's own validator must accept it.
 */

/** The described skeleton, with every blank filled. */
function fillIn(shape: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(shape)) {
    if (Array.isArray(value)) {
      out[key] = value.map((item) => fillIn(item as Record<string, unknown>));
    } else {
      out[key] = "x";
    }
  }
  return out;
}

describe("describeSectionKind", () => {
  it("describes a block that requires only text", () => {
    const about = describeSectionKind("about");
    expect(about.required).toEqual(["heading", "body"]);
    expect(about.lists).toEqual([]);
    expect(about.shape).toEqual({ heading: "", body: "" });
  });

  it("names what each list item must carry — the failure that started this", () => {
    const items = describeSectionKind("testimonials").lists.find((l) => l.field === "items");
    expect(items?.item_fields).toEqual(expect.arrayContaining(["quote", "authorName", "role"]));
  });

  it("reports each field's CEILING, probed from the validator rather than copied", () => {
    // A block was refused on a live school site because the writer knew the shape
    // but not the limits: a 240-character core value against a 200 limit, a long
    // about body against 1200. These are the numbers it needed. They are read back
    // out of the validator's own message, so they cannot drift from LIMITS.
    expect(describeSectionKind("about").limits).toMatchObject({
      heading: LIMITS.heading,
      body: LIMITS.body,
    });
    expect(describeSectionKind("hero").limits).toMatchObject({
      headline: LIMITS.headline,
      subheadline: LIMITS.subheadline,
    });
    expect(describeSectionKind("values").limits["items[].description"]).toBe(LIMITS.itemDescription);
    expect(describeSectionKind("values").limits["items[].title"]).toBe(LIMITS.itemName);
  });

  it("never reports a ceiling it did not actually probe", () => {
    // Every probed number must name a field the block really has, so a stray match
    // cannot invent a limit that no validator would enforce.
    for (const kind of SECTION_KINDS) {
      const described = describeSectionKind(kind);
      for (const key of Object.keys(described.limits)) {
        const itemMatch = /^(\w+)\[\]\.(\w+)$/.exec(key);
        if (itemMatch) {
          const list = described.lists.find((l) => l.field === itemMatch[1]);
          expect(list, `${kind}: ${key} names a list it does not have`).toBeTruthy();
          expect(list!.item_fields).toContain(itemMatch[2]);
        } else {
          expect(described.required, `${kind}: ${key} is not a required field`).toContain(key);
        }
      }
    }
  });

  it("describes a required list of posts for the blog block", () => {
    const blog = describeSectionKind("blog");
    expect(blog.required).toContain("posts");
    const posts = blog.lists.find((l) => l.field === "posts");
    expect(posts?.item_fields.length).toBeGreaterThan(0);
  });

  it("leaves optional lists out — inventing them would be worse than omitting", () => {
    // hero.stats is optional. Asking for statistics a school does not have
    // would have Gwin invent numbers to satisfy a contract that never wanted them.
    const hero = describeSectionKind("hero");
    expect(hero.required).toEqual(["headline", "subheadline"]);
    expect(hero.required).not.toContain("stats");
  });

  it("describes every kind the template can render", () => {
    for (const kind of SECTION_KINDS) {
      expect(describeSectionKind(kind).required.length, `${kind} must require something`).toBeGreaterThan(0);
    }
  });

  it("describes ENOUGH: a filled-in shape is accepted by the validator, for every kind", () => {
    for (const kind of SECTION_KINDS) {
      const filled = fillIn(describeSectionKind(kind).shape);
      const errors = new ValidationErrors();
      const result = normaliseSectionFields(filled, kind, errors, { allowEmpty: false });

      expect(errors.list, `${kind} produced: ${JSON.stringify(errors.list)}`).toEqual([]);
      expect(result, `${kind} should have normalised`).not.toBeNull();
    }
  });
});

describe("describeContentLimits", () => {
  it("states the ceilings that left blocks of a live website empty", () => {
    // The three failures, named: a core value over the item description limit, an
    // about body over its limit, an SEO description over its limit. A writer that
    // knows these before it writes keeps within them the first time.
    const note = describeContentLimits();
    expect(note).toContain(`description ${LIMITS.itemDescription}`);
    expect(note).toContain(`body text ${LIMITS.body}`);
    expect(note).toContain(`SEO description ${CONFIG_LIMITS.seoDescription}`);
    expect(note).toContain(`at most ${LIMITS.listMax} items`);
  });

  it("never invents a limit: every number it states is a declared platform limit", () => {
    const declared = new Set<number>([...Object.values(LIMITS), ...Object.values(CONFIG_LIMITS)]);
    const stated = describeContentLimits().match(/\d+/g) ?? [];
    expect(stated.length).toBeGreaterThan(0);
    for (const number of stated) {
      expect(declared.has(Number(number)), `${number} is not a declared platform limit`).toBe(true);
    }
  });
});
