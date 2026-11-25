import { describe, expect, it } from "vitest";
import { versionLabel, APP_VERSION } from "@/lib/version";

describe("versionLabel", () => {
  it("renders the version once, with a single v", () => {
    expect(versionLabel()).toBe("SchoolAid v2.0");
  });

  it("does not repeat the v that APP_VERSION already carries", () => {
    // The school-admin footer used to render `v{APP_VERSION}` while the
    // constant was already "v2.0", which shipped "SchoolAid vv2.0".
    expect(versionLabel()).not.toMatch(/vv/i);
    expect(APP_VERSION).toMatch(/^v?\d/);
  });
});
