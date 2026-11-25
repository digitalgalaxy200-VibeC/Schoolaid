import { describe, expect, it } from "vitest";
import { computeArrears } from "../arrears";

/**
 * Arrears are DERIVED, never copied onto the new bill. These tests pin the two
 * things that matter: only strictly earlier terms count, and the figure is the
 * same arithmetic a bursar reads on the old bills (net − paid − credit applied).
 */

const TERMS = new Map([
  ["t-old", "2025-09-01"],
  ["t-mid", "2026-01-10"],
  ["t-now", "2026-09-14"],
  ["t-next", "2027-01-10"],
]);

const NAMES = new Map([
  ["t-old", "First Term 2025/26"],
  ["t-mid", "Second Term 2025/26"],
  ["t-now", "First Term 2026/27"],
  ["t-next", "Second Term 2026/27"],
]);

describe("computeArrears", () => {
  it("adds what is left on earlier bills and ignores the current and later terms", () => {
    const result = computeArrears({
      currentTermId: "t-now",
      termStart: TERMS,
      termName: NAMES,
      bills: [
        { id: "b1", student_id: "s1", term_id: "t-old", net_amount: 50000 },
        { id: "b2", student_id: "s1", term_id: "t-mid", net_amount: 60000 },
        { id: "b3", student_id: "s1", term_id: "t-now", net_amount: 60000 },
        { id: "b4", student_id: "s1", term_id: "t-next", net_amount: 60000 },
      ],
      paidByBill: new Map([
        ["b1", 50000], // settled
        ["b2", 20000], // 40,000 owed
        ["b3", 10000], // current term — not arrears
      ]),
      appliedByBill: new Map(),
    });

    expect(result.amount).toBe(40000);
    expect(result.byStudent.get("s1")).toBe(40000);
    expect(result.byBill.has("b2")).toBe(true);
    expect(result.byBill.has("b1")).toBe(false);
    expect(result.byTerm.map((t) => t.term_id)).toEqual(["t-mid"]);
  });

  it("counts applied credit, so a credit-covered old bill is not arrears", () => {
    const result = computeArrears({
      currentTermId: "t-now",
      termStart: TERMS,
      bills: [{ id: "b1", student_id: "s1", term_id: "t-mid", net_amount: 30000 }],
      paidByBill: new Map([["b1", 10000]]),
      appliedByBill: new Map([["b1", 20000]]),
    });
    expect(result.amount).toBe(0);
  });

  it("reports each student separately", () => {
    const result = computeArrears({
      currentTermId: "t-now",
      termStart: TERMS,
      bills: [
        { id: "b1", student_id: "s1", term_id: "t-old", net_amount: 10000 },
        { id: "b2", student_id: "s2", term_id: "t-old", net_amount: 10000 },
        { id: "b3", student_id: "s2", term_id: "t-mid", net_amount: 5000 },
      ],
      paidByBill: new Map([["b2", 10000]]),
      appliedByBill: new Map(),
    });
    expect(result.byStudent.get("s1")).toBe(10000);
    expect(result.byStudent.get("s2")).toBe(5000);
    expect(result.amount).toBe(15000);
  });

  it("orders terms oldest first so the year is obvious", () => {
    const result = computeArrears({
      currentTermId: "t-now",
      termStart: TERMS,
      termName: NAMES,
      bills: [
        { id: "b1", student_id: "s1", term_id: "t-mid", net_amount: 1000 },
        { id: "b2", student_id: "s1", term_id: "t-old", net_amount: 2000 },
      ],
      paidByBill: new Map(),
      appliedByBill: new Map(),
    });
    expect(result.byTerm.map((t) => t.name)).toEqual(["First Term 2025/26", "Second Term 2025/26"]);
    expect(result.amount).toBe(3000);
  });

  it("reports nothing when the current term's dates are unknown", () => {
    const result = computeArrears({
      currentTermId: "missing",
      termStart: TERMS,
      bills: [{ id: "b1", student_id: "s1", term_id: "t-old", net_amount: 1000 }],
      paidByBill: new Map(),
      appliedByBill: new Map(),
    });
    expect(result.amount).toBe(0);
  });
});
