import { describe, it, expect } from "vitest";
import { attemptMediaTtlSeconds, questionMediaPath } from "../media";

describe("attemptMediaTtlSeconds", () => {
  const now = new Date("2026-09-30T10:00:00.000Z");

  it("gives an untimed attempt a two-hour window", () => {
    expect(attemptMediaTtlSeconds(null, now)).toBe(2 * 3600);
  });

  it("extends an hour past the attempt's remaining time", () => {
    const expires = new Date("2026-09-30T11:00:00.000Z").toISOString();
    expect(attemptMediaTtlSeconds(expires, now)).toBe(2 * 3600);
  });

  it("caps at twelve hours", () => {
    const expires = new Date("2026-10-01T01:00:00.000Z").toISOString(); // 15h away
    expect(attemptMediaTtlSeconds(expires, now)).toBe(12 * 3600);
  });

  it("never goes below one hour, even for an expired attempt", () => {
    const expires = new Date("2026-09-30T09:00:00.000Z").toISOString();
    expect(attemptMediaTtlSeconds(expires, now)).toBe(3600);
  });
});

describe("questionMediaPath", () => {
  it("namespaces by school and question, and follows the verified extension", () => {
    const path = questionMediaPath("school-1", "question-9", "jpg");
    expect(path.startsWith("school-1/cbt/question-9/")).toBe(true);
    expect(path.endsWith(".jpg")).toBe(true);
    // Random stem, so a replacement upload can never overwrite the old object
    // that attempt snapshots still reference.
    expect(questionMediaPath("school-1", "question-9", "jpg")).not.toBe(path);
  });
});
