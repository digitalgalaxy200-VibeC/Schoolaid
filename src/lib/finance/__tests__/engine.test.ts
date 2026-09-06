// Engine tests — canonical financial scenarios, pure (no DB).
// Run: npm test
import { describe, it, expect } from "vitest";
import { buildRecalcPlan, deriveStatusAfter } from "../recalc";
import type { RecalcInputs } from "../recalc";
import { buildSectionSummaries, deriveBillStatus } from "../reports";
import { paymentOutcome, termStatus } from "../workspace";
import type { FeeConfig } from "../billing";

const CLASS = "c1";
const STUDENT = "s1";
const BILL = "b1";
const HEAD = "h1";
const LINE = "l1";
const TERM = "t1";

function makeConfig(configuredAmount: number): FeeConfig {
  return {
    termFees: [
      {
        id: "tf1",
        fee_head_id: HEAD,
        default_amount: configuredAmount,
        fee_type: "Required",
        academic_section_id: null,
        term_id: null,
        is_active: true,
      },
    ],
    classFees: [],
    adjustments: [],
    classes: [{ id: CLASS, section_id: null }],
    feeHeads: new Map([[HEAD, { id: HEAD, name: "Tuition" }]]),
  };
}

function makeInputs(storedAmount: number, configuredAmount: number, paid: number, waiver = 0): RecalcInputs {
  return {
    termId: TERM,
    bills: [
      {
        id: BILL,
        student_id: STUDENT,
        class_id: CLASS,
        gross_amount: storedAmount,
        waiver_amount: waiver,
        net_amount: Math.max(0, storedAmount - waiver),
        status: "partial",
      },
    ],
    lines: [{ id: LINE, bill_id: BILL, fee_head_id: HEAD, amount: storedAmount, waived_amount: 0 }],
    allocs: paid > 0 ? [{ id: "a1", bill_line_id: LINE, payment_id: "p1", amount: paid }] : [],
    students: new Map([[STUDENT, "Amina"]]),
    classes: new Map([[CLASS, "Basic 1"]]),
    config: makeConfig(configuredAmount),
  };
}

describe("canonical scenarios (fee change → recalc plan)", () => {
  it("A — normal payment: bill already matches config → nothing to change", () => {
    const plan = buildRecalcPlan(makeInputs(50000, 50000, 30000));
    expect(plan.bills_affected).toBe(0);
    expect(plan.overflow_total).toBe(0);
  });

  it("B — fee increased 50k→60k with 30k paid: outstanding grows, no credit", () => {
    const plan = buildRecalcPlan(makeInputs(50000, 60000, 30000));
    expect(plan.bills_affected).toBe(1);
    expect(plan.totals_before).toBe(50000);
    expect(plan.totals_after).toBe(60000);
    expect(plan.difference).toBe(10000);
    expect(plan.overflow_total).toBe(0);
    expect(plan.bills[0].changes[0]).toMatchObject({ before: 50000, after: 60000, overflow: 0 });
  });

  it("C — fee decreased 50k→40k with 30k paid: owes 10k, NO credit", () => {
    const plan = buildRecalcPlan(makeInputs(50000, 40000, 30000));
    expect(plan.totals_after).toBe(40000);
    expect(plan.overflow_total).toBe(0);
    expect(plan.bills[0].net_after).toBe(40000);
  });

  it("D — fee decreased 50k→40k with 50k paid: 10k excess becomes credit, never negative", () => {
    const plan = buildRecalcPlan(makeInputs(50000, 40000, 50000));
    expect(plan.overflow_total).toBe(10000);
    expect(plan.overflow_students).toBe(1);
    const change = plan.bills[0].changes[0];
    expect(change.overflow).toBe(10000);
    expect(plan.bills[0].net_after).toBe(40000);
    expect(deriveStatusAfter(plan.bills[0].net_after, 40000)).toBe("paid");
  });

  it("E — fee removed after full payment: payment intact, full amount becomes credit", () => {
    const plan = buildRecalcPlan(makeInputs(20000, 0, 20000));
    expect(plan.bills_affected).toBe(1);
    const change = plan.bills[0].changes[0];
    expect(change).toMatchObject({ before: 20000, after: 0, overflow: 20000 });
  });

  it("F — class context preserved: resolution uses bill class, promotion irrelevant", () => {
    // Student is now in another class; bill carries class c1 and must use c1's config.
    const inputs = makeInputs(50000, 55000, 0);
    inputs.classes.set("c2", "Basic 2"); // promoted class exists
    inputs.bills[0].class_id = CLASS; // bill snapshot remains c1
    const plan = buildRecalcPlan(inputs);
    expect(plan.bills_affected).toBe(1);
    expect(plan.bills[0].class_name).toBe("Basic 1");
    expect(plan.bills[0].changes[0].after).toBe(55000);
  });

  it("G — term isolation: term row wins over legacy null-term template", () => {
    const config: FeeConfig = {
      termFees: [
        { id: "tf-template", fee_head_id: HEAD, default_amount: 40000, fee_type: "Required", academic_section_id: null, term_id: null, is_active: true },
        { id: "tf-term", fee_head_id: HEAD, default_amount: 60000, fee_type: "Required", academic_section_id: null, term_id: TERM, is_active: true },
      ],
      classFees: [],
      adjustments: [],
      classes: [{ id: CLASS, section_id: null }],
      feeHeads: new Map([[HEAD, { id: HEAD, name: "Tuition" }]]),
    };
    const inputs = makeInputs(50000, 0, 0);
    inputs.config = config;
    const plan = buildRecalcPlan(inputs);
    // Term 1 bills resolve to ₦60,000 (term row), not the ₦40,000 template.
    expect(plan.bills[0].changes[0].after).toBe(60000);
  });

  it("H — status derivation never yields negative coverage states", () => {
    expect(deriveStatusAfter(0, 0)).toBe("pending");
    expect(deriveStatusAfter(100, 100)).toBe("paid");
    expect(deriveStatusAfter(100, 40)).toBe("partial");
    expect(deriveStatusAfter(100, 150)).toBe("paid"); // excess handled as credit elsewhere
  });
});

describe("workspace payment math (AC-05 → AC-14 case study)", () => {
  it("Amina: required ₦65k + optional School Bus ₦20k → expected ₦85k", () => {
    expect(65000 + 20000).toBe(85000);
    expect(termStatus(85000, 0, 0)).toBe("NOT PAID");
  });

  it("Payment 1 ₦10,000 → paid 10k, balance 75k, PARTIALLY PAID", () => {
    const o = paymentOutcome(85000, 0, 0, 10000);
    expect(o.appliedToBill).toBe(10000);
    expect(o.excess).toBe(0);
    expect(o.totalPaidAtIssue).toBe(10000);
    expect(o.balanceAfter).toBe(75000);
    expect(termStatus(85000, 10000, 0)).toBe("PARTIALLY PAID");
  });

  it("Payment 2 ₦15,000 → current payment stays 15k; cumulative 25k; balance 60k", () => {
    const o = paymentOutcome(85000, 10000, 0, 15000);
    expect(o.totalPaidAtIssue).toBe(25000);
    // the receipt's "previous paid" context = cumulative minus THIS payment
    expect(o.totalPaidAtIssue - 15000).toBe(10000);
    expect(o.balanceAfter).toBe(60000);
    expect(o.excess).toBe(0);
  });

  it("Payment 3 ₦60,000 → balance ₦0, status PAID; three transactions stay separate", () => {
    const o = paymentOutcome(85000, 25000, 0, 60000);
    expect(o.totalPaidAtIssue).toBe(85000);
    expect(o.balanceAfter).toBe(0);
    expect(o.excess).toBe(0);
    expect(termStatus(85000, 85000, 0)).toBe("PAID");
    // independence of each receipt's current amount
    expect([10000, 15000, 60000].reduce((a, b) => a + b, 0)).toBe(85000);
  });

  it("Overpayment beyond balance becomes credit (never negative outstanding)", () => {
    const o = paymentOutcome(40000, 0, 0, 50000);
    expect(o.appliedToBill).toBe(40000);
    expect(o.excess).toBe(10000);
    expect(o.balanceAfter).toBe(0);
    expect(termStatus(40000, 40000, 0)).toBe("PAID");
  });

  it("Applied credit is honoured in the outcome (credit reduces what is owed)", () => {
    const o = paymentOutcome(40000, 30000, 5000, 30000);
    expect(o.outstandingBefore).toBe(5000);
    expect(o.appliedToBill).toBe(5000);
    expect(o.excess).toBe(25000);
    expect(o.balanceAfter).toBe(0);
  });

  it("termStatus edges", () => {
    expect(termStatus(0, 0, 0)).toBe("COMPLETED");
    expect(termStatus(50000, 50000, 0)).toBe("PAID");
    expect(termStatus(50000, 20000, 0)).toBe("PARTIALLY PAID");
    expect(termStatus(50000, 0, 20000)).toBe("PARTIALLY PAID");
    expect(termStatus(50000, 0, 0)).toBe("NOT PAID");
  });
});

describe("parity — section summaries agree with per-bill derivation", () => {
  it("outstanding = net − payments − applied credits; collected = payments only", () => {
    const bills = [
      { id: "b1", net_amount: 60000, class_id: CLASS },
      { id: "b2", net_amount: 40000, class_id: CLASS },
    ];
    const paidByBill = new Map([
      ["b1", 20000],
      ["b2", 0],
    ]);
    const appliedByBill = new Map([["b2", 10000]]);
    const { classes } = buildSectionSummaries(bills, paidByBill, [{ id: CLASS, name: "Basic 1", section_id: null }], [], appliedByBill);
    expect(classes).toHaveLength(1);
    const c = classes[0];
    expect(c.collected).toBe(20000); // cash only
    expect(c.outstanding).toBe(70000);
    expect(deriveBillStatus(60000, 20000)).toBe("partial");
    expect(deriveBillStatus(40000, 10000)).toBe("partial");
    expect(c.student_counts).toMatchObject({ total: 2, partial: 2, paid: 0, unpaid: 0 });
  });
});
