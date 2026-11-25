import { describe, expect, it } from "vitest";
import { COUNTED_SETUP_STEPS, SETUP_STEPS, TOTAL_SETUP_STEPS, isCounted } from "../setup";

/**
 * The guide reported 7/11 to a school that had done all the real work, because
 * three of the eleven steps are reading and the currency step could never pass
 * for a Nigerian school (`currency !== "NGN"`). These tests pin the counted set.
 */
describe("Finance setup guide", () => {
  it("counts configuration work only", () => {
    expect(SETUP_STEPS).toHaveLength(11);
    expect(TOTAL_SETUP_STEPS).toBe(8);
    expect(COUNTED_SETUP_STEPS.map((s) => s.key)).toEqual([
      "fee_heads",
      "amounts",
      "optional_fees",
      "currency",
      "accounts",
      "bills",
      "review_bill",
      "test_payment",
    ]);
  });

  it("keeps the reading steps in the guide but out of the count", () => {
    for (const key of ["intro", "dashboard", "daily_routine"]) {
      const def = SETUP_STEPS.find((s) => s.key === key);
      expect(def).toBeDefined();
      expect(isCounted(def!)).toBe(false);
    }
  });

  it("cannot mark an auto-detected step done by hand", () => {
    const feeHeads = SETUP_STEPS.find((s) => s.key === "fee_heads");
    expect(feeHeads?.kind).toBe("auto");
    expect(isCounted(feeHeads!)).toBe(true);
  });
});
