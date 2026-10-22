import { describe, expect, it } from "vitest";
import { INQUIRY_SIZES, INQUIRY_SIZE_LABELS, parseInquiry } from "../config";

const valid = { full_name: "Ada Obi", email: "Ada@School.NG" };

describe("parseInquiry", () => {
  it("accepts the minimum and lowercases the email", () => {
    const { value, errors } = parseInquiry(valid);
    expect(errors.ok).toBe(true);
    expect(value).toMatchObject({ full_name: "Ada Obi", email: "ada@school.ng", phone: null, role: null });
  });

  it("requires name and email", () => {
    const { value, errors } = parseInquiry({});
    expect(value).toBeNull();
    expect(errors.list.map((e) => e.field).sort()).toEqual(["email", "full_name"]);
  });

  it("rejects a malformed email and phone", () => {
    const { errors } = parseInquiry({ ...valid, email: "not-an-email", phone: "abc" });
    expect(errors.list.map((e) => e.field).sort()).toEqual(["email", "phone"]);
  });

  it("rejects values outside the allowed role and size lists", () => {
    const { errors } = parseInquiry({ ...valid, role: "hacker", school_size: "huge" });
    expect(errors.list.map((e) => e.field).sort()).toEqual(["role", "school_size"]);
  });

  it("drops undeclared fields so status/admin_notes cannot be injected", () => {
    const { value } = parseInquiry({ ...valid, status: "closed", admin_notes: "x", id: "1" });
    expect(Object.keys(value!).sort()).toEqual(
      ["email", "full_name", "message", "phone", "role", "school_name", "school_size"],
    );
  });

  it("caps the message length", () => {
    const { errors } = parseInquiry({ ...valid, message: "x".repeat(1001) });
    expect(errors.list[0].field).toBe("message");
  });
});

describe("school size options", () => {
  it("offers seven buckets, each with a label", () => {
    expect(INQUIRY_SIZES).toHaveLength(7);
    for (const size of INQUIRY_SIZES) {
      expect(INQUIRY_SIZE_LABELS[size]).toBeTruthy();
    }
  });

  it("still labels retired buckets that older rows hold", () => {
    expect(INQUIRY_SIZE_LABELS.over_700).toBe("Over 700 students");
    expect(INQUIRY_SIZE_LABELS["300_700"]).toBe("300 – 700 students");
  });

  it("will not accept a retired bucket from a new submission", () => {
    const { errors } = parseInquiry({ ...valid, school_size: "over_700" });
    expect(errors.list.map((e) => e.field)).toEqual(["school_size"]);
  });

  it("accepts the new top buckets", () => {
    for (const size of ["700_1000", "1000_2000", "over_2000"] as const) {
      const { value, errors } = parseInquiry({ ...valid, school_size: size });
      expect(errors.ok).toBe(true);
      expect(value?.school_size).toBe(size);
    }
  });
});
