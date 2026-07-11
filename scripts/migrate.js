/**
 * SchoolAid Data Migration Script
 * ================================
 * Reads backup.sql from the old system and migrates:
 *   - Schools (with Cloudinary URLs preserved)
 *   - Academic Sessions & Terms
 *   - Classes & Subjects (with class_subjects linkages)
 *   - Staff -> auth users -> profiles -> teachers
 *   - Students -> auth users -> profiles -> students
 *   - Assessment Scores -> components template + student_scores
 *
 * Run with: node scripts/migrate.js
 */

const fs = require("fs");
const readline = require("readline");
const https = require("https");

// CONFIG
const BACKUP_FILE = "D:\\Web Apps\\WepApps\\Schoool Aid\\backup.sql";
const SUPABASE_URL = "https://iojiahkehnijxxczrgft.supabase.co";
const SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlvamlhaGtlaG5panh4Y3pyZ2Z0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MzM4NDEyMywiZXhwIjoyMDk4OTYwMTIzfQ.B65fIDG8h6a4lsEE8qwnRanik4sVo9A-w3Vu97QhPr0";
const SKIP_SCHOOL_SLUGS = [];

const log = (msg) => process.stdout.write(msg + "\n");
const ok  = (msg) => log("  OK " + msg);
const warn = (msg) => log("  WARN " + msg);
const err = (msg) => log("  ERR " + msg);

let requestCount = 0;
async function supabaseRequest(method, path, body = null) {
  requestCount++;
  return new Promise((resolve, reject) => {
    const url = new URL(SUPABASE_URL + path);
    const headers = {
      "Content-Type": "application/json",
      "apikey": SERVICE_ROLE_KEY,
      "Authorization": "Bearer " + SERVICE_ROLE_KEY,
    };
    if (method === "POST" || method === "PATCH") headers["Prefer"] = "return=representation";
    const options = { method, headers };
    const req = https.request(url, options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, data }); }
      });
    });
    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function upsert(table, rows, conflict) {
  if (!rows || !rows.length) return;
  const path = "/rest/v1/" + table + (conflict ? "?on_conflict=" + conflict : "");
  const res = await supabaseRequest("POST", path, rows);
  if (res.status >= 400) {
    err("Failed to upsert " + table + ": " + JSON.stringify(res.data).slice(0, 200));
  }
  return res;
}

function generatePassword(prefix) {
  return prefix + Math.floor(10000 + Math.random() * 90000).toString();
}

async function createAuthUser(email, password, metadata) {
  const res = await supabaseRequest("POST", "/auth/v1/admin/users", {
    email, password, email_confirm: true, user_metadata: metadata,
  });
  if (res.status === 200 || res.status === 201) return { id: res.data.id, error: null };
  const msg = JSON.stringify(res.data);
  if (msg.includes("already")) return { id: null, error: "duplicate" };
  return { id: null, error: msg.slice(0, 200) };
}

function parseInsertLine(line) {
  const tableMatch = line.match(/^INSERT INTO "([^"]+)"/);
  if (!tableMatch) return null;
  const tableName = tableMatch[1];
  const colMatch = line.match(/\(([^)]+)\) VALUES/);
  if (!colMatch) return null;
  const columns = colMatch[1].split(",").map((c) => c.trim().replace(/"/g, ""));
  const valuesSection = line.slice(line.indexOf(" VALUES ") + 8);
  const values = parseValueTuple(valuesSection);
  if (!values || values.length !== columns.length) return null;
  const row = {};
  columns.forEach((col, i) => { row[col] = values[i]; });
  return { table: tableName, row };
}

function parseValueTuple(str) {
  str = str.trim();
  if (!str.startsWith("(")) return null;
  const values = [];
  let i = 1, current = "", inStr = false;
  while (i < str.length) {
    const ch = str[i];
    if (!inStr && ch === "'") { inStr = true; i++; continue; }
    if (inStr && ch === "'") {
      if (str[i + 1] === "'") { current += "'"; i += 2; continue; }
      inStr = false; i++; continue;
    }
    if (!inStr && (ch === "," || ch === ")" || ch === ";")) {
      const val = current.trim();
      values.push(val === "NULL" ? null : val);
      current = "";
      if (ch === ")" || ch === ";") break;
      i++; continue;
    }
    current += ch; i++;
  }
  return values;
}

async function readBackup() {
  const data = {
    schools: [], academic_sessions: [], academic_terms: [],
    classes: [], subjects: [], subject_class_assignments: [],
    staff: [], students: [], assessment_scores: [],
  };
  const fileStream = fs.createReadStream(BACKUP_FILE);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.startsWith("INSERT INTO")) continue;
    const parsed = parseInsertLine(line);
    if (!parsed) continue;
    if (data[parsed.table] !== undefined) data[parsed.table].push(parsed.row);
  }
  return data;
}

async function migrateSchools(data) {
  log("\nStep 1: Schools...");
  const rows = data.schools.filter((s) => s.name && s.slug && !s.deleted_at && s.is_active !== "false").map((s) => ({
    id: s.id, name: s.name, slug: s.slug,
    address: s.address || null, phone: s.contact_phone || null,
    email: s.contact_email || null, logo_url: s.logo_url || null, is_active: true,
  }));
  if (!rows.length) { warn("No schools."); return []; }
  const res = await supabaseRequest("POST", "/rest/v1/schools?on_conflict=id", rows);
  if (res.status >= 400) {
    // retry without potential missing columns
    const safeRows = rows.map(({ logo_url, ...r }) => r);
    await supabaseRequest("POST", "/rest/v1/schools?on_conflict=id", safeRows);
    // Put logo_url in separately via PATCH
    for (const s of rows) {
      if (s.logo_url) {
        await supabaseRequest("PATCH", "/rest/v1/schools?id=eq." + s.id, { logo_url: s.logo_url });
      }
    }
  }
  ok("Migrated " + rows.length + " schools");
  return rows;
}

async function migrateSessions(data, schoolIds) {
  log("\nStep 2: Academic Sessions...");
  const rows = data.academic_sessions.filter((s) => schoolIds.includes(s.school_id)).map((s) => ({
    id: s.id, school_id: s.school_id, name: s.name,
    start_date: s.start_date || "2025-09-01", end_date: s.end_date || "2026-07-31",
    is_active: s.is_active === "true" || s.is_active === true,
  }));
  if (!rows.length) { warn("No sessions."); return []; }
  await upsert("academic_sessions", rows, "id");
  ok("Migrated " + rows.length + " sessions");
  return rows;
}

async function migrateTerms(data, schoolIds) {
  log("\nStep 3: Academic Terms...");
  const rows = data.academic_terms.filter((t) => schoolIds.includes(t.school_id)).map((t) => ({
    id: t.id, school_id: t.school_id, name: t.name,
    start_date: t.start_date || "2026-01-01", end_date: t.end_date || "2026-03-31",
    is_active: t.is_active === "true" || t.is_active === true,
  }));
  if (!rows.length) { warn("No terms."); return []; }
  await upsert("academic_terms", rows, "id");
  ok("Migrated " + rows.length + " terms");
  return rows;
}

async function migrateClasses(data, schoolIds) {
  log("\nStep 4: Classes...");
  const rows = data.classes.filter((c) => schoolIds.includes(c.school_id) && !c.deleted_at).map((c) => ({
    id: c.id, school_id: c.school_id, name: c.name,
    description: c.arm || null, grade_level: c.level || null,
  }));
  if (!rows.length) { warn("No classes."); return []; }
  await upsert("classes", rows, "id");
  ok("Migrated " + rows.length + " classes");
  return rows;
}

async function migrateSubjects(data, schoolIds) {
  log("\nStep 5: Subjects...");
  const rows = data.subjects.filter((s) => schoolIds.includes(s.school_id) && !s.deleted_at).map((s) => ({
    id: s.id, school_id: s.school_id, name: s.name, code: s.code || null, is_active: true,
  }));
  if (!rows.length) { warn("No subjects."); return []; }
  await upsert("subjects", rows, "id");
  ok("Migrated " + rows.length + " subjects");

  log("  Linking subjects to classes...");
  const csRows = [], seen = new Set();
  data.subject_class_assignments.filter((a) => schoolIds.includes(a.school_id)).forEach((a) => {
    const key = a.class_id + "-" + a.subject_id;
    if (!seen.has(key)) { seen.add(key); csRows.push({ school_id: a.school_id, class_id: a.class_id, subject_id: a.subject_id, is_active: true }); }
  });
  if (csRows.length) { await upsert("class_subjects", csRows); ok("Linked " + csRows.length + " class-subject pairs"); }
  return rows;
}

async function migrateStaff(data, schoolIds, schools) {
  log("\nStep 6: Staff / Teachers...");
  const list = data.staff.filter((s) => schoolIds.includes(s.school_id) && !s.deleted_at && s.full_name);
  log("  Found " + list.length + " staff");
  const creds = [];
  let ok_count = 0, fail = 0;
  for (const s of list) {
    const school = schools.find((sc) => sc.id === s.school_id);
    const password = generatePassword("SAT");
    const email = s.email || (s.staff_number || s.id.slice(0,8)) + "@" + (school && school.slug || "school") + ".edu";
    const { id: authId, error: authErr } = await createAuthUser(email, password, { full_name: s.full_name, role: "teacher", school_id: s.school_id });
    if (!authId) { if (authErr !== "duplicate") { err("Teacher " + s.full_name + ": " + authErr); fail++; } else warn("Teacher " + s.full_name + " (duplicate)"); continue; }
    await supabaseRequest("PATCH", "/rest/v1/profiles?id=eq." + authId, { school_id: s.school_id, full_name: s.full_name, phone: s.phone || null, avatar_url: s.photo_url || null, role: "teacher" });
    await supabaseRequest("POST", "/rest/v1/teachers?on_conflict=profile_id", [{ school_id: s.school_id, profile_id: authId, employee_id: s.staff_number || null, specialization: s.position || null }]);
    creds.push({ name: s.full_name, email, password, school: school && school.name });
    ok_count++;
    if (ok_count % 10 === 0) { log("    ..." + ok_count + " teachers done"); await new Promise((r) => setTimeout(r, 300)); }
  }
  ok("Teachers migrated: " + ok_count + " (failed: " + fail + ")");
  return creds;
}

async function migrateStudents(data, schoolIds, schools) {
  log("\nStep 7: Students...");
  const list = data.students.filter((s) => schoolIds.includes(s.school_id) && !s.deleted_at && (s.first_name || s.last_name));
  log("  Found " + list.length + " students");
  const creds = [], idMap = {};
  let ok_count = 0, fail = 0;
  for (const s of list) {
    const school = schools.find((sc) => sc.id === s.school_id);
    const password = generatePassword("SAS");
    const fullName = [s.first_name, s.middle_name, s.last_name].filter(Boolean).join(" ");
    const admNo = s.admission_number || s.username || s.id.slice(0, 8);
    const slug = school && school.slug || "school";
    const email = s.email || admNo + "@student." + slug + ".edu";
    const { id: authId, error: authErr } = await createAuthUser(email, password, { full_name: fullName, role: "student", school_id: s.school_id });
    if (!authId) { if (authErr !== "duplicate") { err("Student " + fullName + ": " + authErr); fail++; } else warn("Student " + fullName + " (duplicate)"); continue; }
    await supabaseRequest("PATCH", "/rest/v1/profiles?id=eq." + authId, { school_id: s.school_id, full_name: fullName, phone: s.parent_phone || null, avatar_url: s.photo_url || null, role: "student" });
    const sr = await supabaseRequest("POST", "/rest/v1/students?on_conflict=profile_id&select=id", [{ school_id: s.school_id, profile_id: authId, student_id: admNo, class_id: s.class_id || null, enrollment_date: s.created_at ? s.created_at.slice(0, 10) : null }]);
    const newId = sr.data && sr.data[0] && sr.data[0].id;
    if (newId) { idMap[s.id] = newId; }
    else { const fr = await supabaseRequest("GET", "/rest/v1/students?profile_id=eq." + authId + "&select=id"); if (fr.data && fr.data[0]) idMap[s.id] = fr.data[0].id; }
    creds.push({ name: fullName, email, password, school: school && school.name, admission: admNo });
    ok_count++;
    if (ok_count % 20 === 0) { log("    ..." + ok_count + " students done"); await new Promise((r) => setTimeout(r, 300)); }
  }
  ok("Students migrated: " + ok_count + " (failed: " + fail + ")");
  return { creds, idMap };
}

async function migrateScores(data, schoolIds, idMap, terms) {
  log("\nStep 8: Assessment Scores...");
  const tmplMap = {};
  for (const schoolId of schoolIds) {
    const tr = await supabaseRequest("POST", "/rest/v1/components_templates?select=id", [{ school_id: schoolId, name: "Standard Assessment" }]);
    let tmplId = tr.data && tr.data[0] && tr.data[0].id;
    if (!tmplId) { const fr = await supabaseRequest("GET", "/rest/v1/components_templates?school_id=eq." + schoolId + "&name=eq.Standard%20Assessment&select=id"); tmplId = fr.data && fr.data[0] && fr.data[0].id; }
    if (!tmplId) { warn("No template for school " + schoolId); continue; }
    const cr = await supabaseRequest("POST", "/rest/v1/components_rows?select=id,name", [
      { template_id: tmplId, name: "Test 1", maximum_score: 20, display_order: 1 },
      { template_id: tmplId, name: "Test 2", maximum_score: 20, display_order: 2 },
      { template_id: tmplId, name: "Exam",   maximum_score: 60, display_order: 3 },
    ]);
    const comps = cr.data;
    if (!Array.isArray(comps) || comps.length < 3) { warn("Components insert failed for school " + schoolId); continue; }
    const comp1 = comps.find((c) => c.name === "Test 1") && comps.find((c) => c.name === "Test 1").id;
    const comp2 = comps.find((c) => c.name === "Test 2") && comps.find((c) => c.name === "Test 2").id;
    const comp3 = comps.find((c) => c.name === "Exam")   && comps.find((c) => c.name === "Exam").id;
    tmplMap[schoolId] = { tmplId, comp1, comp2, comp3 };
    const cls = data.classes.filter((c) => c.school_id === schoolId);
    for (const c of cls) await supabaseRequest("POST", "/rest/v1/class_components_templates?on_conflict=class_id", [{ school_id: schoolId, class_id: c.id, template_id: tmplId }]);
  }

  let scoreCount = 0;
  const batch = [];
  const validScores = data.assessment_scores.filter((s) => schoolIds.includes(s.school_id) && idMap[s.student_id]);
  for (const s of validScores) {
    const t = tmplMap[s.school_id];
    if (!t || !s.term_id) continue;
    const ns = idMap[s.student_id];
    if (s.test1_score !== null && t.comp1) batch.push({ school_id: s.school_id, student_id: ns, component_id: t.comp1, term_id: s.term_id, score: parseFloat(s.test1_score) || 0 });
    if (s.test2_score !== null && t.comp2) batch.push({ school_id: s.school_id, student_id: ns, component_id: t.comp2, term_id: s.term_id, score: parseFloat(s.test2_score) || 0 });
    if (s.exam_score  !== null && t.comp3) batch.push({ school_id: s.school_id, student_id: ns, component_id: t.comp3, term_id: s.term_id, score: parseFloat(s.exam_score)  || 0 });
    if (batch.length >= 100) {
      await supabaseRequest("POST", "/rest/v1/student_scores?on_conflict=student_id,component_id,term_id", [...batch]);
      scoreCount += batch.length; batch.length = 0; await new Promise((r) => setTimeout(r, 200));
    }
  }
  if (batch.length) { await supabaseRequest("POST", "/rest/v1/student_scores?on_conflict=student_id,component_id,term_id", [...batch]); scoreCount += batch.length; }
  ok("Inserted " + scoreCount + " score records");
}

function saveCreds(teachers, students) {
  const lines = ["SchoolAid Migration Credentials", "================================", "Generated: " + new Date().toISOString(), "", "TEACHERS", "--------",
    ...teachers.map((t) => t.school + " | " + t.name + " | " + t.email + " | " + t.password),
    "", "STUDENTS", "--------",
    ...students.map((s) => s.school + " | " + s.name + " (" + s.admission + ") | " + s.email + " | " + s.password),
  ];
  fs.writeFileSync("migration_credentials.txt", lines.join("\n"), "utf8");
  log("\nCredentials saved to: migration_credentials.txt");
  log("  Teachers: " + teachers.length + "  Students: " + students.length);
}

async function run() {
  log("SchoolAid Data Migration");
  log("========================");
  log("Backup: " + BACKUP_FILE);
  log("Target: " + SUPABASE_URL);
  log("");
  log("Reading backup.sql...");
  const data = await readBackup();
  log("Found: " + data.schools.length + " schools, " + data.students.length + " students, " + data.staff.length + " staff, " + data.classes.length + " classes, " + data.subjects.length + " subjects, " + data.assessment_scores.length + " scores");

  const schools = await migrateSchools(data);
  const schoolIds = schools.map((s) => s.id);
  if (!schoolIds.length) { err("No schools migrated. Aborting."); process.exit(1); }

  await migrateSessions(data, schoolIds);
  const terms = await migrateTerms(data, schoolIds);
  await migrateClasses(data, schoolIds);
  await migrateSubjects(data, schoolIds);
  const teacherCreds = await migrateStaff(data, schoolIds, schools);
  const { creds: studentCreds, idMap } = await migrateStudents(data, schoolIds, schools);
  await migrateScores(data, schoolIds, idMap, terms);
  saveCreds(teacherCreds, studentCreds);

  log("\nMigration Complete!");
  log("Total API requests: " + requestCount);
}

run().catch((e) => { err("Fatal: " + e.message); console.error(e); process.exit(1); });
