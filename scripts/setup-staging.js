/**
 * Staging Setup Script — AI Assessment Import Testing
 *
 * Usage: node scripts/setup-staging.js
 */

const { createClient } = require("@supabase/supabase-js");
require("dotenv").config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

async function main() {
  console.log("Finding Test school...");
  const { data: school } = await supabase.from("schools").select("*").ilike("name", "%test%").single();
  if (!school) { console.error("No school with 'Test' in name found."); process.exit(1); }
  console.log(`School: ${school.name} (${school.id}) — abbreviation: ${school.abbreviation}`);

  // Find Basic 1 class
  const { data: classData } = await supabase.from("classes").select("*").eq("school_id", school.id).ilike("name", "basic 1").single();
  if (!classData) { console.error("No 'Basic 1' class found in this school."); process.exit(1); }
  console.log(`Class: ${classData.name} (${classData.id})`);

  // Find active term
  const { data: term } = await supabase.from("academic_terms").select("*, academic_sessions(name)").eq("school_id", school.id).order("created_at", { ascending: false }).limit(1).single();
  if (!term) { console.error("No active term found."); process.exit(1); }
  const sessionName = term.academic_sessions?.name || "?";
  console.log(`Term: ${sessionName} / ${term.name} (${term.id})`);

  // Existing students
  const { data: existingStudents } = await supabase.from("students").select("id, student_id, profiles(full_name, email)").eq("school_id", school.id).eq("class_id", classData.id);
  console.log(`\nExisting students in ${classData.name}: ${existingStudents?.length || 0}`);
  if (existingStudents) {
    for (const s of existingStudents) {
      const p = Array.isArray(s.profiles) ? s.profiles[0] : s.profiles;
      console.log(`  - ${p?.full_name || "?"} | ${p?.email || "?"} | ID: ${s.student_id}`);
    }
  }

  // Existing subjects
  const { data: existingSubs } = await supabase.from("class_subjects").select("subjects(id, name, code)").eq("school_id", school.id).eq("class_id", classData.id);
  console.log(`\nExisting subjects in ${classData.name}: ${existingSubs?.length || 0}`);
  if (existingSubs) {
    for (const cs of existingSubs) {
      const sub = cs.subjects;
      console.log(`  - ${sub?.name || "?"} (${sub?.code || "no code"})`);
    }
  }

  // Class teachers
  const { data: classTeachers } = await supabase.from("class_teachers").select("teacher_id, role, teachers(profile_id, profiles(full_name, email))").eq("school_id", school.id).eq("class_id", classData.id).eq("is_active", true);
  console.log(`\nClass Teachers for ${classData.name}:`);
  if (classTeachers && classTeachers.length > 0) {
    for (const ct of classTeachers) {
      const t = ct.teachers;
      const p = Array.isArray(t?.profiles) ? t.profiles[0] : t?.profiles;
      console.log(`  - ${p?.full_name || "Unknown"} (${p?.email}) — Role: ${ct.role}, Teacher ID: ${ct.teacher_id}`);
    }
  } else {
    console.log("  WARNING: No class teacher assigned!");
  }

  // Teacher subject assignments
  const teacherId = classTeachers?.[0]?.teacher_id;
  if (teacherId) {
    const { data: tAssignments } = await supabase.from("teacher_subjects").select("subjects(id, name)").eq("teacher_id", teacherId).eq("class_id", classData.id).eq("is_active", true);
    console.log(`\nTeacher's subjects for ${classData.name}:`);
    if (tAssignments && tAssignments.length > 0) {
      for (const a of tAssignments) {
        console.log(`  - ${a.subjects?.name || "?"}`);
      }
    } else {
      console.log("  (none assigned)");
    }
  }

  // Assessment components
  const { data: link } = await supabase.from("class_components_templates").select("template_id").eq("class_id", classData.id).maybeSingle();
  const templateId = link?.template_id;
  if (templateId) {
    const { data: comps } = await supabase.from("components_rows").select("*").eq("template_id", templateId).order("display_order");
    console.log(`\nAssessment Components (template ${templateId}):`);
    if (comps) {
      for (const c of comps) {
        console.log(`  - ${c.name} (max: ${c.maximum_score}, order: ${c.display_order})`);
      }
    }
  } else {
    console.log("\nWARNING: No assessment component template assigned to this class!");
  }

  // Summary
  console.log("\n=====================================");
  console.log("SETUP SUMMARY");
  console.log("=====================================");
  console.log(`School:         ${school.name}`);
  console.log(`Abbreviation:   ${school.abbreviation}`);
  console.log(`Class:          ${classData.name} (${classData.id})`);
  console.log(`Term:           ${term.name} (${term.id})`);
  console.log(`Students:       ${existingStudents?.length || 0}`);
  console.log(`Subjects:       ${existingSubs?.length || 0}`);
  console.log(`Components:     ${templateId ? "YES" : "NO"}`);
  console.log(`Class Teacher:  ${classTeachers?.length ? "YES" : "NO"}`);
  console.log("=====================================");

  // Return data for chaining
  return { school, classData, term, existingStudents, existingSubs, classTeachers, teacherId, templateId };
}

main().catch(console.error);
