import { describe, it, expect } from "vitest";
import { planScorePush, type OfficialResult } from "../integration";

const result = (over: Partial<OfficialResult> = {}): OfficialResult => ({
  studentId: "s-1",
  attemptId: "att-1",
  attemptNumber: 1,
  totalScore: 24,
  ...over,
});

describe("planScorePush", () => {
  it("writes a score when nothing is in the way", () => {
    const plan = planScorePush({
      componentMaximum: 30,
      results: [result()],
      existingScores: [],
      overwriteManual: false,
    });

    expect(plan.hasConflicts).toBe(false);
    expect(plan.entries).toEqual([
      { kind: "write", studentId: "s-1", attemptId: "att-1", score: 24, replacing: false },
    ]);
  });

  it("plans one write per student", () => {
    const plan = planScorePush({
      componentMaximum: 30,
      results: [
        result({ studentId: "s-1", attemptId: "a1", totalScore: 24 }),
        result({ studentId: "s-2", attemptId: "a2", totalScore: 18 }),
        result({ studentId: "s-3", attemptId: "a3", totalScore: 30 }),
      ],
      existingScores: [],
      overwriteManual: false,
    });
    expect(plan.entries).toHaveLength(3);
    expect(plan.hasConflicts).toBe(false);
  });

  it("refuses a score above the component maximum rather than corrupting the report card", () => {
    const plan = planScorePush({
      componentMaximum: 30,
      results: [result({ totalScore: 35 })],
      existingScores: [],
      overwriteManual: false,
    });

    expect(plan.hasConflicts).toBe(true);
    const entry = plan.entries[0];
    expect(entry.kind).toBe("conflict");
    expect(entry.kind === "conflict" && entry.reason).toMatch(/more than the component's maximum of 30/);
  });

  it("accepts a score exactly at the maximum", () => {
    const plan = planScorePush({
      componentMaximum: 30,
      results: [result({ totalScore: 30 })],
      existingScores: [],
      overwriteManual: false,
    });
    expect(plan.hasConflicts).toBe(false);
  });

  it("treats an unknown component maximum as no cap", () => {
    const plan = planScorePush({
      componentMaximum: null,
      results: [result({ totalScore: 999 })],
      existingScores: [],
      overwriteManual: false,
    });
    expect(plan.hasConflicts).toBe(false);
  });

  it("conflicts with an existing MANUAL score instead of overwriting a teacher's work", () => {
    const plan = planScorePush({
      componentMaximum: 30,
      results: [result()],
      existingScores: [{ student_id: "s-1", score: 20, managed_by_cbt: false }],
      overwriteManual: false,
    });

    expect(plan.hasConflicts).toBe(true);
    const entry = plan.entries[0];
    expect(entry.kind === "conflict" && entry.reason).toMatch(/manually entered score of 20/);
  });

  it("overwrites an existing MANUAL score only when explicitly told to", () => {
    const plan = planScorePush({
      componentMaximum: 30,
      results: [result()],
      existingScores: [{ student_id: "s-1", score: 20, managed_by_cbt: false }],
      overwriteManual: true,
    });

    expect(plan.hasConflicts).toBe(false);
    expect(plan.entries[0]).toEqual({
      kind: "write",
      studentId: "s-1",
      attemptId: "att-1",
      score: 24,
      replacing: true,
    });
  });

  it("replaces its own earlier CBT score without needing permission", () => {
    // The same component source re-running: this is a correction flow, not a
    // clash between two sources.
    const plan = planScorePush({
      componentMaximum: 30,
      results: [result()],
      existingScores: [{ student_id: "s-1", score: 20, managed_by_cbt: true }],
      overwriteManual: false,
    });

    expect(plan.hasConflicts).toBe(false);
    expect(plan.entries[0].kind === "write" && plan.entries[0].replacing).toBe(true);
  });

  it("reports a maximum conflict even when overwriteManual is set", () => {
    const plan = planScorePush({
      componentMaximum: 30,
      results: [result({ totalScore: 40 })],
      existingScores: [{ student_id: "s-1", score: 20, managed_by_cbt: true }],
      overwriteManual: true,
    });
    expect(plan.hasConflicts).toBe(true);
  });

  it("keeps clean students out of the conflict list", () => {
    const plan = planScorePush({
      componentMaximum: 30,
      results: [
        result({ studentId: "s-1", attemptId: "a1" }),
        result({ studentId: "s-2", attemptId: "a2" }),
      ],
      existingScores: [{ student_id: "s-2", score: 10, managed_by_cbt: false }],
      overwriteManual: false,
    });

    const writes = plan.entries.filter((e) => e.kind === "write");
    const conflicts = plan.entries.filter((e) => e.kind === "conflict");
    expect(writes).toHaveLength(1);
    expect(writes[0].kind === "write" && writes[0].studentId).toBe("s-1");
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].kind === "conflict" && conflicts[0].studentId).toBe("s-2");
  });

  it("plans nothing for an empty result set", () => {
    const plan = planScorePush({
      componentMaximum: 30,
      results: [],
      existingScores: [],
      overwriteManual: false,
    });
    expect(plan.entries).toEqual([]);
    expect(plan.hasConflicts).toBe(false);
  });
});
