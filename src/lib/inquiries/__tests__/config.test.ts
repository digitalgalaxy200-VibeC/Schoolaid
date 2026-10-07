import { describe, expect, it } from "vitest";
import { parseInquiry } from "../config";

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
