import { describe, it, expect } from "vitest";
import { schoolUpdateFrom } from "../school-update";

/**
 * `update_school` used to accept `subscription_status` — the exact field its own
 * description told the model never to change — while ignoring the email/phone/
 * address it promised. These tests pin the allow-list in both directions.
 */
describe("schoolUpdateFrom", () => {
  it("keeps the declared fields, trimmed", () => {
    expect(
      schoolUpdateFrom({ name: "  Grace Academy ", email: "info@grace.edu", phone: "0803", address: "12 Road" }),
    ).toEqual({ name: "Grace Academy", email: "info@grace.edu", phone: "0803", address: "12 Road" });
  });

  it("accepts the second phone number the website's Call Us card renders", () => {
    expect(
      schoolUpdateFrom({ phone: "09011526026", phone_secondary: "08033742717" }),
    ).toEqual({ phone: "09011526026", phone_secondary: "08033742717" });
  });

  it("never lets subscription_status through, even when asked", () => {
    expect(schoolUpdateFrom({ name: "Grace", subscription_status: "active" })).toEqual({ name: "Grace" });
    expect(schoolUpdateFrom({ subscription_status: "suspended" })).toEqual({});
  });

  it("drops unknown fields and empty values", () => {
    expect(
      schoolUpdateFrom({ name: "", email: "   ", motto: "Knowledge", is_archived: true, logo_url: "x.png" }),
    ).toEqual({});
  });

  it("ignores non-string values", () => {
    expect(schoolUpdateFrom({ name: 42, email: null, phone: ["0803"] })).toEqual({});
  });
});
