import { describe, expect, it } from "vitest";
import { buildPreview, planRunItems, validateMappings } from "../plan";
import type { PromotionClass, SavedMapping, StudentForPreview } from "../types";

const AP = "11111111-1111-1111-1111-111111111111";
const B1 = "22222222-2222-2222-2222-222222222222";
const B2 = "33333333-3333-3333-3333-333333333333";
const B3 = "44444444-4444-4444-4444-444444444444";

const classes: PromotionClass[] = [
  { id: AP, name: "Basic 1", student_count: 3 },
  { id: B1, name: "Basic 2", student_count: 0 },
  { id: B2, name: "Basic 3", student_count: 0 },
  { id: B3, name: "Basic 4", student_count: 0 },
];

function student(over: Partial<StudentForPreview> & { id: string }): StudentForPreview {
  return {
    admission_no: "ADM-1",
    name: "Student",
    class_id: B1,
    status: "active",
    is_active: true,
    ...over,
  };
}

describe("validateMappings", () => {
  it("rejects an empty configuration", () => {
    expect(validateMappings([], classes)).toHaveLength(1);
  });

  it("rejects mapping a class to itself", () => {
    const errors = validateMappings(
      [{ source_class_id: B1, action: "promote", destination_class_id: B1 }],
      classes,
    );
    expect(errors.join(" ")).toMatch(/cannot be promoted to itself/i);
  });

  it("rejects a destination from another school", () => {
    const errors = validateMappings(
      [{ source_class_id: B1, action: "promote", destination_class_id: "99999999-9999-9999-9999-999999999999" }],
      classes,
    );
    expect(errors.join(" ")).toMatch(/does not belong to this school/i);
  });

  it("rejects two destinations for one source class", () => {
    const errors = validateMappings(
      [
        { source_class_id: B1, action: "promote", destination_class_id: B2 },
        { source_class_id: B1, action: "promote", destination_class_id: B3 },
      ],
      classes,
    );
    expect(errors.join(" ")).toMatch(/more than one destination/i);
  });

  it("rejects a graduate mapping that also names a destination", () => {
    const errors = validateMappings(
      [{ source_class_id: B1, action: "graduate", destination_class_id: B2 }],
      classes,
    );
    expect(errors.join(" ")).toMatch(/also has a destination/i);
  });

  it("accepts a valid promote + graduate configuration", () => {
    const errors = validateMappings(
      [
        { source_class_id: AP, action: "promote", destination_class_id: B1 },
        { source_class_id: B1, action: "promote", destination_class_id: B2 },
        { source_class_id: B2, action: "graduate", destination_class_id: null },
      ],
      classes,
    );
    expect(errors).toEqual([]);
  });
});

describe("buildPreview", () => {
  it("separates promotable, graduating, flagged and unassigned students", () => {
    const mappings: Pick<SavedMapping, "source_class_id" | "destination_class_id" | "action">[] = [
      { source_class_id: B1, destination_class_id: B2, action: "promote" },
      { source_class_id: B2, destination_class_id: null, action: "graduate" },
    ];

    const preview = buildPreview({
      classes,
      mappings,
      students: [
        student({ id: "s1", class_id: B1, name: "Amina" }),
        student({ id: "s2", class_id: B1, name: "Withdrawn One", status: "withdrawn" }),
        student({ id: "s3", class_id: B1, name: "Archived One", is_active: false }),
        student({ id: "s4", class_id: B2, name: "Graduating One" }),
        student({ id: "s5", class_id: B2, name: "Already Done", status: "graduated" }),
        student({ id: "s6", class_id: null, name: "Unassigned One" }),
      ],
    });

    expect(preview.totals.promoted).toBe(1);
    expect(preview.totals.graduated).toBe(1);
    expect(preview.totals.flagged).toBe(3); // withdrawn + archived + already graduated
    expect(preview.unassigned.map((s) => s.id)).toEqual(["s6"]);

    const fromB1 = preview.groups.find((g) => g.source_class_id === B1);
    expect(fromB1?.students.map((s) => s.id)).toEqual(["s1"]);
    expect(fromB1?.destination_class_name).toBe("Basic 3");

    const fromB2 = preview.groups.find((g) => g.source_class_id === B2);
    expect(fromB2?.action).toBe("graduate");
    expect(fromB2?.students.map((s) => s.id)).toEqual(["s4"]);
  });

  it("lists classes that are not part of the configuration", () => {
    const preview = buildPreview({
      classes,
      mappings: [{ source_class_id: B1, destination_class_id: B2, action: "promote" }],
      students: [],
    });
    expect(preview.unconfigured_classes.map((c) => c.id).sort()).toEqual(
      [AP, B2, B3].sort(),
    );
  });
});

describe("planRunItems", () => {
  it("freezes the source and destination per student", () => {
    const preview = buildPreview({
      classes,
      mappings: [
        { source_class_id: B1, destination_class_id: B2, action: "promote" },
        { source_class_id: B2, destination_class_id: null, action: "graduate" },
      ],
      students: [
        student({ id: "s1", class_id: B1 }),
        student({ id: "s2", class_id: B2 }),
      ],
    });

    const items = planRunItems(preview);
    expect(items).toEqual(
      expect.arrayContaining([
        { student_id: "s1", from_class_id: B1, to_class_id: B2, action: "promote" },
        { student_id: "s2", from_class_id: B2, to_class_id: null, action: "graduate" },
      ]),
    );
  });
});
