import { describe, it, expect } from "vitest";
import {
  generateCapabilitiesDescription,
  getCapability,
  isHighRisk,
} from "../capability-registry";
import { normaliseSubjectIds } from "../execution-engine";
import { validatePlan } from "../agent-engine";
import type { ExecutionPlan } from "../types";

/**
 * Gwin has to be able to do the class/subject work an admin does by hand:
 * attach subjects to a class, and make a teacher that class's teacher. The
 * capabilities existed but a repeat run failed on a unique key, and a 16-subject
 * class needed 16 separate steps. These pin the contract that makes the plan
 * work first time and stay safe to repeat.
 */

describe("class and subject assignment capabilities", () => {
  it("offers a bulk class-subject step", () => {
    const cap = getCapability("assign_subjects_to_class");
    expect(cap).toBeTruthy();
    expect(cap?.isReadOnly).toBe(false);
    expect(isHighRisk("assign_subjects_to_class")).toBe(false);

    const byName = new Map((cap?.params ?? []).map((p) => [p.name, p]));
    expect(byName.get("class_id")?.required).toBe(true);
    expect(byName.get("subject_ids")?.type).toBe("string[]");
    expect(byName.get("subject_ids")?.required).toBe(true);
  });

  it("advertises it to the model, with the reason to prefer it", () => {
    const description = generateCapabilitiesDescription();
    expect(description).toContain("assign_subjects_to_class");
    expect(description).toContain("assign_subject_to_class");
    expect(description).toContain("assign_teacher_to_class");
    expect(description).toContain("Safe to repeat");
  });

  it("takes a whole class's subject list as one plan step", () => {
    const plan: ExecutionPlan = {
      summary: "Give Year 2 its subjects",
      mode: "operations",
      estimatedOperations: 1,
      steps: [
        {
          order: 1,
          capability: "assign_subjects_to_class",
          description: "Attach 15 subjects to Year 2",
          params: {
            class_id: "11111111-1111-4111-8111-111111111111",
            subject_ids: [
              "22222222-2222-4222-8222-222222222222",
              "33333333-3333-4333-8333-333333333333",
            ],
          },
        },
      ],
    };

    expect(validatePlan(plan)).toEqual({ valid: true, errors: [] });
  });

  it("refuses the bulk step without its subject ids", () => {
    const plan: ExecutionPlan = {
      summary: "Give Year 2 its subjects",
      mode: "operations",
      estimatedOperations: 1,
      steps: [
        {
          order: 1,
          capability: "assign_subjects_to_class",
          description: "Attach subjects",
          params: { class_id: "11111111-1111-4111-8111-111111111111" },
        },
      ],
    };

    const result = validatePlan(plan);
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toContain("subject_ids");
  });
});

describe("normaliseSubjectIds", () => {
  it("keeps the order, trims, and drops duplicates and non-strings", () => {
    expect(
      normaliseSubjectIds([
        "  aaa ",
        "bbb",
        "aaa",
        "",
        null,
        42,
        "ccc",
      ]),
    ).toEqual(["aaa", "bbb", "ccc"]);
  });

  it("returns an empty list for anything that is not an array", () => {
    expect(normaliseSubjectIds(undefined)).toEqual([]);
    expect(normaliseSubjectIds("aaa")).toEqual([]);
    expect(normaliseSubjectIds({ 0: "aaa" })).toEqual([]);
  });
});
