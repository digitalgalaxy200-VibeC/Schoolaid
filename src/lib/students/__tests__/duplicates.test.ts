import { describe, it, expect } from "vitest";
import {
  describeMatch,
  findPossibleDuplicates,
  nameTokens,
  normalizePhone,
  sameStudentName,
  type DuplicateSearchInput,
} from "../duplicates";

const input = (over: Partial<DuplicateSearchInput> = {}): DuplicateSearchInput => ({
  school_id: "school-1",
  class_id: "class-basic-3",
  first_name: "John",
  middle_name: null,
  last_name: "Doe",
  date_of_birth: null,
  parent_phone: null,
  student_id: null,
  ...over,
});

const candidate = (over: Record<string, unknown> = {}) => ({
  id: "student-1",
  student_id: "ADM-0001",
  class_id: "class-basic-3",
  first_name: "John",
  middle_name: null,
  last_name: "Doe",
  full_name: "John Doe",
  date_of_birth: null,
  parent_phone: null,
  is_active: false,
  ...over,
});

describe("nameTokens", () => {
  it("normalises case, punctuation and titles", () => {
    expect(nameTokens({ first_name: "JOHN", last_name: "Doe-Smith" })).toEqual([
      "john",
      "doe",
      "smith",
    ]);
    expect(nameTokens({ full_name: "Mr. John  Doe" })).toEqual(["john", "doe"]);
  });
});

describe("sameStudentName", () => {
  it("matches the same first and last name", () => {
    expect(
      sameStudentName({ first_name: "John", last_name: "Doe" }, { first_name: "john", last_name: "doe" }),
    ).toBe(true);
  });

  it("ignores a middle name and word order", () => {
    expect(
      sameStudentName(
        { first_name: "John", middle_name: "Michael", last_name: "Doe" },
        { first_name: "John", last_name: "Doe" },
      ),
    ).toBe(true);
    expect(
      sameStudentName({ first_name: "John", last_name: "Doe" }, { full_name: "Doe John" }),
    ).toBe(true);
  });

  it("does not treat a shared first name as the same person", () => {
    expect(
      sameStudentName({ first_name: "John", last_name: "Doe" }, { first_name: "John", last_name: "Smith" }),
    ).toBe(false);
  });
});

describe("normalizePhone", () => {
  it("compares the local tail of international numbers", () => {
    expect(normalizePhone("+234 803 123 4567")).toBe("8031234567");
    expect(normalizePhone("0803 123 4567")).toBe("8031234567");
    expect(normalizePhone("")).toBe("");
  });
});

describe("describeMatch", () => {
  it("is a strong match when the name and class agree", () => {
    const result = describeMatch(input(), candidate());
    expect(result).not.toBeNull();
    expect(result?.signals).toEqual(["same_name", "same_class"]);
    expect(result?.confidence).toBe("high");
  });

  it("is a strong match when the name and date of birth agree", () => {
    const result = describeMatch(
      input({ class_id: "class-basic-4", date_of_birth: "2015-04-01" }),
      candidate({ class_id: "class-basic-3", date_of_birth: "2015-04-01" }),
    );
    expect(result?.confidence).toBe("high");
    expect(result?.signals).toContain("same_dob");
  });

  it("is only a name match when nothing else identifies the child", () => {
    const result = describeMatch(
      input({ class_id: "class-basic-4" }),
      candidate({ class_id: "class-basic-3" }),
    );
    expect(result?.confidence).toBe("low");
    expect(result?.signals).toEqual(["same_name"]);
  });

  it("raises confidence when the parent phone also agrees", () => {
    const result = describeMatch(
      input({ class_id: "class-basic-4", parent_phone: "0803 123 4567" }),
      candidate({ class_id: "class-basic-3", parent_phone: "+2348031234567" }),
    );
    expect(result?.confidence).toBe("medium");
  });

  it("matches a different name only on an admission number", () => {
    expect(
      describeMatch(input({ student_id: "adm-0001" }), candidate({ first_name: "Jane" })),
    ).not.toBeNull();
    expect(
      describeMatch(input({ student_id: "ADM-9999" }), candidate({ first_name: "Jane" })),
    ).toBeNull();
  });

  it("returns null for an unrelated student", () => {
    expect(
      describeMatch(input(), candidate({ first_name: "Peter", last_name: "Okoye", student_id: "ADM-9" })),
    ).toBeNull();
  });
});

describe("findPossibleDuplicates", () => {
  type Row = Record<string, unknown>;

  function fakeDb(rows: Row[]) {
    const builder = {
      select: () => builder,
      eq: () => builder,
      ilike: (column: string, pattern: string) => {
        const token = pattern.replace(/%/g, "").toLowerCase();
        return {
          limit: async () => ({
            data: rows.filter((row) => {
              const profile = row.profiles as { full_name?: string | null } | null;
              const haystack =
                column === "profiles.full_name"
                  ? profile?.full_name || ""
                  : String(row[column] || "");
              return haystack.toLowerCase().includes(token);
            }),
            error: null,
          }),
        };
      },
    };
    return { from: () => builder } as unknown as Parameters<
      typeof findPossibleDuplicates
    >[0];
  }

  it("returns archived matches from the same class with restore permission", async () => {
    const db = fakeDb([
      {
        id: "s1",
        student_id: "ADM-0001",
        class_id: "class-basic-3",
        first_name: "John",
        middle_name: null,
        last_name: "Doe",
        date_of_birth: "2015-04-01",
        gender: "male",
        parent_phone: null,
        profiles: { full_name: "John Doe", email: "johndoe@sch.com", is_active: false },
        classes: { name: "Basic 3" },
      },
    ]);

    const matches = await findPossibleDuplicates(db, input());
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      id: "s1",
      full_name: "John Doe",
      class_name: "Basic 3",
      archived: true,
      can_restore: true,
      confidence: "high",
    });
  });

  it("does not let a teacher restore an archived record from another class", async () => {
    const db = fakeDb([
      {
        id: "s2",
        student_id: "ADM-0002",
        class_id: "class-basic-5",
        first_name: "John",
        middle_name: null,
        last_name: "Doe",
        date_of_birth: null,
        gender: null,
        parent_phone: null,
        profiles: { full_name: "John Doe", email: null, is_active: false },
        classes: { name: "Basic 5" },
      },
    ]);

    const matches = await findPossibleDuplicates(db, input());
    expect(matches).toHaveLength(1);
    expect(matches[0].archived).toBe(true);
    expect(matches[0].can_restore).toBe(false);
  });

  it("keeps two same-named children distinguishable when identifiers differ", async () => {
    const db = fakeDb([
      {
        id: "s3",
        student_id: "ADM-0003",
        class_id: "class-basic-4",
        first_name: "John",
        middle_name: null,
        last_name: "Doe",
        date_of_birth: "2016-01-01",
        gender: null,
        parent_phone: "08030000000",
        profiles: { full_name: "John Doe", email: null, is_active: true },
        classes: { name: "Basic 4" },
      },
    ]);

    const matches = await findPossibleDuplicates(
      db,
      input({ date_of_birth: "2014-09-09", parent_phone: "08031111111" }),
    );
    // The teacher is still warned, but with only the name as evidence.
    expect(matches).toHaveLength(1);
    expect(matches[0].confidence).toBe("low");
    expect(matches[0].signals).toEqual(["same_name"]);
  });
});
