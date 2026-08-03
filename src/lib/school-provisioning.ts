import { SupabaseClient } from "@supabase/supabase-js";
import { PLATFORM_DEFAULTS } from "./school-defaults";

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
