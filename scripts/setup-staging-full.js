/**
 * COMPLETE STAGING SETUP for AI Assessment Import Testing
 *
 * Creates: Test school, Basic 1 class, 5 students, 5 subjects, 1 teacher
 * with everything wired up for end-to-end AI import testing.
 *
 * Usage: node scripts/setup-staging-full.js
 */

const { createClient } = require("@supabase/supabase-js");
require("dotenv").config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const SCHOOL_NAME = "Test";
const SCHOOL_SLUG = "test-staging";
const SCHOOL_ABBR = "tst";
const CLASS_NAME = "Basic 1";
const NUM_STUDENTS = 5;
const NUM_SUBJECTS = 5;

// ── Helpers ────────────────────────────────────────────────────
function makeEmail(firstName, lastName) {
  const clean = (firstName + lastName).toLowerCase().replace(/[^a-z0-9]/g, "");
  return `${clean}@${SCHOOL_ABBR}.com`;
}

async function createAuthUser(email, password, fullName, role) {
  const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, role },
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Auth create failed for ${email}: ${res.status} ${err.slice(0, 200)}`);
  }
  return await res.json();
}

// ── Main ───────────────────────────────────────────────────────
async function main() {
  console.log("═══════════════════════════════════════════");
  console.log("  SchoolAid — Staging Environment Setup");
  console.log("═══════════════════════════════════════════\n");

  // ─── 1. CREATE OR FIND TEST SCHOOL ───────────────────────────
  let school = (await supabase.from("schools").select("*").eq("slug", SCHOOL_SLUG).maybeSingle()).data;
  if (!school) {
    console.log(`Creating school: "${SCHOOL_NAME}"...`);
    const { data, error } = await supabase.from("schools").insert({
      name: SCHOOL_NAME,
      slug: SCHOOL_SLUG,
      abbreviation: SCHOOL_ABBR,
      address: "123 Test Street, Staging City",
      phone: "08000000000",
      email: "admin@test.com",
      motto: "Testing Excellence",
      subscription_status: "active",
      subscription_plan: "free",
    }).select().single();
    if (error) throw new Error(`School create failed: ${error.message}`);
    school = data;
    console.log(`  ✅ Created (${school.id})\n`);
  } else {
    console.log(`Found existing school: "${school.name}" (${school.id})\n`);
  }

  // ─── 2. CREATE ACADEMIC SESSION + TERM ───────────────────────
  let session = (await supabase.from("academic_sessions").select("*").eq("school_id", school.id).eq("name", "2025/2026").maybeSingle()).data;
  if (!session) {
    const { data, error } = await supabase.from("academic_sessions").insert({
      school_id: school.id,
      name: "2025/2026",
      start_date: "2025-09-01",
      end_date: "2026-07-31",
      is_active: true,
    }).select().single();
    if (error) throw new Error(`Session create failed: ${error.message}`);
    session = data;
    console.log(`  ✅ Created session: ${session.name}\n`);
  }

  let term = (await supabase.from("academic_terms").select("*").eq("school_id", school.id).eq("name", "Second Term").maybeSingle()).data;
  if (!term) {
    const { data, error } = await supabase.from("academic_terms").insert({
      school_id: school.id,
      session_id: session.id,
      name: "Second Term",
      start_date: "2026-01-12",
      end_date: "2026-04-10",
      is_active: true,
    }).select().single();
    if (error) throw new Error(`Term create failed: ${error.message}`);
    term = data;
    console.log(`  ✅ Created term: ${term.name}\n`);
  }

  // ─── 3. CREATE BASIC 1 CLASS ─────────────────────────────────
  let classData = (await supabase.from("classes").select("*").eq("school_id", school.id).ilike("name", CLASS_NAME).maybeSingle()).data;
  if (!classData) {
    const { data, error } = await supabase.from("classes").insert({
      school_id: school.id,
      name: CLASS_NAME,
      grade_level: "Basic",
    }).select().single();
    if (error) throw new Error(`Class create failed: ${error.message}`);
    classData = data;
    console.log(`  ✅ Created class: ${classData.name} (${classData.id})\n`);
  } else {
    console.log(`  Using existing class: ${classData.name} (${classData.id})\n`);
  }

  // ─── 4. CREATE 5 STUDENTS ────────────────────────────────────
  const password = `${SCHOOL_ABBR}${SCHOOL_ABBR}${SCHOOL_ABBR}123`; // tsttsttst123
  const studentNames = [
    { first: "Amina", last: "Bello" },
    { first: "Chidi", last: "Okafor" },
    { first: "Fatima", last: "Yusuf" },
    { first: "John", last: "Musa" },
    { first: "Ngozi", last: "Eze" },
  ];

  const createdStudents = [];

  for (let i = 0; i < NUM_STUDENTS; i++) {
    const { first, last } = studentNames[i];
    const fullName = `${first} ${last}`;
    const email = makeEmail(first, last);
    const studentId = `${SCHOOL_ABBR.toUpperCase()}/2025/${String(i + 1).padStart(4, "0")}`;

    // Check if already exists
    const exists = (await supabase.from("profiles").select("id").eq("email", email).maybeSingle()).data;
    if (exists) {
      console.log(`  ⏭️  Student ${fullName} already exists, skipping...`);
      const sData = (await supabase.from("students").select("id, student_id").eq("profile_id", exists.id).maybeSingle()).data;
      if (sData) createdStudents.push({ name: fullName, email, password, student_id: sData.student_id, id: sData.id });
      continue;
    }

    try {
      // Create auth user
      const user = await createAuthUser(email, password, fullName, "student");
      const userId = user.id;
      console.log(`  Auth user created: ${email}`);

      // Update profile with school_id
      await supabase.from("profiles").update({ school_id: school.id }).eq("id", userId);

      // Create student record
      const { data: student, error: stuErr } = await supabase.from("students").insert({
        school_id: school.id,
        profile_id: userId,
        student_id: studentId,
        class_id: classData.id,
        generated_password: password,
        must_change_password: true,
        date_of_birth: `201${i + 5}-01-01`,
        gender: i % 2 === 0 ? "Female" : "Male",
        status: "active",
      }).select().single();

      if (stuErr) {
        // If generated_password / must_change_password cols missing
        const { data: s2, error: e2 } = await supabase.from("students").insert({
          school_id: school.id,
          profile_id: userId,
          student_id: studentId,
          class_id: classData.id,
          date_of_birth: `201${i + 5}-01-01`,
          gender: i % 2 === 0 ? "Female" : "Male",
          status: "active",
        }).select().single();
        if (e2) throw new Error(`Student insert failed: ${e2.message}`);
        createdStudents.push({ name: fullName, email, password, student_id: studentId, id: s2.id });
      } else {
        createdStudents.push({ name: fullName, email, password, student_id: studentId, id: student.id });
      }
      console.log(`  ✅ Student created: ${fullName} (${studentId})`);
    } catch (err) {
      console.error(`  ❌ Failed to create ${fullName}: ${err.message}`);
    }
  }

  console.log(`\n📋 ${createdStudents.length} students ready:\n`);
  for (const s of createdStudents) {
    console.log(`  ${s.name.padEnd(18)} | ${s.email.padEnd(28)} | ${s.password}`);
  }

  // ─── 5. CREATE 5 SUBJECTS + ASSIGN TO BASIC 1 ────────────────
  const subjectNames = [
    "English Studies",
    "Mathematics",
    "Basic Science",
    "Social Studies",
    "Creative Arts",
  ];

  const createdSubjects = [];

  for (const subName of subjectNames) {
    // Check if subject exists
    let sub = (await supabase.from("subjects").select("*").eq("school_id", school.id).eq("name", subName).maybeSingle()).data;
    if (!sub) {
      const { data, error } = await supabase.from("subjects").insert({
        school_id: school.id,
        name: subName,
        code: subName.split(" ").map(w => w[0]).join("").toUpperCase(),
        is_active: true,
      }).select().single();
      if (error) { console.error(`  ❌ Subject ${subName}: ${error.message}`); continue; }
      sub = data;
    }

    createdSubjects.push(sub);

    // Assign to class
    const exists = (await supabase.from("class_subjects").select("id").eq("school_id", school.id).eq("class_id", classData.id).eq("subject_id", sub.id).maybeSingle()).data;
    if (!exists) {
      const { error } = await supabase.from("class_subjects").insert({
        school_id: school.id,
        class_id: classData.id,
        subject_id: sub.id,
        is_active: true,
      });
      if (error && error.code !== "23505") {
        console.error(`  ❌ Assign ${subName} to class: ${error.message}`);
      }
    }
  }

  console.log(`\n📚 ${createdSubjects.length} subjects assigned to ${CLASS_NAME}:`);
  for (const s of createdSubjects) {
    console.log(`  - ${s.name} (${s.code})`);
  }

  // ─── 6. CREATE A TEACHER ─────────────────────────────────────
  const teacherEmail = `teacher@${SCHOOL_ABBR}.com`;
  const teacherPassword = `${SCHOOL_ABBR}${SCHOOL_ABBR}${SCHOOL_ABBR}123`;

  let teacherProfile = (await supabase.from("profiles").select("id").eq("email", teacherEmail).maybeSingle()).data;
  let teacherId;

  if (!teacherProfile) {
    try {
      const user = await createAuthUser(teacherEmail, teacherPassword, "Test Teacher", "teacher");
      await supabase.from("profiles").update({ school_id: school.id }).eq("id", user.id);

      const { data: t, error: tErr } = await supabase.from("teachers").insert({
        school_id: school.id,
        profile_id: user.id,
        generated_password: teacherPassword,
        must_change_password: true,
        staff_role: "Class Teacher",
      }).select().single();

      if (tErr) {
        const { data: t2 } = await supabase.from("teachers").insert({
          school_id: school.id,
          profile_id: user.id,
          staff_role: "Class Teacher",
        }).select().single();
        teacherId = t2?.id;
      } else {
        teacherId = t?.id;
      }

      console.log(`\n👨‍🏫 Teacher created: Test Teacher (${teacherEmail})`);
    } catch (err) {
      console.error(`  ❌ Teacher create failed: ${err.message}`);
    }
  } else {
    const tData = (await supabase.from("teachers").select("id").eq("profile_id", teacherProfile.id).maybeSingle()).data;
    teacherId = tData?.id;
    console.log(`\n👨‍🏫 Teacher already exists: ${teacherEmail}`);
  }

  // ─── 7. ASSIGN TEACHER TO CLASS ──────────────────────────────
  if (teacherId) {
    const ctExists = (await supabase.from("class_teachers").select("id").eq("school_id", school.id).eq("class_id", classData.id).eq("teacher_id", teacherId).maybeSingle()).data;
    if (!ctExists) {
      await supabase.from("class_teachers").insert({
        school_id: school.id,
        class_id: classData.id,
        teacher_id: teacherId,
        role: "primary",
        is_active: true,
      });
      console.log(`  ✅ Teacher assigned to ${CLASS_NAME} as primary`);
    }

    // Assign teacher to all subjects
    for (const sub of createdSubjects) {
      const tsExists = (await supabase.from("teacher_subjects").select("id").eq("teacher_id", teacherId).eq("subject_id", sub.id).eq("class_id", classData.id).maybeSingle()).data;
      if (!tsExists) {
        await supabase.from("teacher_subjects").insert({
          school_id: school.id,
          teacher_id: teacherId,
          subject_id: sub.id,
          class_id: classData.id,
          academic_term_id: term.id,
          role: "primary",
          is_active: true,
        });
      }
    }
    console.log(`  ✅ Teacher assigned to all ${createdSubjects.length} subjects\n`);
  }

  // ─── 8. CREATE ASSESSMENT COMPONENTS TEMPLATE ────────────────
  const ctExists = (await supabase.from("class_components_templates").select("template_id").eq("class_id", classData.id).maybeSingle()).data;
  if (!ctExists) {
    // Create template
    const { data: template } = await supabase.from("components_templates").insert({
      school_id: school.id,
      name: "Basic Assessment Components",
    }).select().single();

    // Create component rows
    const components = [
      { name: "First Test", max: 20, order: 1 },
      { name: "Second Test", max: 20, order: 2 },
      { name: "Exam", max: 60, order: 3 },
    ];

    for (const c of components) {
      await supabase.from("components_rows").insert({
        template_id: template.id,
        name: c.name,
        maximum_score: c.max,
        display_order: c.order,
      });
    }

    // Link template to class
    await supabase.from("class_components_templates").insert({
      school_id: school.id,
      class_id: classData.id,
      template_id: template.id,
    });

    console.log(`📐 Assessment template created: 3 components (First Test 20, Second Test 20, Exam 60)\n`);
  } else {
    console.log(`📐 Assessment template already exists\n`);
  }

  // ─── 9. FINAL SUMMARY ────────────────────────────────────────
  console.log("═══════════════════════════════════════════");
  console.log("  SETUP COMPLETE");
  console.log("═══════════════════════════════════════════");
  console.log(`School:      ${SCHOOL_NAME} (${school.id})`);
  console.log(`Class:       ${CLASS_NAME} (${classData.id})`);
  console.log(`Term:        ${term.name} (${term.id})`);
  console.log(`Students:    ${createdStudents.length}`);
  console.log(`Subjects:    ${createdSubjects.length}`);
  console.log(`Teacher:     ${teacherEmail}`);
  console.log(`Password:    ${teacherPassword}`);
  console.log(`AI Import:   Enable via Super Admin → Schools → toggle AI Import`);
  console.log("═══════════════════════════════════════════\n");

  console.log("📋 STUDENT CREDENTIALS:");
  console.log("───────────────────────────────────────────");
  for (const s of createdStudents) {
    console.log(`${s.name.padEnd(18)} | ${s.email.padEnd(28)} | ${s.password}`);
  }
  console.log("───────────────────────────────────────────\n");
  console.log("Next steps:");
  console.log("1. Enable AI Import for this school in Super Admin → Schools");
  console.log("2. Log in as teacher and go to Enter Marks → Basic 1");
  console.log("3. Upload a photo of a handwritten assessment sheet");
  console.log("4. Review and import the AI-extracted scores\n");
}

main().catch(err => { console.error(err); process.exit(1); });
