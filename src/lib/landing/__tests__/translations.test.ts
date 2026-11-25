import { describe, expect, it } from "vitest";
import { TRANSLATIONS } from "../translations";

/**
 * The landing page switches between English and French at runtime. A missing key
 * does not throw — it renders `undefined` into the page — so parity is checked
 * here rather than discovered by a visitor.
 */

type Dict = Record<string, unknown>;

function flatten(value: unknown, prefix = ""): string[] {
  if (value === null || typeof value !== "object") return prefix ? [prefix] : [];
  const out: string[] = [];
  for (const [key, child] of Object.entries(value as Dict)) {
    out.push(...flatten(child, prefix ? `${prefix}.${key}` : key));
  }
  return out;
}

function get(source: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => (acc as Dict)?.[key], source);
}

describe("landing translations", () => {
  const en = flatten(TRANSLATIONS.en).sort();
  const fr = flatten(TRANSLATIONS.fr).sort();

  it("has exactly the same keys in English and French", () => {
    const missingInFr = en.filter((k) => !fr.includes(k));
    const extraInFr = fr.filter((k) => !en.includes(k));
    expect({ missingInFr, extraInFr }).toEqual({ missingInFr: [], extraInFr: [] });
  });

  it("has no empty strings", () => {
    const blanks = fr.filter((path) => {
      const value = get(TRANSLATIONS.fr, path);
      return typeof value === "string" && value.trim() === "";
    });
    expect(blanks).toEqual([]);
  });

  it("actually translates: nearly every French string differs", () => {
    const identical = en.filter((path) => {
      const a = get(TRANSLATIONS.en, path);
      const b = get(TRANSLATIONS.fr, path);
      return typeof a === "string" && typeof b === "string" && a === b;
    });
    // Brand names, "FAQ", numerals and similar are legitimately shared; most
    // strings must not be.
    expect(identical.length).toBeLessThanOrEqual(Math.ceil(en.length * 0.1));
  });
});
