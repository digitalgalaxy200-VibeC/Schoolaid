import { describe, expect, it } from "vitest";
import { summariseBills, UNASSIGNED_CLASS_ID } from "../reports";

/**
 * The Finance overview used to compute Expected/Collected/Outstanding in one
 * place and By Class / By Section / By Fee in another. They drifted, so the same
 * screen gave different answers to "how much is still owed".
 *
 * These tests pin the contract a bursar reads:
 *   - the scenario below is the acceptance case from the finance review;
 *   - `total === sum(by class) === sum(by section)` in every case;
 *   - waived money is never outstanding.
 */

const CLASS_JSS1 = "class-jss1";
const SECTION = "section-primary";

const classes = [{ id: CLASS_JSS1, name: "JSS1", section_id: SECTION }];
const sections = [{ id: SECTION, name: "Primary" }];

const bill = (id: string, net: number, classId: string | null = CLASS_JSS1) => ({
  id,
  net_amount: net,
  class_id: classId,
});

function totalsMatch(result: ReturnType<typeof summariseBills>) {
  const sumClasses = (key: "expected" | "collected" | "outstanding") =>
    Math.round(result.classes.reduce((s, c) => s + c[key], 0) * 100) / 100;
  const sumSections = (key: "expected" | "collected" | "outstanding") =>
    Math.round(result.sections.reduce((s, c) => s + c[key], 0) * 100) / 100;

  expect(sumClasses("expected")).toBe(result.expected);
  expect(sumClasses("collected")).toBe(result.collected);
  expect(sumClasses("outstanding")).toBe(result.outstanding);
  expect(sumSections("expected")).toBe(result.expected);
  expect(sumSections("collected")).toBe(result.collected);
  expect(sumSections("outstanding")).toBe(result.outstanding);
}

describe("summariseBills — the acceptance scenario", () => {
  // ₦60,000 Tuition for JSS1, five students, one full payment, one partial ₦25,000.
  const bills = [
    bill("b1", 60000),
    bill("b2", 60000),
    bill("b3", 60000),
    bill("b4", 60000),
    bill("b5", 60000),
  ];
  const paidByBill = new Map([
    ["b1", 60000],
    ["b2", 25000],
  ]);

  const result = summariseBills({
    bills,
    lines: [],
    paidByBill,
    paidByLine: new Map(),
    appliedByBill: new Map(),
    classes,
    sections,
  });

  it("reads Expected 300,000 · Collected 85,000 · Outstanding 215,000 · 28%", () => {
    expect(result.expected).toBe(300000);
    expect(result.collected).toBe(85000);
    expect(result.outstanding).toBe(215000);
    expect(result.rate).toBe(28);
  });

  it("counts one paid, one part-paid and three unpaid", () => {
    expect(result.counts).toEqual({ total: 5, paid: 1, partial: 1, unpaid: 3 });
  });

  it("reconciles total, by class and by section", () => {
    totalsMatch(result);
  });
});

describe("summariseBills — reconciliation invariants", () => {
  it("counts applied credit once, in every view", () => {
    // One student fully covered by credit, one by cash, one not at all.
    const result = summariseBills({
      bills: [bill("b1", 50000), bill("b2", 50000), bill("b3", 50000)],
      lines: [],
      paidByBill: new Map([["b2", 50000]]),
      paidByLine: new Map(),
      appliedByBill: new Map([["b1", 50000]]),
      classes,
      sections,
    });

    expect(result.expected).toBe(150000);
    expect(result.collected).toBe(50000);
    expect(result.applied).toBe(50000);
    // The credit-covered bill owes nothing; the section must agree.
    expect(result.outstanding).toBe(50000);
    expect(result.sections[0].outstanding).toBe(50000);
    expect(result.counts).toEqual({ total: 3, paid: 2, partial: 0, unpaid: 1 });
    totalsMatch(result);
  });

  it("never lets one bill's overpayment cancel another bill's debt", () => {
    const result = summariseBills({
      bills: [bill("b1", 10000), bill("b2", 10000)],
      lines: [],
      paidByBill: new Map([
        ["b1", 20000], // cannot happen via the engine, but the maths must stay sane
      ]),
      paidByLine: new Map(),
      appliedByBill: new Map(),
      classes,
      sections,
    });

    expect(result.outstanding).toBe(10000);
    totalsMatch(result);
  });

  it("keeps bills with no class in an explicit Unassigned bucket", () => {
    const result = summariseBills({
      bills: [bill("b1", 30000), bill("b2", 20000, null), bill("b3", 10000, "deleted-class")],
      lines: [],
      paidByBill: new Map(),
      paidByLine: new Map(),
      appliedByBill: new Map(),
      classes,
      sections,
    });

    const unassigned = result.classes.find((c) => c.id === UNASSIGNED_CLASS_ID);
    expect(unassigned?.student_counts.total).toBe(2);
    expect(result.expected).toBe(60000);
    totalsMatch(result);
  });
});

describe("summariseBills — fee level", () => {
  it("does not report waived money as outstanding", () => {
    const lines = [
      {
        id: "l1",
        bill_id: "b1",
        fee_head_id: "tuition",
        amount: 60000,
        waived_amount: 10000,
        fee_heads: { id: "tuition", name: "Tuition" },
      },
    ];

    const result = summariseBills({
      bills: [bill("b1", 50000)],
      lines,
      paidByBill: new Map([["b1", 50000]]),
      paidByLine: new Map([["l1", 50000]]),
      appliedByBill: new Map(),
      classes,
      sections,
    });

    expect(result.fee_breakdown).toEqual([
      { fee_head_id: "tuition", fee_name: "Tuition", expected: 50000, collected: 50000, outstanding: 0 },
    ]);
    expect(result.outstanding).toBe(0);
    totalsMatch(result);
  });

  it("splits several fee heads into one row each", () => {
    const lines = [
      { id: "l1", bill_id: "b1", fee_head_id: "tuition", amount: 40000, waived_amount: 0, fee_heads: { id: "tuition", name: "Tuition" } },
      { id: "l2", bill_id: "b1", fee_head_id: "bus", amount: 20000, waived_amount: 0, fee_heads: [{ id: "bus", name: "School Bus" }] },
    ];

    const result = summariseBills({
      bills: [bill("b1", 60000)],
      lines,
      paidByBill: new Map([["b1", 40000]]),
      paidByLine: new Map([
        ["l1", 40000],
        ["l2", 0],
      ]),
      appliedByBill: new Map(),
      classes,
      sections,
    });

    expect(result.fee_breakdown.map((f) => [f.fee_name, f.outstanding])).toEqual([
      ["Tuition", 0],
      ["School Bus", 20000],
    ]);
  });
});
