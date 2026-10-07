import { describe, it, expect } from "vitest";
import { scalarOutputs } from "../outputs";

/**
 * The receipt is where a generated password is handed over, so what this helper
 * surfaces (and what it hides) is load-bearing: a create step's scalars must
 * come through, and a read step's array of rows must not flood the report.
 */
describe("scalarOutputs", () => {
  it("surfaces flat scalars, including a one-time password", () => {
    expect(
      scalarOutputs({ id: "s-1", email: "ada@tst.com", password: "TST12345678", student_id: "ADM-1" }),
    ).toEqual([
      { key: "id", value: "s-1" },
      { key: "email", value: "ada@tst.com" },
      { key: "password", value: "TST12345678" },
      { key: "student_id", value: "ADM-1" },
    ]);
  });

  it("skips nulls, nested objects and booleans are kept as text", () => {
    expect(scalarOutputs({ a: null, b: undefined, c: { deep: 1 }, d: ["x"], ok: true })).toEqual([
      { key: "ok", value: "true" },
    ]);
  });

  it("returns nothing for a read step's array of rows", () => {
    expect(scalarOutputs([{ id: "1" }, { id: "2" }])).toEqual([]);
    expect(scalarOutputs(null)).toEqual([]);
    expect(scalarOutputs("text")).toEqual([]);
  });

  it("caps the number of surfaced values", () => {
    const wide: Record<string, unknown> = {};
    for (let i = 0; i < 30; i++) wide[`k${i}`] = i;
    expect(scalarOutputs(wide).length).toBe(12);
    expect(scalarOutputs(wide, 3).length).toBe(3);
  });
});
