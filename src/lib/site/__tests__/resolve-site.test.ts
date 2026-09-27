import { describe, it, expect } from "vitest";
import { fakeSupabase, fakeError, fakeOk } from "@/lib/ai/__tests__/fake-supabase";
import { loadFixtureDocument } from "../fixtures/classic.v1.document";
import { resolveSite } from "../load-published";
import { validateDocument } from "../templates/contracts";
import { loadTemplate } from "../templates/registry";

/**
 * The resolver is the entire security boundary of the public website, so these
 * tests are written as the CAUSE MATRIX: every reason a site may be withheld,
 * one test each, plus the projection guarantee that no private column can ride
 * along.
 *
 * The fake client is the AI gateway's (`@/lib/ai/__tests__/fake-supabase`)
 * rather than a second copy — one fake, one set of behaviours to keep honest.
 */

const SCHOOL_ID = "11111111-1111-1111-1111-111111111111";

const schoolRow = (over: Record<string, unknown> = {}) => ({
  id: SCHOOL_ID,
  name: "Test School",
  slug: "test-school",
  motto: "Knowledge and character",
  logo_url: null,
  address: "1 School Road",
  phone: "08012345678",
  email: "info@testschool.example",
  is_active: true,
  is_archived: false,
  ...over,
});

const configRow = (over: Record<string, unknown> = {}) => ({
  template_key: "classic",
  status: "active",
  ...over,
});

type Options = {
  school?: Record<string, unknown> | null;
  schoolError?: string;
  featureEnabled?: boolean;
  entitlementError?: string;
  config?: Record<string, unknown> | null;
  configError?: string;
};

function harness(options: Options = {}) {
  return fakeSupabase({
    select: (spec) => {
      if (spec.table === "schools") {
        if (options.schoolError) return fakeError(options.schoolError);
        return fakeOk(options.school === null ? [] : [options.school ?? schoolRow()]);
      }
      if (spec.table === "school_features") {
        if (options.entitlementError) return fakeError(options.entitlementError);
        return fakeOk(options.featureEnabled === false ? [] : [{ is_enabled: true }]);
      }
      if (spec.table === "website_configs") {
        if (options.configError) return fakeError(options.configError);
        return fakeOk(options.config === null ? [] : [options.config ?? configRow()]);
      }
      return fakeOk([]);
    },
  });
}

describe("resolveSite — the cause matrix", () => {
  it("serves a school that is active, enabled and configured", async () => {
    const { client } = harness();
    const result = await resolveSite("test-school", { supabase: client });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.site.school.name).toBe("Test School");
    expect(result.site.sections.length).toBeGreaterThan(0);
  });

  it("refuses an unknown slug", async () => {
    const { client } = harness({ school: null });
    const result = await resolveSite("no-such-school", { supabase: client });
    expect(result).toEqual({ ok: false, reason: "unknown_school" });
  });

  it("refuses an inactive school", async () => {
    const { client } = harness({ school: schoolRow({ is_active: false }) });
    const result = await resolveSite("test-school", { supabase: client });
    expect(result).toEqual({ ok: false, reason: "school_inactive" });
  });

  it("refuses an ARCHIVED school even though is_active is true", async () => {
    // The pre-existing public endpoint filters is_active only and would serve
    // this school. The Website Engine must not.
    const { client } = harness({
      school: schoolRow({ is_active: true, is_archived: true }),
    });
    const result = await resolveSite("test-school", { supabase: client });
    expect(result).toEqual({ ok: false, reason: "school_archived" });
  });

  it("refuses a school without the website flag (default deny)", async () => {
    const { client } = harness({ featureEnabled: false });
    const result = await resolveSite("test-school", { supabase: client });
    expect(result).toEqual({ ok: false, reason: "feature_disabled" });
  });

  it("refuses — rather than serves — when the entitlement read fails", async () => {
    const { client } = harness({ entitlementError: "permission denied for table school_features" });
    const result = await resolveSite("test-school", { supabase: client });
    expect(result).toEqual({ ok: false, reason: "error" });
  });

  it("refuses a school that has the flag but no configuration row", async () => {
    const { client } = harness({ config: null });
    const result = await resolveSite("test-school", { supabase: client });
    expect(result).toEqual({ ok: false, reason: "not_configured" });
  });

  it("refuses a suspended site", async () => {
    const { client } = harness({ config: configRow({ status: "suspended" }) });
    const result = await resolveSite("test-school", { supabase: client });
    expect(result).toEqual({ ok: false, reason: "suspended" });
  });

  it("refuses a disabled site", async () => {
    const { client } = harness({ config: configRow({ status: "disabled" }) });
    const result = await resolveSite("test-school", { supabase: client });
    expect(result).toEqual({ ok: false, reason: "disabled" });
  });

  it("refuses an unknown template key", async () => {
    const { client } = harness({ config: configRow({ template_key: "does-not-exist" }) });
    const result = await resolveSite("test-school", { supabase: client });
    expect(result).toEqual({ ok: false, reason: "not_configured" });
  });

  it("refuses an unrecognised status rather than assuming it is safe", async () => {
    const { client } = harness({ config: configRow({ status: "something-new" }) });
    const result = await resolveSite("test-school", { supabase: client });
    expect(result).toEqual({ ok: false, reason: "disabled" });
  });

  it("surfaces a database error as a refusal, not an exception", async () => {
    const { client } = harness({ schoolError: "connection reset" });
    await expect(resolveSite("test-school", { supabase: client })).resolves.toEqual({
      ok: false,
      reason: "error",
    });
  });
});

describe("resolveSite — the projection", () => {
  it("returns exactly the whitelisted school fields", async () => {
    const { client } = harness();
    const result = await resolveSite("test-school", { supabase: client });
    if (!result.ok) throw new Error("expected a site");

    expect(Object.keys(result.site.school).sort()).toEqual([
      "address",
      "email",
      "logoUrl",
      "motto",
      "name",
      "phone",
      "slug",
    ]);
  });

  it("never emits the school id or a private column", async () => {
    // The row carries every column the real table carries; the model must not.
    const { client } = harness({
      school: schoolRow({
        grading_scale: { A: 90 },
        currency: "NGN",
        subscription_status: "active",
      }),
    });
    const result = await resolveSite("test-school", { supabase: client });
    if (!result.ok) throw new Error("expected a site");

    const serialised = JSON.stringify(result.site);
    expect(serialised).not.toContain(SCHOOL_ID);
    expect(serialised).not.toContain("grading_scale");
    expect(serialised).not.toContain("subscription_status");
    expect(serialised).not.toContain("NGN");
  });

  it("reads exactly three tables", async () => {
    const fake = harness();
    await resolveSite("test-school", { supabase: fake.client });

    const tables = [...new Set(fake.selects.map((spec) => spec.table))].sort();
    expect(tables).toEqual(["school_features", "schools", "website_configs"]);
  });

  it("checks the entitlement of the school it resolved, by id", async () => {
    const fake = harness();
    await resolveSite("test-school", { supabase: fake.client });

    const entitlementRead = fake.selects.find((spec) => spec.table === "school_features");
    expect(entitlementRead?.filters).toContainEqual(["school_id", SCHOOL_ID]);
    expect(entitlementRead?.filters).toContainEqual(["feature_key", "website"]);
  });
});

describe("resolveSite — the document contract", () => {
  it("refuses a document that fails its section contracts", async () => {
    const { client } = harness();
    const result = await resolveSite("test-school", {
      supabase: client,
      // A hero with no headline or subheadline: exactly the shape a bad CMS
      // write would produce.
      loadDocument: () => ({
        templateKey: "classic",
        templateVersion: "1",
        sections: [{ kind: "hero" }],
      }),
    });
    expect(result).toEqual({ ok: false, reason: "invalid_document" });
  });

  it("refuses when no document can be loaded for the template", async () => {
    const { client } = harness();
    const result = await resolveSite("test-school", {
      supabase: client,
      loadDocument: () => null,
    });
    expect(result).toEqual({ ok: false, reason: "not_configured" });
  });

  it("serves only the fields the contracts declare", async () => {
    const { client } = harness();
    const result = await resolveSite("test-school", {
      supabase: client,
      loadDocument: () => ({
        templateKey: "classic",
        templateVersion: "1",
        sections: [{ kind: "about", heading: "About us", body: "Text", evil: "payload" }],
      }),
    });
    if (!result.ok) throw new Error("expected a site");
    expect(Object.keys(result.site.sections[0]).sort()).toEqual(["body", "heading", "kind"]);
    expect(JSON.stringify(result.site)).not.toContain("evil");
  });
});

describe("template registry", () => {
  it("loads the classic template with its declared section kinds", () => {
    const template = loadTemplate("classic");
    expect(template?.key).toBe("classic");
    expect(template?.version).toBe("1");
    expect(template?.sectionKinds.length).toBe(5);
  });

  it("resolves nothing for an unknown key — including prototype properties", () => {
    expect(loadTemplate("does-not-exist")).toBeNull();
    expect(loadTemplate("")).toBeNull();
    expect(loadTemplate("constructor")).toBeNull();
    expect(loadTemplate("toString")).toBeNull();
  });
});

describe("fixture document (temporary scaffolding)", () => {
  it("is accepted by the contracts its type claims to satisfy", () => {
    expect(validateDocument(loadFixtureDocument("classic")).ok).toBe(true);
  });

  it("resolves nothing for an unknown template", () => {
    expect(loadFixtureDocument("does-not-exist")).toBeNull();
    expect(loadFixtureDocument("")).toBeNull();
  });
});
