import { describe, it, expect } from "vitest";
import { summariseCountsByClass, summariseTerm } from "../aggregates";

/**
 * Counting is where an off-by-one is invisible in production but wrong in every
 * answer, so the arithmetic is pinned here, separately from any database.
 */

describe("summariseCountsByClass", () => {
  const classes = [
    { id: "c1", name: "Basic 1" },
    { id: "c2", name: "Basic 2" },
    { id: "c3", name: "Basic 3" },
  ];

  it("counts each class, biggest first, and keeps empty classes", () => {
    const result = summariseCountsByClass(classes, [
      { class_id: "c1" },
      { class_id: "c1" },
      { class_id: "c1" },
      { class_id: "c2" },
    ]);

    expect(result.total).toBe(4);
    expect(result.classes).toEqual([
      { class_id: "c1", class: "Basic 1", students: 3 },
      { class_id: "c2", class: "Basic 2", students: 1 },
      { class_id: "c3", class: "Basic 3", students: 0 },
    ]);
  });

  it("counts students with no class separately rather than dropping them", () => {
    const result = summariseCountsByClass(classes, [
      { class_id: "c1" },
      { class_id: null },
      { class_id: null },
    ]);

    expect(result.total).toBe(3);
    expect(result.unassigned).toBe(2);
    // The two unassigned students are not attributed to any class row.
    expect(result.classes.find((c) => c.class_id === "c1")?.students).toBe(1);
  });

  it("breaks ties by class name so the answer is stable", () => {
    const result = summariseCountsByClass(
      [
        { id: "z", name: "Zeta" },
        { id: "a", name: "Alpha" },
      ],
      [{ class_id: "z" }, { class_id: "a" }],
    );

    expect(result.classes.map((c) => c.class)).toEqual(["Alpha", "Zeta"]);
  });

  it("reconciles with the rows it was given", () => {
    // This is the property that keeps count_students and count_by_class from
    // disagreeing: the sum of the parts equals the whole.
    const students = [{ class_id: "c1" }, { class_id: "c2" }, { class_id: null }];
    const result = summariseCountsByClass(classes, students);
    const summed =
      result.classes.reduce((sum, row) => sum + row.students, 0) + result.unassigned;

    expect(summed).toBe(result.total);
  });
});

describe("summariseTerm", () => {
  it("maps each status and derives what is ready to publish", () => {
    const result = summariseTerm(
      10,
      [
        { class_id: "c1", status: "published" },
        { class_id: "c2", status: "approved" },
        { class_id: "c3", status: "pending_approval" },
        { class_id: "c4", status: "returned" },
        { class_id: "c5", status: "draft" },
        { class_id: "c6", status: "retracted" },
      ],
      480,
    );

    expect(result.classes).toEqual({
      total: 10,
      with_submission: 6,
      awaiting_review: 1,
      approved: 1,
      published: 1,
      returned: 1,
      retracted: 1,
      not_started: 4,
    });
    expect(result.ready_to_publish).toBe(1);
    expect(result.result_rows).toBe(480);
  });

  it("keeps the LAST status for a class rather than double-counting it", () => {
    const result = summariseTerm(
      1,
      [
        { class_id: "c1", status: "pending_approval" },
        { class_id: "c1", status: "approved" },
      ],
      12,
    );

    expect(result.classes.with_submission).toBe(1);
    expect(result.classes.approved).toBe(1);
    expect(result.classes.awaiting_review).toBe(0);
  });

  it("never reports negative 'not started' classes", () => {
    const result = summariseTerm(
      1,
      [
        { class_id: "c1", status: "approved" },
        { class_id: "c2", status: "approved" },
      ],
      0,
    );

    expect(result.classes.not_started).toBe(0);
    expect(result.classes.with_submission).toBe(2);
  });

  it("treats a term with no results as not ready, whatever the submissions say", () => {
    const result = summariseTerm(3, [], 0);
    expect(result.ready_to_publish).toBe(0);
    expect(result.result_rows).toBe(0);
    expect(result.classes.not_started).toBe(3);
  });
});
