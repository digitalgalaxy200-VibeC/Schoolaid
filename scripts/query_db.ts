import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL || "https://iojiahkehnijxxczrgft.supabase.co";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!key) {
  console.error("\u274c Set SUPABASE_SERVICE_ROLE_KEY env var first");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

async function main() {
  // 1. Find "Still Waters" school
  const { data: schools } = await supabase.from("schools").select("id, name, slug").ilike("name", "%still%");
  console.log("\n=== SCHOOLS matching 'still' ===");
  console.log(JSON.stringify(schools, null, 2));

  if (!schools?.length) {
    // Try "waters"
    const { data: s2 } = await supabase.from("schools").select("id, name, slug").ilike("name", "%water%");
    console.log("\n=== SCHOOLS matching 'water' ===");
    console.log(JSON.stringify(s2, null, 2));
    if (!s2?.length) {
      // List all schools
      const { data: all } = await supabase.from("schools").select("id, name, slug").limit(20);
      console.log("\n=== ALL SCHOOLS ===");
      console.log(JSON.stringify(all, null, 2));
      return;
    }
    const school = s2[0];

    // 2. Find Basic 1 class
    const { data: classes } = await supabase.from("classes").select("id, name").eq("school_id", school.id).ilike("name", "%basic%");
    console.log("\n=== BASIC CLASSES ===");
    console.log(JSON.stringify(classes, null, 2));

    if (classes?.length) {
      const basic1 = classes[0];

      // 3. Get students in that class
      const { data: students } = await supabase.from("students").select("id, profiles(full_name)").eq("school_id", school.id).eq("class_id", basic1.id).limit(5);
      console.log("\n=== STUDENTS in " + basic1.name + " ===");
      console.log(JSON.stringify(students, null, 2));

      if (students?.length) {
        const studentIds = students.map((s: any) => s.id);

        // 4. Get scores for those students
        const { data: scores } = await supabase.from("student_scores").select("*").eq("school_id", school.id).in("student_id", studentIds).limit(10);
        console.log("\n=== SCORES for these students ===");
        console.log(JSON.stringify(scores, null, 2));
      }
    }

    // 5. Check sessions and terms
    const { data: sessions } = await supabase.from("academic_sessions").select("id, name, is_active").eq("school_id", school.id);
    console.log("\n=== SESSIONS ===");
    console.log(JSON.stringify(sessions, null, 2));

    const { data: terms } = await supabase.from("academic_terms").select("id, name, session_id, is_active").eq("school_id", school.id);
    console.log("\n=== TERMS ===");
    console.log(JSON.stringify(terms, null, 2));

    // 6. Check student_scores with term info
    const { data: allScores } = await supabase.from("student_scores").select("student_id, term_id, score, component_id").eq("school_id", school.id).limit(10);
    console.log("\n=== ALL SCORES (any student) ===");
    console.log(JSON.stringify(allScores, null, 2));
  }
}

main().catch(console.error);
