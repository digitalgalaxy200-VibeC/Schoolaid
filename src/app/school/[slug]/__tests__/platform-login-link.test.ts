import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * The "school not found" dead end, and the loop it used to be.
 *
 * On a school's own domain middleware rewrites `/login` to that school's login
 * page — the very page this link sits on. So "Go to the SchoolAid login" must
 * be ABSOLUTE: a relative `/login` would send the visitor in a circle, and the
 * one situation this screen exists for (a domain that resolves to no school)
 * could never reach the platform's login at all.
 *
 * There is no DOM in this test environment, so the page source is the artifact
 * — the same approach the type-scale tests take for the site templates.
 */

const PAGE = path.join(process.cwd(), "src/app/school/[slug]/login/page.tsx");

describe("the school login page's escape hatch", () => {
  it("finds the page it is meant to be checking", () => {
    // A guard on the guard: if the page ever moves, the test below would fail
    // as "not found" rather than pass by checking nothing.
    expect(fs.existsSync(PAGE)).toBe(true);
  });

  it("sends a visitor with no school to the platform login, not back to itself", () => {
    const source = fs.readFileSync(PAGE, "utf8");
    expect(source).toContain("href={PLATFORM_LOGIN_URL}");
    expect(source).not.toContain('href="/login"');
  });
});
