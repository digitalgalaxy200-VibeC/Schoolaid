import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { findPortalSchool } from "../portal-school";

/**
 * The portal login's school lookup. It decides two things a person can see: whose
 * logo appears on the sign-in page, and whether the page exists at all. An
 * archived school must lose its login the same way it loses its website.
 */

type School = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  motto: string | null;
  is_active: boolean;
  is_archived: boolean;
};

const school = (over: Partial<School> = {}): School => ({
  id: "11111111-1111-4111-8111-111111111111",
  name: "Eagles Academy",
  slug: "eagles",
  logo_url: "https://cdn.example/logo.png",
  motto: "Soar",
  is_active: true,
  is_archived: false,
  ...over,
});

/** A fake client that answers the three reads this lookup performs. */
function fakeClient(opts: {
  schools?: School[];
  domainSchoolId?: string | null;
  theme?: unknown;
  fail?: "schools" | "config";
}): SupabaseClient {
  const rows = opts.schools ?? [];

  const client = {
    from(table: string) {
      const filters: Record<string, unknown> = {};
      let selected = "";
      const builder = {
        select: (columns: string) => {
          selected = columns;
          return builder;
        },
        eq: (column: string, value: unknown) => {
          filters[column] = value;
          return builder;
        },
        maybeSingle: async () => {
          if (opts.fail === "schools" && table === "schools") {
            return { data: null, error: { message: "boom" } };
          }
          if (opts.fail === "config" && table === "website_configs") {
            return { data: null, error: { message: "boom" } };
          }
          if (table === "schools") {
            const found = rows.find(
              (row) =>
                ("slug" in filters && row.slug === filters.slug) ||
                ("id" in filters && row.id === filters.id),
            );
            return { data: found ?? null, error: null };
          }
          // website_configs — the domain query filters on custom_domain; the
          // palette query selects `theme`. Answer for the query, not for luck.
          if (selected.includes("custom_domain") || "custom_domain" in filters) {
            return {
              data: opts.domainSchoolId ? { school_id: opts.domainSchoolId } : null,
              error: null,
            };
          }
          return { data: { theme: opts.theme ?? {} }, error: null };
        },
      };
      return builder;
    },
  };

  return client as unknown as SupabaseClient;
}

describe("findPortalSchool", () => {
  it("finds a school by its slug", async () => {
    const found = await findPortalSchool("eagles", { supabase: fakeClient({ schools: [school()] }) });
    expect(found?.name).toBe("Eagles Academy");
    expect(found?.logoUrl).toBe("https://cdn.example/logo.png");
  });

  it("finds a school by the domain it pointed at us", async () => {
    const id = "11111111-1111-4111-8111-111111111111";
    const found = await findPortalSchool("eaglesacademy.com", {
      supabase: fakeClient({ schools: [school()], domainSchoolId: id }),
    });
    expect(found?.slug).toBe("eagles");
  });

  it("refuses an archived school — its portal goes dark with its website", async () => {
    const found = await findPortalSchool("eagles", {
      supabase: fakeClient({ schools: [school({ is_archived: true })] }),
    });
    expect(found).toBeNull();
  });

  it("refuses an inactive school", async () => {
    const found = await findPortalSchool("eagles", {
      supabase: fakeClient({ schools: [school({ is_active: false })] }),
    });
    expect(found).toBeNull();
  });

  it("answers null for a host nobody owns", async () => {
    const found = await findPortalSchool("stranger.example", {
      supabase: fakeClient({ schools: [school()] }),
    });
    expect(found).toBeNull();
  });

  it("still gives a login when the palette cannot be read", async () => {
    // Branding is optional; a login that cannot be styled is still a login.
    const found = await findPortalSchool("eagles", {
      supabase: fakeClient({ schools: [school()], fail: "config" }),
    });
    expect(found?.name).toBe("Eagles Academy");
    expect(found?.palette.id).toBe("cobalt");
  });

  it("uses the school's chosen palette when there is one", async () => {
    const found = await findPortalSchool("eagles", {
      supabase: fakeClient({ schools: [school()], theme: { palette: "forest" } }),
    });
    expect(found?.palette.id).toBe("forest");
  });

  it("answers null rather than throwing when the lookup fails", async () => {
    const found = await findPortalSchool("eagles", {
      supabase: fakeClient({ schools: [school()], fail: "schools" }),
    });
    expect(found).toBeNull();
  });

  it("ignores an empty identifier", async () => {
    expect(await findPortalSchool("   ", { supabase: fakeClient({}) })).toBeNull();
  });
});
