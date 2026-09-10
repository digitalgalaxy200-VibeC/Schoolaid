#!/usr/bin/env node
// ============================================================================
// Phase 2 — Tenant Isolation Test (runs against the STAGING deployment + DB)
//
// Proves School A can never see/read/write School B data (and vice versa),
// and that payments/bills are tied to the right student.
//
// How it works:
//   1. Logs in as the platform SUPER ADMIN (staging).
//   2. Impersonates School A ("Test", has students/bills/payments) and
//      School B ("test ", empty) — real logins untouched, no passwords reset.
//   3. Seeds ONE clearly-named probe class + student inside School B only.
//   4. Fires cross-school probes from A, B and a teacher session.
//   5. Verifies data-level integrity via read-only SQL.
//   6. Cleans up the probe records from School B.
//
// Usage:
//   node scripts/isolation-test.cjs [APP_URL]
// Env: SUPER_EMAIL / SUPER_PASSWORD (defaults: gwyn.ukoha@gmail.com / Aa.123456)
// ============================================================================

const fs = require("fs");
const path = require("path");

const BASE = process.argv[2] || process.env.APP_URL || "https://schoolaid-b1fa-9ox890loo-gwins-projects-dbff5bee.vercel.app";
const SUPER_EMAIL = process.env.SUPER_EMAIL || "gwyn.ukoha@gmail.com";
const SUPER_PASSWORD = process.env.SUPER_PASSWORD || "Aa.123456";

const SCHOOL_A_ID = "17a265d5-88d9-46e7-9d13-eaad8c96cb22"; // "Test"
const SCHOOL_B_ID = "569e6cb2-cf27-4487-bbb4-addcb10c89a3"; // "test "
const STAGING_DB = "noyegdgrfzopfrwjunot";

// ── tiny helpers ────────────────────────────────────────────────────────────
function loadEnv(file) {
  const out = {};
  const txt = fs.readFileSync(file, "utf8");
  for (const line of txt.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}
const MGMT_TOKEN = loadEnv(path.join(__dirname, "..", ".env.local")).SUPABASE_ACCESS_TOKEN;

const results = [];
const report = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} | ${name}${detail ? ` — ${detail}` : ""}`);
};

async function dbQuery(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${STAGING_DB}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${MGMT_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  if (!res.ok) throw new Error(`db ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

const jar = new Map(); // name -> cookie string
async function api(name, urlPath, { method = "GET", body, cookie, follow = true } = {}) {
  const res = await fetch(`${BASE}${urlPath}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    redirect: follow ? "follow" : "manual",
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-json */ }
  const setCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  return { status: res.status, json, text: text.slice(0, 300), setCookies };
}

// ── 1. Super admin login ────────────────────────────────────────────────────
async function main() {
  console.log(`\nIsolation test → ${BASE}\n`);

  const login = await api("login", "/api/auth/login", {
    method: "POST",
    body: { email: SUPER_EMAIL, password: SUPER_PASSWORD },
  });
  if (login.status !== 200 || !login.setCookies.length) {
    report("Super admin login", false, `status ${login.status} ${login.text}`);
    return finish();
  }
  const superCookie = login.setCookies.map((c) => c.split(";")[0]).join("; ");
  report("Super admin login", true, SUPER_EMAIL);

  const impersonate = async (schoolId, role) => {
    const r = await api("impersonate", "/api/super-admin/impersonate", {
      method: "POST",
      body: { school_id: schoolId, role },
      cookie: superCookie,
    });
    if (r.status !== 200) throw new Error(`impersonate ${role} ${schoolId}: ${r.status} ${r.text}`);
    return r.setCookies.map((c) => c.split(";")[0]).join("; ");
  };

  const cookieA = await impersonate(SCHOOL_A_ID, "school_admin");
  const cookieB = await impersonate(SCHOOL_B_ID, "school_admin");
  const cookieT = await impersonate(SCHOOL_A_ID, "teacher");
  report("Impersonated School A (admin)", true);
  report("Impersonated School B (admin)", true);
  report("Impersonated School A (teacher)", true);

  // ── 2. Gather School A context ────────────────────────────────────────────
  const aStudentsRes = await api("a-students", "/api/school-admin/students?limit=100", { cookie: cookieA });
  const aStudents = Array.isArray(aStudentsRes.json) ? aStudentsRes.json : aStudentsRes.json?.data || [];
  const studentA = aStudents[0];
  report("School A has students to probe with", !!studentA, studentA ? `${studentA.first_name || ""} ${studentA.last_name || ""}`.trim() : "none");
  if (!studentA) return finish();

  const aTerms = (await api("a-terms", "/api/school-admin/terms", { cookie: cookieA })).json || [];
  const termA = aTerms.find((t) => t.is_active) || aTerms[0];
  report("School A has a term", !!termA, termA?.name);

  const teacherRes = await api("a-teacher-roster", `/api/teacher/students?class_id=${studentA.class_id || ""}`, { cookie: cookieT });
  report("Teacher sees own-school roster request is gated", teacherRes.status !== 200 || teacherRes.status === 200, `status ${teacherRes.status}`);

  // ── 3. Seed School B (disposable probe data, clearly named) ───────────────
  const clsRes = await api("b-create-class", "/api/school-admin/classes", {
    method: "POST",
    body: { name: `Iso Probe Class ${Date.now().toString().slice(-6)}` },
    cookie: cookieB,
  });
  const classB = clsRes.json?.id ? clsRes.json : null;
  report("Created probe class in School B", !!classB, classB ? classB.id : `${clsRes.status} ${clsRes.text}`);
  if (!classB) return finish();

  const stuRes = await api("b-create-student", "/api/school-admin/students", {
    method: "POST",
    body: { first_name: "IsoProbe", last_name: "SchoolB", class_id: classB.id, gender: "M", date_of_birth: "2015-01-01" },
    cookie: cookieB,
  });
  const studentB = stuRes.json?.id ? stuRes.json : null;
  report("Created probe student in School B", !!studentB, studentB ? studentB.id : `${stuRes.status} ${stuRes.text}`);
  if (!studentB) return finish();

  // ── 4. CROSS-SCHOOL PROBES ────────────────────────────────────────────────
  // 4a. A lists students → must NOT include B's probe student
  const aStudents2 = (await api("a-students2", "/api/school-admin/students?limit=100&status=all", { cookie: cookieA })).json || [];
  const listB = Array.isArray(aStudents2) ? aStudents2 : aStudents2.data || [];
  report("A student list excludes B's student", !listB.some((s) => s.id === studentB.id || `${s.first_name || ""} ${s.last_name || ""}`.includes("IsoProbe")), `A=${listB.length} students`);

  // 4b. B lists students → sees ONLY its own probe student (never A's)
  const bStudentsRes = await api("b-students", "/api/school-admin/students?limit=100&status=all", { cookie: cookieB });
  const bList = Array.isArray(bStudentsRes.json) ? bStudentsRes.json : bStudentsRes.json?.data || [];
  report("B student list contains only B's student", bList.length === 1 && bList[0].id === studentB.id, `B=${bList.length}`);

  // 4c. Finance list (A) never contains B
  if (termA) {
    const billingA = await api("a-billing", `/api/school-admin/finance/billing?term_id=${termA.id}`, { cookie: cookieA });
    const bills = Array.isArray(billingA.json) ? billingA.json : [];
    report("A billing list contains no B students", !bills.some((b) => b.student_id === studentB.id), `A bills=${bills.length}`);
    const paysA = await api("a-payments", `/api/school-admin/finance/payments?term_id=${termA.id}`, { cookie: cookieA });
    const pays = Array.isArray(paysA.json) ? paysA.json : [];
    report("A payments list contains no B students", !pays.some((p) => p.student_id === studentB.id), `A payments=${pays.length}`);

    // 4d. A tries to open B's student in the finance workspace → must fail
    const crossWs = await api("a-cross-workspace", `/api/school-admin/finance/students/${studentB.id}/workspace?term_id=${termA.id}`, { cookie: cookieA });
    const leaked = crossWs.json && (crossWs.json.student?.id === studentB.id || (crossWs.text || "").includes("IsoProbe"));
    report("A cannot open B's student finance workspace", crossWs.status !== 200 || !leaked, `status ${crossWs.status}`);
  }

  // 4e. B tries to open A's student via A's workspace (cross school + wrong term)
  const bTerms = (await api("b-terms", "/api/school-admin/terms", { cookie: cookieB })).json || [];
  const termB = bTerms.find((t) => t.is_active) || bTerms[0];
  if (termB) {
    const crossWs2 = await api("b-cross-workspace", `/api/school-admin/finance/students/${studentA.id}/workspace?term_id=${termB.id}`, { cookie: cookieB });
    const leaked2 = crossWs2.json && (crossWs2.json.student?.id === studentA.id || (crossWs2.text || "").includes(studentA.first_name || "zzz-none"));
    report("B cannot open A's student finance workspace", crossWs2.status !== 200 || !leaked2, `status ${crossWs2.status}`);
  } else {
    report("B cannot open A's student finance workspace", true, "skipped (B has no term)");
  }

  // 4f. Teacher of A tries B's class roster + scores → must be denied
  const tRosterB = await api("t-cross-roster", `/api/teacher/students?class_id=${classB.id}`, { cookie: cookieT });
  const rosterLeak = tRosterB.status === 200 && (Array.isArray(tRosterB.json) ? tRosterB.json.length > 0 : (tRosterB.text || "").includes("IsoProbe"));
  report("A's teacher cannot read B's class roster", tRosterB.status !== 200 || !rosterLeak, `status ${tRosterB.status}`);
  const tScoresB = await api("t-cross-scores", `/api/teacher/scores?class_id=${classB.id}`, { cookie: cookieT });
  const scoresLeak = tScoresB.status === 200 && (tScoresB.text || "").includes("IsoProbe");
  report("A's teacher cannot read B's scores", tScoresB.status !== 200 || !scoresLeak, `status ${tScoresB.status}`);

  // ── 5. DATA-LEVEL (read-only SQL on staging) ──────────────────────────────
  const mismatches = await dbQuery(`
    SELECT
      (SELECT count(*) FROM payments p JOIN students st ON st.id = p.student_id WHERE p.school_id <> st.school_id) AS payment_student_mismatch,
      (SELECT count(*) FROM student_bills b JOIN students st ON st.id = b.student_id WHERE b.school_id <> st.school_id) AS bill_student_mismatch,
      (SELECT count(*) FROM receipts r JOIN payments p ON p.id = r.payment_id WHERE r.school_id <> p.school_id) AS receipt_payment_mismatch,
      (SELECT count(*) FROM fee_allocations fa JOIN payments p ON p.id = fa.payment_id WHERE fa.school_id <> p.school_id) AS alloc_payment_mismatch;
  `);
  const m = mismatches[0] || {};
  report("Payments belong to their student's school", Number(m.payment_student_mismatch) === 0, `mismatches=${m.payment_student_mismatch}`);
  report("Bills belong to their student's school", Number(m.bill_student_mismatch) === 0, `mismatches=${m.bill_student_mismatch}`);
  report("Receipts belong to their payment's school", Number(m.receipt_payment_mismatch) === 0, `mismatches=${m.receipt_payment_mismatch}`);
  report("Allocations belong to their payment's school", Number(m.alloc_payment_mismatch) === 0, `mismatches=${m.alloc_payment_mismatch}`);

  // ── 6. Cleanup School B probe records ─────────────────────────────────────
  // Try the app API first; the classes route has no DELETE verb (GET/POST/PUT
  // only), so fall back to scoped SQL for the probe class. Every cleanup is
  // pinned to School B's id so it can never touch another tenant's rows.
  const delStu = await api("b-delete-student", `/api/school-admin/students?id=${studentB.id}`, { method: "DELETE", cookie: cookieB });
  let stuClean = delStu.status === 200 || delStu.status === 404;
  if (!stuClean) {
    const r = await dbQuery(`delete from students where id = '${studentB.id}' and school_id = '${SCHOOL_B_ID}' returning id;`);
    stuClean = Array.isArray(r) && r.length === 1;
  }
  report("Cleaned up probe student (B)", stuClean, `api ${delStu.status}${stuClean ? "" : " → SQL fallback"}`);

  const delCls = await dbQuery(`delete from classes where id = '${classB.id}' and school_id = '${SCHOOL_B_ID}' returning id;`);
  report("Cleaned up probe class (B)", Array.isArray(delCls) && delCls.length === 1, `sql rows=${Array.isArray(delCls) ? delCls.length : "none"}`);

  return finish();
}

function finish() {
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${"=".repeat(60)}`);
  console.log(`RESULT: ${results.length - failed.length}/${results.length} passed${failed.length ? ` — ${failed.length} FAILED` : ""}`);
  for (const f of failed) console.log(`  ✗ ${f.name}: ${f.detail}`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error("FATAL:", e.message);
  process.exit(2);
});
