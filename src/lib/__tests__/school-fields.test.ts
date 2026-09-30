import { describe, it, expect } from "vitest";
import { SCHOOL_ADMIN_WRITABLE, pickWritableSchoolFields } from "../school-fields";

/**
 * The rule this file guards: a school admin's own browser round-trips the WHOLE
 * school row (`select("*")` on the profile screen), so the request body always
 * contains columns the school must not be able to change. These tests are mostly
 * about that round-trip, because that is the shape the real client sends.
 */
describe("pickWritableSchoolFields", () => {
  it("keeps the fields a school legitimately edits", () => {
    const updates = pickWritableSchoolFields({
      name: "Eagles Academy",
      phone: "0803 000 0000",
      motto: "Knowledge and light",
    });

    expect(updates).toEqual({
      name: "Eagles Academy",
      phone: "0803 000 0000",
      motto: "Knowledge and light",
    });
  });

  it("drops every column a school must not control", () => {
    // Exactly what the profile screen PUTs back, plus the fields that would be an
    // escalation if they survived.
    const wholeRow = {
      id: "11111111-1111-1111-1111-111111111111",
      name: "Eagles Academy",
      slug: "eagles",
      is_active: false,
      is_archived: true,
      subscription_status: "suspended",
      subscription_plan: "premium",
      subscription_expiry: "2030-01-01T00:00:00.000Z",
      created_at: "2020-01-01T00:00:00.000Z",
      updated_at: "2020-01-01T00:00:00.000Z",
    };

    const updates = pickWritableSchoolFields(wholeRow);

    // Precondition: the input really did carry those columns, so the assertions
    // below are about filtering rather than about a body that never had them.
    expect(Object.keys(wholeRow)).toContain("subscription_status");
    expect(Object.keys(updates)).toEqual(["name"]);
    expect(updates).not.toHaveProperty("is_active");
    expect(updates).not.toHaveProperty("is_archived");
    expect(updates).not.toHaveProperty("subscription_status");
    expect(updates).not.toHaveProperty("slug");
    expect(updates).not.toHaveProperty("id");
  });

  it("passes null and empty values through, so a field can still be cleared", () => {
    const updates = pickWritableSchoolFields({ logo_url: null, phone: "", website: null });
    expect(updates).toEqual({ logo_url: null, phone: "", website: null });
  });

  it("returns nothing for a body that is not an object", () => {
    expect(pickWritableSchoolFields(null)).toEqual({});
    expect(pickWritableSchoolFields(undefined)).toEqual({});
    expect(pickWritableSchoolFields("name=X")).toEqual({});
    expect(pickWritableSchoolFields([])).toEqual({});
  });

  it("returns nothing for an empty body — the route turns that into a 400", () => {
    expect(pickWritableSchoolFields({})).toEqual({});
    expect(pickWritableSchoolFields({ is_active: true })).toEqual({});
  });

  it("never grows a dangerous field without this test failing", () => {
    // The allow-list is the whole security boundary for this route, so it is
    // asserted directly rather than only through its behaviour.
    for (const forbidden of [
      "id",
      "slug",
      "is_active",
      "is_archived",
      "subscription_status",
      "subscription_plan",
      "subscription_expiry",
      "created_at",
      "updated_at",
    ]) {
      expect(SCHOOL_ADMIN_WRITABLE as readonly string[]).not.toContain(forbidden);
    }
  });
});
