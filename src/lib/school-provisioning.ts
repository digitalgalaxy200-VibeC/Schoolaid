import { SupabaseClient } from "@supabase/supabase-js";
import { PLATFORM_DEFAULTS } from "./school-defaults";
import { generateUniquePassword } from "./password";

export class SchoolProvisioningError extends Error {
  constructor(
    message: string,
    readonly kind: "school" | "admin_auth" | "admin_record",
  ) {
    super(message);
    this.name = "SchoolProvisioningError";
  }
}

/**
 * The school abbreviation used in generated usernames (e.g. `ada@gra.com`).
 * One word → its first three letters; several words → their initials.
 */
export function schoolAbbreviationFrom(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  if (words.length === 1) return words[0].substring(0, 3).toLowerCase();
  return words.map((w) => w[0].toLowerCase()).join("");
}

export type ProvisionedAdmin = { email: string; password: string };

/**
 * Creates (or refreshes) the initial school-admin account for ONE school.
 * Shared by the bulk-provision screen and the Super Admin Copilot so the two
 * can never drift apart.
 *
 * Idempotent for an existing auth user: the account is found by email and its
 * password re-issued, rather than a second auth user being created or the
 * step silently doing nothing.
 */
export async function provisionAdminForSchool(
  supabase: SupabaseClient,
  school: { id: string; name: string; slug: string },
): Promise<ProvisionedAdmin> {
  const adminEmail = `admin@${school.slug}.edu`;
  const adminPassword = await generateUniquePassword(supabase, "school_admin", school.slug);

  let authUserId: string | null = null;
  const { data: createData, error: createError } = await supabase.auth.admin.createUser({
    email: adminEmail,
    password: adminPassword,
    email_confirm: true,
  });

  if (createData?.user?.id) {
    authUserId = createData.user.id;
  } else {
    // The email may already exist (e.g. a half-provisioned school). Re-issue
    // the password on the existing account instead of failing.
    const { data: listData } = await supabase.auth.admin.listUsers();
    const existing = listData?.users?.find((u) => u.email === adminEmail);
    if (existing) {
      authUserId = existing.id;
      await supabase.auth.admin.updateUserById(authUserId, { password: adminPassword });
    }
  }

  if (!authUserId) {
    throw new SchoolProvisioningError(
      `Failed to create admin user: ${createError?.message || "Unknown error"}`,
      "admin_auth",
    );
  }

  const { error: profileError } = await supabase.from("profiles").upsert(
    {
      id: authUserId,
      email: adminEmail,
      full_name: `${school.name} Admin`,
      role: "school_admin",
      school_id: school.id,
    },
    { onConflict: "id" },
  );
  if (profileError) {
    throw new SchoolProvisioningError(
      `Failed to create the admin profile: ${profileError.message}`,
      "admin_record",
    );
  }

  const { error: insertError } = await supabase.from("school_admins").insert({
    school_id: school.id,
    profile_id: authUserId,
    first_name: "School",
    last_name: "Admin",
    generated_password: adminPassword,
    must_change_password: true,
  });

  if (insertError) {
    if (insertError.code === "23505") {
      // Unique violation: the admin row already exists — refresh its password.
      await supabase
        .from("school_admins")
        .update({ generated_password: adminPassword, must_change_password: true })
        .eq("profile_id", authUserId);
    } else {
      throw new SchoolProvisioningError(
        `Failed to create the admin record: ${insertError.message}`,
        "admin_record",
      );
    }
  }

  return { email: adminEmail, password: adminPassword };
}

export type CreatedSchool = {
  school: Record<string, unknown>;
  adminEmail: string;
  adminPassword: string;
};

/**
 * Creates a school the way the platform actually defines one: the row, its
 * subscription, and its first admin account. The Super Admin "Add School"
 * screen and the Copilot's create_school both call THIS, which is the point —
 * a school created by either path is the same school.
 *
 * Defaults (components, grading, traits) are provisioned fire-and-forget for
 * the screen, exactly as before; `waitForDefaults` makes the Copilot await them
 * so a later step can rely on them existing.
 */
export async function createSchoolWithAdmin(
  supabase: SupabaseClient,
  input: {
    name: string;
    slug: string;
    email: string;
    motto?: string | null;
    address?: string | null;
    phone?: string | null;
    website?: string | null;
  },
  options?: { waitForDefaults?: boolean },
): Promise<CreatedSchool> {
  const { name, slug, email, motto, address, phone, website } = input;
  const abbreviation = schoolAbbreviationFrom(name);

  const { data: school, error } = await supabase
    .from("schools")
    .insert({
      name,
      slug,
      motto,
      address,
      phone,
      email,
      website,
      subscription_status: "inactive",
      abbreviation,
    })
    .select()
    .single();

  if (error) throw new SchoolProvisioningError(error.message, "school");

  const { error: subError } = await supabase
    .from("subscriptions")
    .insert({ school_id: school.id, plan: "free", status: "inactive" });
  if (subError) {
    throw new SchoolProvisioningError(
      `School created, but the subscription row failed: ${subError.message}`,
      "school",
    );
  }

  const admin = await provisionAdminForSchool(supabase, { id: school.id, name, slug });

  if (options?.waitForDefaults) {
    await provisionSchoolDefaults(supabase, school.id);
  } else {
    provisionSchoolDefaults(supabase, school.id).catch((err) => {
      console.error("Failed to provision defaults for school:", school.id, err);
    });
  }

  return { school, adminEmail: admin.email, adminPassword: admin.password };
}

/**
 * Provisions a newly created school with the canonical Platform Defaults
 * for Assessment Components, Grading, Psychomotor, and Affective traits.
 */
export async function provisionSchoolDefaults(
  supabase: SupabaseClient,
  schoolId: string
): Promise<void> {
  // 1. Provision Assessment Components
  const { data: compTemplate, error: compErr } = await supabase
    .from("components_templates")
    .insert({ school_id: schoolId, name: "Default Assessment Setup" })
    .select("id")
    .single();

  if (!compErr && compTemplate) {
    const compRows = PLATFORM_DEFAULTS.components.map((c) => ({
      template_id: compTemplate.id,
      name: c.name,
      maximum_score: c.maximum_score,
      display_order: c.display_order,
    }));
    await supabase.from("components_rows").insert(compRows);
  }

  // 2. Provision Grading Configuration
  const { data: gradTemplate, error: gradErr } = await supabase
    .from("grading_templates")
    .insert({ school_id: schoolId, name: "Default Grading Scale" })
    .select("id")
    .single();

  if (!gradErr && gradTemplate) {
    const gradRows = PLATFORM_DEFAULTS.grading.map((g) => ({
      template_id: gradTemplate.id,
      grade: g.grade,
      minimum_score: g.minimum_score,
      maximum_score: g.maximum_score,
      remark: g.remark,
      principal_remark: g.principal_remark,
    }));
    await supabase.from("grading_rows").insert(gradRows);
  }

  // 3. Provision Psychomotor Traits
  const { data: psychoTemplate, error: psychoErr } = await supabase
    .from("psychomotor_templates")
    .insert({ school_id: schoolId, name: "Default Psychomotor Traits" })
    .select("id")
    .single();

  if (!psychoErr && psychoTemplate) {
    const psychoRows = PLATFORM_DEFAULTS.psychomotor.map((p) => ({
      template_id: psychoTemplate.id,
      name: p.name,
      display_order: p.display_order,
    }));
    await supabase.from("psychomotor_rows").insert(psychoRows);
  }

  // 4. Provision Affective Traits
  const { data: affectTemplate, error: affectErr } = await supabase
    .from("affective_templates")
    .insert({ school_id: schoolId, name: "Default Affective Traits" })
    .select("id")
    .single();

  if (!affectErr && affectTemplate) {
    const affectRows = PLATFORM_DEFAULTS.affective.map((a) => ({
      template_id: affectTemplate.id,
      name: a.name,
      display_order: a.display_order,
    }));
    await supabase.from("affective_rows").insert(affectRows);
  }
}
