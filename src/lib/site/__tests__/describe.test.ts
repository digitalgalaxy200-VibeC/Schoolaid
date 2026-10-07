import { describe, it, expect } from "vitest";
import { ValidationErrors } from "@/lib/validate";
import { SECTION_KINDS, normaliseSectionFields } from "../templates/contracts";
import { describeSectionKind } from "../templates/describe";

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
