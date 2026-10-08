import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * "Powered by SchoolAid" is how the platform is found: it sits on every school
 * website, and it was a bare <span> — the name parents and teachers read most
 * often led nowhere. It is now a link to the platform landing page, and these
 * tests keep it that way.
 *
 * There is no DOM in this test environment, so the template source IS the
 * artifact being tested — the same approach the type-scale tests take for the
 * classic template. The URL's own safety (https, on a platform host, never a
 * school's) is asserted separately in `src/lib/site/__tests__/hosts.test.ts`.
 */

const FOOTER = path.join(
  process.cwd(),
  "src/components/site/templates/classic/Footer.tsx",
);

describe("the school website footer's SchoolAid attribution", () => {
  it("finds the footer it is meant to be checking", () => {
    // A guard on the guard: if the template ever moves, the test below would
    // fail as "not found" rather than pass by checking nothing.
    expect(fs.existsSync(FOOTER)).toBe(true);
  });

  it("links the attribution to the platform landing page, not a dead span", () => {
    const source = fs.readFileSync(FOOTER, "utf8");
    expect(source).toContain("href={PLATFORM_LANDING_URL}");
  });
});
