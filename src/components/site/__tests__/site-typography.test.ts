import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * The public website's type scale, enforced.
 *
 * The first school websites mixed 10px, 11px, 12px, 14px and 16px for the same
 * jobs — body copy at 14px in one block and 16px in the next, card titles at 16
 * in one and 20 in another — which reads as improvised rather than designed.
 * The scale is written down in `SiteRenderer.tsx`; these tests are what keep it
 * true, because a rule nobody checks is a rule that decays at the next edit.
 *
 * A school website is read by parents on phones, so the floor for content is
 * 16px and 12px is reserved for uppercase labels and chips.
 */

const TEMPLATE_DIR = path.join(process.cwd(), "src/components/site/templates/classic");

function templateFiles(): { name: string; lines: string[] }[] {
  return fs
    .readdirSync(TEMPLATE_DIR)
    .filter((name) => name.endsWith(".tsx"))
    .sort()
    .map((name) => ({
      name,
      lines: fs.readFileSync(path.join(TEMPLATE_DIR, name), "utf8").split("\n"),
    }));
}

describe("the public website's type scale", () => {
  it("finds the template files it is meant to be checking", () => {
    // A guard on the guard: if the directory ever moves, the two tests below
    // would pass by checking nothing at all.
    const files = templateFiles();
    expect(files.length).toBeGreaterThan(10);
    expect(files.map((f) => f.name)).toContain("Hero.tsx");
  });

  it("uses no raw pixel or rem font sizes", () => {
    const offenders: string[] = [];
    for (const { name, lines } of templateFiles()) {
      lines.forEach((line, index) => {
        const match = /text-\[[0-9.]+(px|rem)\]/.exec(line);
        if (match) offenders.push(`${name}:${index + 1} ${match[0]}`);
      });
    }
    expect(offenders, "use a step from the scale in SiteRenderer.tsx").toEqual([]);
  });

  it("never sets a paragraph below 14px", () => {
    // text-xs belongs to uppercase eyebrows, chips and avatar initials. A <p>
    // at 12px is the squinting this pass removed.
    const offenders: string[] = [];
    for (const { name, lines } of templateFiles()) {
      lines.forEach((line, index) => {
        const match = /<p\b[^>]*className="[^"]*\btext-xs\b/.exec(line);
        if (match) offenders.push(`${name}:${index + 1}`);
      });
    }
    expect(offenders, "paragraphs start at text-sm (14px), body copy at text-base").toEqual([]);
  });
});
