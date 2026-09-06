// FIN-002 Phase 1 — optional-fee lifecycle regression tests (pure, no DB).
// Run: npm test
//
// Guards the exact bug that triggered the requirement: an optional fee
// selected for ONE student must NEVER propagate to other students through a
// sync/recalculation — and a removal must persist across syncs.
import { describe, it, expect } from "vitest";
import { resolveBillLines, resolveFeeHeadConfig } from "../billing";
import type { FeeConfig } from "../billing";
import { buildRecalcPlan } from "../recalc";
import type { RecalcInputs } from "../recalc";

const TERM = "t1";
const CLASS = "c1";
const OTHER_CLASS = "c2";
const SECTION = "s1";
const OTHER_SECTION = "s2";
const OPT_HEAD = "h-opt"; // "School Uniform" — optional
const REQ_HEAD = "h-req"; // "Tuition" — required

const feeHeads = new Map([
  [OPT_HEAD, { id: OPT_HEAD, name: "School Uniform" }],
  [REQ_HEAD, { id: REQ_HEAD, name: "Tuition" }],
]);

type TermFeeRow = {
  id: string;
  fee_head_id: string;
  default_amount: number;
  fee_type: string | null;
  academic_section_id: string | null;
  term_id: string | null;
  is_active: boolean | null;
};
type ClassFeeRow = { id: string; term_fee_id: string; class_id: string; amount: number; is_compulsory: boolean | null };
type AdjustmentRow = { student_id?: string | null; class_fee_id?: string | null; term_fee_id?: string | null; is_opted_in?: boolean | null };

function makeConfig(opts: {
  termFees?: TermFeeRow[];
  classFees?: ClassFeeRow[];
  adjustments?: AdjustmentRow[];
  classes?: { id: string; section_id: string | null }[];
}): FeeConfig {
  return {
    termFees: opts.termFees || [],
    classFees: opts.classFees || [],
    adjustments: opts.adjustments || [],
    classes: opts.classes || [
      { id: CLASS, section_id: SECTION },
      { id: OTHER_CLASS, section_id: OTHER_SECTION },
    ],
    feeHeads,
  };
}

// Baseline config: required Tuition for everyone + optional School Uniform.
function baseConfig(adjustments: AdjustmentRow[], classFees: ClassFeeRow[] = []): FeeConfig {
  return makeConfig({
    termFees: [
      { id: "tf-req", fee_head_id: REQ_HEAD, default_amount: 50000, fee_type: "Required", academic_section_id: null, term_id: TERM, is_active: true },
      { id: "tf-opt", fee_head_id: OPT_HEAD, default_amount: 10000, fee_type: "Not Required", academic_section_id: null, term_id: TERM, is_active: true },
    ],
    classFees,
    adjustments,
  });
}

const studentA = { id: "sA", class_id: CLASS };
const studentB = { id: "sB", class_id: CLASS };

const headIds = (lines: { fee_head_id: string }[]): string[] => lines.map((l) => l.fee_head_id);

describe("FIN-002 — optional fees are strictly student-specific", () => {
  it("opt-in via a class override applies to exactly that one student", () => {
    const config = baseConfig(
      [{ student_id: "sA", class_fee_id: "cf-opt", is_opted_in: true }],
      [{ id: "cf-opt", term_fee_id: "tf-opt", class_id: CLASS, amount: 12000, is_compulsory: false }],
    );

    const a = resolveBillLines(config, studentA, TERM);
    const b = resolveBillLines(config, studentB, TERM);

    expect(headIds(a.lines)).toContain(OPT_HEAD);
    const opt = a.lines.find((l) => l.fee_head_id === OPT_HEAD)!;
    expect(opt.amount).toBe(12000); // override amount
    expect(opt.is_compulsory).toBe(false);

    // CRITICAL: Student B must NOT have the fee, even though A opted in.
    expect(headIds(b.lines)).toContain(REQ_HEAD);
    expect(headIds(b.lines)).not.toContain(OPT_HEAD);
  });

  it("opt-in via the term fee row (NO class override) applies to exactly that one student", () => {
    const config = baseConfig([{ student_id: "sA", term_fee_id: "tf-opt", is_opted_in: true }]);

    const a = resolveBillLines(config, studentA, TERM);
    const b = resolveBillLines(config, studentB, TERM);

    expect(headIds(a.lines)).toContain(OPT_HEAD);
    const opt = a.lines.find((l) => l.fee_head_id === OPT_HEAD)!;
    expect(opt.amount).toBe(10000); // term default amount
    expect(headIds(b.lines)).not.toContain(OPT_HEAD);
  });

  it("removal flips the opt-in off, so a sync never resurrects the fee", () => {
    // After removal the adjustment row exists with is_opted_in = false.
    const config = baseConfig([{ student_id: "sA", term_fee_id: "tf-opt", is_opted_in: false }]);

    const a = resolveBillLines(config, studentA, TERM);
    const b = resolveBillLines(config, studentB, TERM);

    expect(headIds(a.lines)).not.toContain(OPT_HEAD);
    expect(headIds(b.lines)).not.toContain(OPT_HEAD);
  });

  it("required fees ignore opt-in state entirely (sync may always propagate them)", () => {
    const config = baseConfig([{ student_id: "sA", term_fee_id: "tf-opt", is_opted_in: false }]);

    const a = resolveBillLines(config, studentA, TERM);
    const b = resolveBillLines(config, studentB, TERM);

    expect(headIds(a.lines)).toContain(REQ_HEAD);
    expect(headIds(b.lines)).toContain(REQ_HEAD);
  });
});

describe("FIN-002 — single head resolution (add/remove routes use the engine)", () => {
  it("ranks a term-scoped row over a legacy template row", () => {
    const config = makeConfig({
      termFees: [
        { id: "tf-template", fee_head_id: OPT_HEAD, default_amount: 40000, fee_type: "Not Required", academic_section_id: null, term_id: null, is_active: true },
        { id: "tf-term", fee_head_id: OPT_HEAD, default_amount: 60000, fee_type: "Not Required", academic_section_id: null, term_id: TERM, is_active: true },
      ],
    });

    const res = resolveFeeHeadConfig(config, studentA, TERM, OPT_HEAD);
    expect(res.term_fee?.id).toBe("tf-term");
    expect(res.amount).toBe(60000);
    expect(res.is_compulsory).toBe(false);
  });

  it("returns the class override amount when one exists", () => {
    const config = makeConfig({
      termFees: [{ id: "tf-opt", fee_head_id: OPT_HEAD, default_amount: 10000, fee_type: "Not Required", academic_section_id: null, term_id: TERM, is_active: true }],
      classFees: [{ id: "cf-opt", term_fee_id: "tf-opt", class_id: CLASS, amount: 15000, is_compulsory: false }],
    });

    const res = resolveFeeHeadConfig(config, studentA, TERM, OPT_HEAD);
    expect(res.class_fee?.id).toBe("cf-opt");
    expect(res.amount).toBe(15000);
  });

  it("flags a required head as not addable per student", () => {
    const config = makeConfig({
      termFees: [{ id: "tf-req", fee_head_id: REQ_HEAD, default_amount: 50000, fee_type: "Required", academic_section_id: null, term_id: TERM, is_active: true }],
    });

    const res = resolveFeeHeadConfig(config, studentA, TERM, REQ_HEAD);
    expect(res.is_compulsory).toBe(true);
    expect(res.amount).toBe(50000);
  });

  it("section-scoped defaults are unavailable outside the section", () => {
    const config = makeConfig({
      termFees: [
        { id: "tf-opt-s1", fee_head_id: OPT_HEAD, default_amount: 8000, fee_type: "Not Required", academic_section_id: SECTION, term_id: TERM, is_active: true },
      ],
    });

    const inSection = resolveFeeHeadConfig(config, studentA, TERM, OPT_HEAD);
    expect(inSection.term_fee?.id).toBe("tf-opt-s1");
    expect(inSection.amount).toBe(8000);

    const outside = resolveFeeHeadConfig(config, { id: "sC", class_id: OTHER_CLASS }, TERM, OPT_HEAD);
    expect(outside.term_fee).toBeNull();
    expect(outside.amount).toBe(0);
  });
});

describe("FIN-002 — a removed fee stays removed through a recalculation (sync)", () => {
  it("a zeroed optional line with no opt-in produces zero changes in the recalc plan", () => {
    const config = baseConfig([]); // nobody opted in
    const inputs: RecalcInputs = {
      termId: TERM,
      bills: [
        {
          id: "b1",
          student_id: "sA",
          class_id: CLASS,
          gross_amount: 50000,
          waiver_amount: 0,
          net_amount: 50000,
          status: "pending",
        },
      ],
      lines: [
        { id: "l-req", bill_id: "b1", fee_head_id: REQ_HEAD, amount: 50000, waived_amount: 0 },
        // The removed optional fee: line kept (zeroed) for allocation history.
        { id: "l-opt-zeroed", bill_id: "b1", fee_head_id: OPT_HEAD, amount: 0, waived_amount: 0 },
      ],
      allocs: [],
      students: new Map([["sA", "Amina"]]),
      classes: new Map([[CLASS, "Basic 1"]]),
      config,
    };

    const plan = buildRecalcPlan(inputs);

    // Required line unchanged, optional line zeroed & not opted in → nothing
    // to do: a sync must NOT resurrect the removed fee or touch the bill.
    expect(plan.bills_affected).toBe(0);
    expect(plan.totals_after).toBe(0);
  });

  it("a classmate's opt-in never leaks into another student's recalc plan", () => {
    // sB has a bill; sA (same class) opted into the optional fee.
    const config = baseConfig([{ student_id: "sA", class_fee_id: "cf-opt", is_opted_in: true }], [
      { id: "cf-opt", term_fee_id: "tf-opt", class_id: CLASS, amount: 10000, is_compulsory: false },
    ]);
    const inputs: RecalcInputs = {
      termId: TERM,
      bills: [
        {
          id: "bB",
          student_id: "sB",
          class_id: CLASS,
          gross_amount: 50000,
          waiver_amount: 0,
          net_amount: 50000,
          status: "pending",
        },
      ],
      lines: [{ id: "l-req-b", bill_id: "bB", fee_head_id: REQ_HEAD, amount: 50000, waived_amount: 0 }],
      allocs: [],
      students: new Map([
        ["sA", "Amina"],
        ["sB", "Blessing"],
      ]),
      classes: new Map([[CLASS, "Basic 1"]]),
      config,
    };

    const plan = buildRecalcPlan(inputs);

    // sA's selection must not add School Uniform to sB's bill on sync.
    expect(plan.bills_affected).toBe(0);
    expect(plan.bills.length).toBe(0);
  });
});
