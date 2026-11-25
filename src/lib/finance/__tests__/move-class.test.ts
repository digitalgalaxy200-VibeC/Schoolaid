import { describe, expect, it } from "vitest";
import { buildRecalcPlan } from "../recalc";
import type { FeeConfig } from "../billing";

/**
 * "Move this bill to another class" relies on one property of the planner: it
 * resolves fees from `bill.class_id`, not from the student's current class. That
 * is what makes a single-bill reprice possible without a second engine.
 *
 * These tests pin that property, so a future "improvement" that reads the
 * student's class instead cannot silently reprice the wrong bill.
 */

const TERM = "term-1";
const HEAD = "head-tuition";
const TERM_FEE = "tf-1";
const CLASS_A = "class-a";
const CLASS_B = "class-b";
const CLASS_C = "class-c";

const config: FeeConfig = {
  termFees: [
    {
      id: TERM_FEE,
      fee_head_id: HEAD,
      default_amount: 50000,
      fee_type: "Required",
      academic_section_id: null,
      term_id: TERM,
      is_active: true,
    },
  ],
  classFees: [
    { id: "cf-b", term_fee_id: TERM_FEE, class_id: CLASS_B, amount: 60000, is_compulsory: true },
    { id: "cf-c", term_fee_id: TERM_FEE, class_id: CLASS_C, amount: 50000, is_compulsory: true },
  ],
  adjustments: [],
  classes: [
    { id: CLASS_A, section_id: null },
    { id: CLASS_B, section_id: null },
    { id: CLASS_C, section_id: null },
  ],
  feeHeads: new Map([[HEAD, { id: HEAD, name: "Tuition" }]]),
};

const bill = {
  id: "bill-1",
  student_id: "student-1",
  class_id: CLASS_A,
  gross_amount: 50000,
  waiver_amount: 0,
  net_amount: 50000,
  status: "pending",
};

const line = { id: "line-1", bill_id: "bill-1", fee_head_id: HEAD, amount: 50000, waived_amount: 0 };

describe("moving a bill to another class", () => {
  it("reprices at the new class's amount", () => {
    const plan = buildRecalcPlan({
      termId: TERM,
      bills: [{ ...bill, class_id: CLASS_B }],
      lines: [line],
      allocs: [],
      students: new Map([["student-1", "Amina"]]),
      classes: new Map([
        [CLASS_A, "Basic 1"],
        [CLASS_B, "Basic 2"],
      ]),
      config,
    });

    expect(plan.bills_affected).toBe(1);
    expect(plan.bills[0].gross_before).toBe(50000);
    expect(plan.bills[0].gross_after).toBe(60000);
    expect(plan.bills[0].changes[0]).toMatchObject({ before: 50000, after: 60000, overflow: 0 });
  });

  it("finds nothing to do when the new class costs the same", () => {
    const plan = buildRecalcPlan({
      termId: TERM,
      bills: [{ ...bill, class_id: CLASS_C }],
      lines: [line],
      allocs: [],
      students: new Map([["student-1", "Amina"]]),
      classes: new Map([
        [CLASS_A, "Basic 1"],
        [CLASS_C, "Basic 3"],
      ]),
      config,
    });

    expect(plan.bills_affected).toBe(0);
  });

  it("turns money already paid above the new price into credit, never a negative balance", () => {
    // Moved to a CHEAPER class after paying the old price.
    const plan = buildRecalcPlan({
      termId: TERM,
      bills: [{ ...bill, class_id: CLASS_A, net_amount: 50000 }],
      lines: [{ ...line, amount: 50000 }],
      allocs: [{ id: "alloc-1", bill_line_id: "line-1", payment_id: "pay-1", amount: 50000 }],
      students: new Map([["student-1", "Amina"]]),
      classes: new Map([[CLASS_A, "Basic 1"]]),
      config: {
        ...config,
        classFees: [
          { id: "cf-a-cheap", term_fee_id: TERM_FEE, class_id: CLASS_A, amount: 40000, is_compulsory: true },
        ],
      },
    });

    expect(plan.bills_affected).toBe(1);
    expect(plan.bills[0].gross_after).toBe(40000);
    expect(plan.overflow_total).toBe(10000);
    expect(plan.bills[0].changes[0].overflow).toBe(10000);
  });
});
