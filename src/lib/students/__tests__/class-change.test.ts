import { describe, it, expect } from "vitest";
import {
  UNKNOWN_CLASS,
  classLabel,
  classSelectionChanged,
  describeClassMove,
  initialClassChoice,
  normaliseClassId,
} from "../class-change";

/**
 * The decisions the student form makes about a class, kept out of the component
 * so they can be tested. The two that matter:
 *
 *   - a class id the school does not list must never be displayed as some other
 *     class, and must never be replaced on a name-only edit;
 *   - confirmation appears ONLY when the choice actually moved.
 */

describe("normaliseClassId", () => {
  it("treats every empty shape as 'not assigned'", () => {
    expect(normaliseClassId(undefined)).toBeNull();
    expect(normaliseClassId(null)).toBeNull();
    expect(normaliseClassId("")).toBeNull();
    expect(normaliseClassId("   ")).toBeNull();
  });

  it("trims a real id", () => {
    expect(normaliseClassId("  class-1  ")).toBe("class-1");
  });
});

describe("initialClassChoice", () => {
  const classes = ["class-1", "class-2"];

  it("keeps a class the school owns", () => {
    expect(initialClassChoice("class-2", classes)).toEqual({ value: "class-2", unknown: false });
  });

  it("treats no class as the empty option", () => {
    expect(initialClassChoice(null, classes)).toEqual({ value: "", unknown: false });
    expect(initialClassChoice("", classes)).toEqual({ value: "", unknown: false });
  });

  it("flags a stored class the school does not list, instead of showing a wrong one", () => {
    // The old behaviour: no <option> matched, so the browser displayed the
    // first class in the list while the form still held the foreign id.
    expect(initialClassChoice("other-school-class", classes)).toEqual({
      value: UNKNOWN_CLASS,
      unknown: true,
    });
  });

  it("does not discard an id just because the class list has not loaded", () => {
    expect(initialClassChoice("class-1", [])).toEqual({ value: "class-1", unknown: false });
  });
});

describe("classSelectionChanged", () => {
  it("is false when only unrelated details are edited", () => {
    // Requirement: a name/phone correction must not ask about the class.
    expect(classSelectionChanged("class-1", "class-1")).toBe(false);
    expect(classSelectionChanged("", "")).toBe(false);
    expect(classSelectionChanged(UNKNOWN_CLASS, UNKNOWN_CLASS)).toBe(false);
  });

  it("is true when the class really moves", () => {
    expect(classSelectionChanged("class-1", "class-2")).toBe(true);
    expect(classSelectionChanged("class-1", "")).toBe(true);
    expect(classSelectionChanged("", "class-1")).toBe(true);
    expect(classSelectionChanged(UNKNOWN_CLASS, "class-1")).toBe(true);
  });
});

describe("describeClassMove", () => {
  it("names the student, where they are and where they are going", () => {
    const message = describeClassMove({
      studentName: "Titi Titi",
      fromLabel: "Basic 1",
      toLabel: "Basic 2",
    });

    expect(message).toContain("Titi Titi");
    expect(message).toContain("from Basic 1");
    expect(message).toContain("to Basic 2");
  });

  it("says that history does not follow the student", () => {
    // This is the sentence the admin actually needs: last term's card stays put.
    const message = describeClassMove({
      studentName: "Titi",
      fromLabel: "Basic 1",
      toLabel: "Basic 2",
    });

    expect(message).toContain("scores, report cards and bills stay recorded");
    expect(message).toContain("does not move or recalculate");
  });

  it("still reads sensibly without a name", () => {
    expect(
      describeClassMove({ studentName: "  ", fromLabel: "Basic 1", toLabel: "Basic 2" }),
    ).toContain("This student from Basic 1");
  });
});

describe("classLabel", () => {
  const names = new Map([["class-1", "Basic 1"]]);

  it("names known classes", () => {
    expect(classLabel("class-1", names)).toBe("Basic 1");
  });

  it("has words for both non-class states", () => {
    expect(classLabel("", names)).toBe("no class");
    expect(classLabel(null, names)).toBe("no class");
    expect(classLabel(UNKNOWN_CLASS, names)).toBe("an unknown class");
  });

  it("never invents a name for an id the map does not have", () => {
    expect(classLabel("class-9", names)).toBe("an unknown class");
  });
});
