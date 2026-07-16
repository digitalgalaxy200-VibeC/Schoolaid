/**
 * SchoolAid — Dynamic Broadsheet Score Importer
 * =============================================
 * Usage: node scripts/import_broadsheet.js "School Name" "path/to/file.xlsx" [term_name]
 *
 * - Dynamically resolves school ID, term ID, component IDs, subjects
 * - No hardcoded IDs — works for any school
 * - Handles multi-tab Excel files (one tab per class)
 * - Skips dashes, empties, calculated TOTAL columns
 * - Never modifies student names
 */

const XLSX = require("xlsx");
const https = require("https");

const SUPABASE_URL = "https://iojiahkehnijxxczrgft.supabase.co";
const KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlvamlhaGtlaG5panh4Y3pyZ2Z0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MzM4NDEyMywiZXhwIjoyMDk4OTYwMTIzfQ.B65fIDG8h6a4lsEE8qwnRanik4sVo9A-w3Vu97QhPr0";

const STOP_GROUPS = [
  "PERFORMANCE SUMMARY", "ATTENDANCE", "PSYCHOMOTOR SKILLS",
  "AFFECTIVE DOMAIN", "TEACHER REMARKS", "PRINCIPAL REMARKS", "RESULT LINK",
];

// ── Helpers ──────────────────────────────────────────────────────────

function apiGet(path) {
  return new Promise((resolve, reject) => {
    const url = SUPABASE_URL + path;
    https.get(url, { headers: { apikey: KEY, Authorization: "Bearer " + KEY } }, (res) => {
      let d = "";
      res.on("data", (c) => (d += c));
      res.on("end", () => {
        try { resolve(JSON.parse(d)); } catch { resolve(null); }
      });
    }).on("error", reject);
  });
}

function apiPost(path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(SUPABASE_URL + path);
    const req = https.request(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: KEY,
        Authorization: "Bearer " + KEY,
        Prefer: "return=minimal",
      },
    }, (res) => {
      let d = "";
      res.on("data", (c) => (d += c));
      res.on("end", () => resolve(res.statusCode < 400));
    });
    req.on("error", reject);
    req.write(JSON.stringify(body));
    req.end();
  });
}

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.log("Usage: node scripts/import_broadsheet.js \"School Name\" \"path/to/file.xlsx\" [term_name]");
    process.exit(1);
  }
  
  const schoolName = args[0];
  const filePath = args[1];
  const targetTerm = args[2] || "Second Term";

  console.log("School:", schoolName);
  console.log("File:", filePath);
  console.log("Term:", targetTerm);
  console.log("");

  // ── 1. Resolve school ──────────────────────────────────────────
  const schools = await apiGet(
    "/rest/v1/schools?select=id,name,slug&name=ilike." + encodeURIComponent("%" + schoolName + "%")
  );
  if (!schools || !schools.length) {
    console.error("❌ School not found:", schoolName);
    process.exit(1);
  }
  const school = schools[0];
  const SCHOOL_ID = school.id;
  console.log("✅ School:", school.name, "(" + SCHOOL_ID + ")");

  // ── 2. Resolve term ────────────────────────────────────────────
  const terms = await apiGet(
    "/rest/v1/academic_terms?select=id,name&school_id=eq." + SCHOOL_ID + "&name=ilike." + encodeURIComponent("%" + targetTerm + "%")
  );
  if (!terms || !terms.length) {
    console.error("❌ Term not found:", targetTerm);
    process.exit(1);
  }
  const TERM_ID = terms[0].id;
  console.log("✅ Term:", terms[0].name, "(" + TERM_ID + ")");

  // ── 3. Resolve component IDs for THIS school ────────────────────
  const templates = await apiGet(
    "/rest/v1/components_templates?select=id&school_id=eq." + SCHOOL_ID
  );
  if (!templates || !templates.length) {
    console.error("❌ No component template found for this school");
    process.exit(1);
  }
  const rows = await apiGet(
    "/rest/v1/components_rows?select=id,name&template_id=eq." + templates[0].id + "&order=display_order"
  );
  
  // Build dynamic mapping: try CA1/CA2/Exam first, fall back to Test1/Test2/Exam
  const COMPONENTS = {};
  const nameMap = { "CA1": "1st CA", "CA2": "2nd CA", "Test 1": "1st CA", "Test 2": "2nd CA", "Exam": "Exam" };
  for (const r of rows) {
    const mapped = nameMap[r.name];
    if (mapped) COMPONENTS[mapped] = r.id;
  }
  
  if (!COMPONENTS["1st CA"] || !COMPONENTS["2nd CA"] || !COMPONENTS["Exam"]) {
    console.error("❌ Could not resolve all component IDs. Found:", JSON.stringify(rows.map(r => r.name)));
    process.exit(1);
  }
  console.log("✅ Components:", Object.entries(COMPONENTS).map(([k, v]) => k + "=" + v.slice(0, 8)).join(", "));

  // ── 4. Load DB subjects ─────────────────────────────────────────
  const dbSubjects = await apiGet(
    "/rest/v1/subjects?select=id,name&school_id=eq." + SCHOOL_ID
  );
  const subjectMap = {};
  dbSubjects.forEach((s) => { subjectMap[s.name] = s.id; });
  console.log("✅ Subjects loaded:", Object.keys(subjectMap).length);

  // ── 5. Load DB classes ──────────────────────────────────────────
  const dbClasses = await apiGet(
    "/rest/v1/classes?select=id,name&school_id=eq." + SCHOOL_ID
  );
  const classMap = {};
  dbClasses.forEach((c) => { classMap[c.name] = c.id; });
  console.log("✅ Classes loaded:", Object.keys(classMap).length);

  // ── 6. Delete existing scores for this school+term (clean start) ─
  console.log("\n🧹 Clearing existing scores...");
  const delRes = await new Promise((resolve) => {
    const url = new URL(SUPABASE_URL + "/rest/v1/student_scores?school_id=eq." + SCHOOL_ID + "&term_id=eq." + TERM_ID + "&subject_id=not.is.null");
    const req = https.request(url, {
      method: "DELETE",
      headers: { apikey: KEY, Authorization: "Bearer " + KEY, Prefer: "return=representation" },
    }, (res) => {
      let d = "";
      res.on("data", (c) => (d += c));
      res.on("end", () => {
        try { resolve(JSON.parse(d).length || 0); } catch { resolve(0); }
      });
    });
    req.end();
  });
  console.log("   Deleted:", delRes);

  // ── 7. Read Excel ───────────────────────────────────────────────
  console.log("\n📖 Reading Excel...");
  const wb = XLSX.readFile(filePath);
  console.log("   Tabs:", wb.SheetNames.length);

  // ── 8. Import each tab ──────────────────────────────────────────
  console.log("\n=== IMPORTING ===");
  console.log("Class".padEnd(18) + "Stu  Inserted  Dash  Empty");
  console.log("-".repeat(50));

  let grandTotal = 0;

  for (const tabName of wb.SheetNames) {
    const ws = wb.Sheets[tabName];
    const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
    const groupRow = data[0] || [];
    const fieldRow = data[1] || [];

    // Build subject columns with carry-forward
    const subjectColumns = {};
    let cur = null;
    for (let i = 2; i < fieldRow.length; i++) {
      const g = String(groupRow[i] || "").trim();
      const f = String(fieldRow[i] || "").trim();
      if (g && g !== "STUDENT INFO" && !STOP_GROUPS.includes(g)) cur = g;
      if (g && STOP_GROUPS.includes(g)) break;
      const fl = f.toLowerCase();
      if (cur && (fl === "1st ca" || fl === "2nd ca" || fl === "exam")) {
        subjectColumns[i] = { subject: cur, component: f };
      }
    }

    const classId = classMap[tabName];
    if (!classId) {
      console.log(tabName.padEnd(18) + "⚠ CLASS NOT IN DB");
      continue;
    }

    // Get students for this class
    const classStudents = await apiGet(
      "/rest/v1/students?select=id,student_id&class_id=eq." + classId
    );
    const studentMap = {};
    (classStudents || []).forEach((s) => { studentMap[s.student_id] = s.id; });

    let inserted = 0, skipDash = 0, skipEmpty = 0;

    for (let ri = 2; ri < data.length; ri++) {
      const row = data[ri];
      const sid = String(row[0] || "").trim();
      if (!sid) continue;
      const dbUuid = studentMap[sid];
      if (!dbUuid) continue;

      const batch = [];
      for (const [ci, { subject, component }] of Object.entries(subjectColumns)) {
        const raw = String(row[parseInt(ci)] || "").trim();
          const subjId = subjectMap[subject];
          // Case-insensitive component lookup
          const compKey = Object.keys(COMPONENTS).find(k => k.toLowerCase() === component.toLowerCase());
          const compId = compKey ? COMPONENTS[compKey] : null;
        if (!subjId || !compId) continue;
        if (raw === "-") { skipDash++; continue; }
        if (raw === "") { skipEmpty++; continue; }
        const score = parseFloat(raw);
        if (isNaN(score)) continue;
        batch.push({
          school_id: SCHOOL_ID,
          student_id: dbUuid,
          component_id: compId,
          term_id: TERM_ID,
          subject_id: subjId,
          score,
        });
      }

      if (batch.length) {
        const ok = await apiPost(
          "/rest/v1/student_scores?on_conflict=student_id,component_id,term_id,subject_id",
          batch
        );
        if (ok) inserted += batch.length;
      }
    }

    console.log(
      tabName.padEnd(18) +
        String(Object.keys(studentMap).length).padEnd(5) +
        String(inserted).padEnd(10) +
        String(skipDash).padEnd(6) +
        String(skipEmpty)
    );
    grandTotal += inserted;
  }

  console.log("\n✅ GRAND TOTAL:", grandTotal, "scores");
  console.log("School:", school.name);
  console.log("Term:", targetTerm);
}

main().catch((e) => {
  console.error("FATAL:", e.message);
  process.exit(1);
});
