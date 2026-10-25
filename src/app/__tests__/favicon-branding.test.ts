import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The platform must not own the tab icon of a school's website.
 *
 * Next injects a `<link rel="icon">` for an icon file placed next to the root
 * layout — on every page of the app, with no way for a page to opt out. When
 * `src/app/favicon.ico` existed, a school's own domain therefore advertised
 * SchoolAid's mark alongside (and on some browsers instead of) the school's logo,
 * which is exactly the leak the Website Engine's branding work exists to stop.
 *
 * The rule, then, is structural: the platform's icon is declared in the root
 * layout's metadata, and no file-convention icon may sit in the app directory.
 * That is what this test pins — adding such a file is a silent, invisible change,
 * and this failure is the only place it would be noticed before a school
 * reported it.
 */

const APP_DIR = fileURLToPath(new URL("..", import.meta.url));
const PUBLIC_DIR = fileURLToPath(new URL("../../../public", import.meta.url));

/** The filenames Next treats as file-convention icons. */
const FILE_CONVENTION_ICONS = [
  "favicon.ico",
  "icon.png",
  "icon.jpg",
  "icon.jpeg",
  "icon.svg",
  "apple-icon.png",
  "apple-icon.jpg",
  "apple-icon.jpeg",
];

describe("the platform's favicon", () => {
  it("is not a file-convention icon, so it cannot appear on a school's page", () => {
    for (const name of FILE_CONVENTION_ICONS) {
      expect(existsSync(join(APP_DIR, name)), `src/app/${name} must not exist`).toBe(false);
    }
  });

  it("still answers /favicon.ico as a plain static file", () => {
    // A browser that ignores the declared icons asks this address directly, and
    // the middleware passes platform hosts through to the static file.
    expect(existsSync(join(PUBLIC_DIR, "favicon.ico"))).toBe(true);
  });
});
