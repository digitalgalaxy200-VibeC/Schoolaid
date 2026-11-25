import { describe, expect, it } from "vitest";
import {
  DEFAULT_INQUIRY_SOURCE,
  INQUIRY_SOURCES,
  inquirySourceLabel,
  parseInquiry,
  parseInquirySource,
} from "../config";

/**
 * The public application.
 *
 * A partnership is a conversation, so the contract is deliberate: a submission
 * must identify the school and a way to reach it. These tests pin that contract —
 * loosening it back to name-and-email-only would let a school submit an
 * application nobody can follow up.
 */
const valid = {
  full_name: "Ada Obi",
  email: "Ada@School.NG",
  school_name: "Greenfield Academy",
  phone: "+2348012345678",
};

describe("parseInquiry", () => {
  it("accepts the minimum and lowercases the email", () => {
    const { value, errors } = parseInquiry(valid);
    expect(errors.ok).toBe(true);
    expect(value).toMatchObject({
      full_name: "Ada Obi",
      email: "ada@school.ng",
      school_name: "Greenfield Academy",
      phone: "+2348012345678",
      role: null,
    });
  });

  it("requires name, email, school and a reachable number", () => {
    const { value, errors } = parseInquiry({});
    expect(value).toBeNull();
    expect(errors.list.map((e) => e.field).sort()).toEqual([
      "email",
      "full_name",
      "phone",
      "school_name",
    ]);
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
    expect(Object.keys(value!).sort()).toEqual([
      "email",
      "full_name",
      "message",
      "phone",
      "role",
      "school_name",
      "school_size",
    ]);
  });

  it("caps the message length", () => {
    const { errors } = parseInquiry({ ...valid, message: "x".repeat(1001) });
    expect(errors.list[0].field).toBe("message");
  });
});

/**
 * `source` is a free-text column written by a public endpoint. The whitelist is
 * what keeps the dashboard's "Applications by source" panel honest: it can only
 * ever display a channel we defined, never a string someone posted.
 */
describe("parseInquirySource", () => {
  it("accepts every declared channel, whatever the casing", () => {
    for (const source of INQUIRY_SOURCES) {
      expect(parseInquirySource(source)).toBe(source);
      expect(parseInquirySource(source.toUpperCase())).toBe(source);
      expect(parseInquirySource(`  ${source}  `)).toBe(source);
    }
  });

  it("falls back to the default for anything else", () => {
    for (const bad of [undefined, null, "", "  ", 42, {}, [], "<script>", "landing; drop table", "campaign-2024"]) {
      expect(parseInquirySource(bad)).toBe(DEFAULT_INQUIRY_SOURCE);
    }
  });

  it("never returns a value outside the list", () => {
    expect(INQUIRY_SOURCES).toContain(DEFAULT_INQUIRY_SOURCE);
  });
});

describe("inquirySourceLabel", () => {
  it("names each channel", () => {
    expect(inquirySourceLabel("landing")).toBe("Website");
    expect(inquirySourceLabel("whatsapp")).toBe("WhatsApp");
    expect(inquirySourceLabel("referral")).toBe("Referral");
    expect(inquirySourceLabel("affiliate")).toBe("Affiliate");
  });

  it("does not echo an unknown stored value", () => {
    expect(inquirySourceLabel("<img src=x onerror=alert(1)>")).toBe("Other");
    expect(inquirySourceLabel(null)).toBe("Not recorded");
    expect(inquirySourceLabel(undefined)).toBe("Not recorded");
  });
});
